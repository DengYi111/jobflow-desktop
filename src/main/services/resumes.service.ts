import fs from 'node:fs/promises'
import { Transform } from 'node:stream'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { JobRepositories } from './jobs.service'
import type { SecretProtector } from '../security/protected-value'
import { protectValue, unprotectValue } from '../security/protected-value'
import type { SecureFileStore } from './secure-file-store'

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}
export type ResumeDialog = (options: {
  title: string
  properties: ['openFile']
  filters: Array<{ name: string; extensions: string[] }>
}) => Promise<OpenDialogResult>
export type ResumeFileActions = {
  openPdf: (resumeId: string) => Promise<void>
  openExternal: (filePath: string) => Promise<void>
  showInFolder: (filePath: string) => void
}
export interface ResumeSecurity {
  protector: SecretProtector
  fileStore: SecureFileStore
}
export const MAX_RESUME_BYTES = 25 * 1024 * 1024
const allowedResumeExtensions = new Set(['.pdf', '.doc', '.docx'])

export function createByteLimitTransform(maxBytes: number): Transform {
  let bytesRead = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesRead += chunk.byteLength
      if (bytesRead > maxBytes) {
        callback(new Error(maxBytes === MAX_RESUME_BYTES ? '简历文件不能超过 25 MB' : '简历文件超出大小限制'))
        return
      }
      callback(null, chunk)
    },
  })
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

export function createResumesService(
  repositories: JobRepositories,
  userDataDirectory: string,
  showOpenDialog: ResumeDialog,
  fileActions: ResumeFileActions = {
    openPdf: async () => {
      throw new Error('PDF 预览不可用')
    },
    openExternal: async () => {
      throw new Error('系统文件打开不可用')
    },
    showInFolder: () => {
      throw new Error('文件夹定位不可用')
    },
  },
  security?: ResumeSecurity,
) {
  const resumeDirectory = path.resolve(userDataDirectory, 'files', 'resumes')
  const storageDirectory = path.join(resumeDirectory, 'storage')
  const inboxDirectory = path.join(resumeDirectory, 'inbox')

  function requireSecurity(): ResumeSecurity {
    if (!security) throw new Error('简历安全存储尚未配置')
    return security
  }

  async function ensureResumeDirectories() {
    await fs.mkdir(storageDirectory, { recursive: true })
    await fs.mkdir(inboxDirectory, { recursive: true })
    const dataRoot = await fs.realpath(userDataDirectory)
    const realRoot = await fs.realpath(resumeDirectory)
    const rootStat = await fs.lstat(resumeDirectory)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !isInside(dataRoot, realRoot))
      throw new Error('简历存储目录无效')
    return realRoot
  }

  async function readProtectedRow(row: Record<string, unknown>) {
    const protector = requireSecurity().protector
    const [name, originalName, notes] = await Promise.all([
      unprotectValue(String(row.name ?? ''), protector),
      unprotectValue(String(row.originalName ?? ''), protector),
      unprotectValue(row.notes == null ? null : String(row.notes), protector),
    ])
    return { ...row, name: name.value, originalName: originalName.value, notes: notes.value }
  }

  async function createProtected(input: {
    id: string
    name: string
    relativePath: string
    originalName: string
    notes?: string | null
  }) {
    const protector = requireSecurity().protector
    const [name, originalName, notes] = await Promise.all([
      protectValue(input.name, protector),
      protectValue(input.originalName, protector),
      protectValue(input.notes, protector),
    ])
    repositories.resumes.create({ ...input, name: name!, originalName: originalName!, notes })
  }

  async function readResumeBytes(
    id: string,
  ): Promise<{ resume: Record<string, unknown>; bytes: Buffer; extension: string }> {
    const row = repositories.resumes.get(id) as Record<string, unknown> | undefined
    if (!row) throw new Error('没有找到对应简历')
    const resume = await readProtectedRow(row)
    const root = await ensureResumeDirectories()
    const filePath = path.resolve(userDataDirectory, String(row.relativePath))
    const relative = path.relative(root, filePath)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('简历文件路径无效')
    const stat = await fs.lstat(filePath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RESUME_BYTES + 16384)
      throw new Error('简历文件不可用')
    const realFile = await fs.realpath(filePath)
    if (!isInside(root, realFile)) throw new Error('简历文件路径无效')
    const storedBytes = await fs.readFile(realFile)
    const bytes = String(row.relativePath).toLowerCase().endsWith('.jfr')
      ? await requireSecurity().fileStore.decrypt(storedBytes)
      : storedBytes
    if (bytes.length > MAX_RESUME_BYTES) throw new Error('简历文件不能超过 25 MB')
    return { resume, bytes, extension: path.extname(String(resume.originalName)).toLocaleLowerCase() }
  }

  async function savePlaintext(source: Buffer, id: string, extension: string): Promise<string> {
    if (source.length > MAX_RESUME_BYTES) throw new Error('简历文件不能超过 25 MB')
    if (!allowedResumeExtensions.has(extension)) throw new Error('仅支持 PDF、DOC 或 DOCX 简历')
    const relativePath = path.join('files', 'resumes', 'storage', `${id}${extension}`)
    const destination = path.resolve(userDataDirectory, relativePath)
    const root = await ensureResumeDirectories()
    if (!isInside(root, destination)) throw new Error('简历文件路径无效')
    const temporary = `${destination}.tmp-${randomUUID()}`
    try {
      await fs.writeFile(temporary, source, { flag: 'wx', mode: 0o600 })
      await fs.rename(temporary, destination)
      return relativePath
    } catch (error) {
      await fs.rm(temporary, { force: true })
      throw error
    }
  }

  async function importInboxFile(fullPath: string, fileName: string): Promise<void> {
    const extension = path.extname(fileName).toLocaleLowerCase()
    if (!allowedResumeExtensions.has(extension)) return
    try {
      const before = await fs.lstat(fullPath)
      if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_RESUME_BYTES) return
      const realRoot = await ensureResumeDirectories()
      if (!isInside(realRoot, await fs.realpath(fullPath))) return
      const bytes = await fs.readFile(fullPath)
      const after = await fs.lstat(fullPath)
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size)
        return
      const id = randomUUID()
      const relativePath = await savePlaintext(bytes, id, extension)
      try {
        await createProtected({ id, name: path.parse(fileName).name, originalName: fileName, relativePath })
        await fs.rm(fullPath, { force: true })
      } catch (error) {
        await fs.rm(path.resolve(userDataDirectory, relativePath), { force: true })
        throw error
      }
    } catch {
      // A file may still be copying or may disappear while the folder is being scanned.
    }
  }

  async function registerDroppedFiles() {
    await ensureResumeDirectories()
    for (const directory of [resumeDirectory, inboxDirectory]) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith('.') || entry.name.endsWith('.jfr')) continue
        await importInboxFile(path.join(directory, entry.name), entry.name)
      }
    }
  }

  async function migrateStorage() {
    const rows = repositories.resumes.listAll() as Array<Record<string, unknown>>
    for (const row of rows) {
      const relativePath = String(row.relativePath)
      const id = String(row.id)
      const resume = await readProtectedRow(row)
      const extension = path.extname(String(resume.originalName)).toLocaleLowerCase()
      if (!allowedResumeExtensions.has(extension)) throw new Error('旧版简历格式无法验证，已停止安全迁移')
      const realRoot = await ensureResumeDirectories()
      const source = path.resolve(userDataDirectory, relativePath)
      const destinationRelative = path.join('files', 'resumes', 'storage', `${id}${extension}`)
      const destination = path.resolve(userDataDirectory, destinationRelative)
      if (!isInside(realRoot, source) || !isInside(realRoot, destination))
        throw new Error('简历文件路径无效，已停止安全迁移')

      if (path.resolve(source) === path.resolve(destination)) {
        const stat = await fs.lstat(source)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RESUME_BYTES)
          throw new Error('简历文件无法验证，已停止安全迁移')
        continue
      }

      const [sourceStat, destinationStat] = await Promise.all([
        fs.lstat(source).catch(() => undefined),
        fs.lstat(destination).catch(() => undefined),
      ])
      for (const stat of [sourceStat, destinationStat]) {
        if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RESUME_BYTES + 16384))
          throw new Error('旧版简历文件无法验证，已停止安全迁移')
      }

      const sourceIsEncrypted = relativePath.toLocaleLowerCase().endsWith('.jfr')
      let sourceBytes: Buffer | undefined
      if (sourceStat) {
        const storedBytes = await fs.readFile(source)
        sourceBytes = sourceIsEncrypted ? await requireSecurity().fileStore.decrypt(storedBytes) : storedBytes
      }
      if (!sourceBytes && !destinationStat) throw new Error(`简历文件不存在：${resume.originalName}`)
      if (sourceBytes?.length && sourceBytes.length > MAX_RESUME_BYTES)
        throw new Error('旧版简历文件无法验证，已停止安全迁移')

      if (destinationStat) {
        if (sourceBytes && !(await fs.readFile(destination)).equals(sourceBytes))
          throw new Error('简历迁移校验失败，原始文件仍保留')
      } else if (sourceBytes) {
        await savePlaintext(sourceBytes, id, extension)
        if (!(await fs.readFile(destination)).equals(sourceBytes))
          throw new Error('简历迁移校验失败，原始文件仍保留')
      }

      if (sourceStat && path.resolve(source) !== path.resolve(destination))
        await fs.rm(source, { force: true })
      repositories.resumes.updateRelativePath(id, destinationRelative)
    }
    await registerDroppedFiles()
  }

  return {
    async migrateStorage() {
      await migrateStorage()
    },
    async list() {
      await registerDroppedFiles()
      return Promise.all(
        (repositories.resumes.list() as Array<Record<string, unknown>>).map(readProtectedRow),
      )
    },
    async importFromDialog(input: { name?: string } = {}) {
      const result = await showOpenDialog({
        title: '导入简历版本',
        properties: ['openFile'],
        filters: [{ name: '简历文件', extensions: ['pdf', 'doc', 'docx'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      if (result.filePaths.length !== 1) throw new Error('一次只能导入一个文件')
      const sourcePath = result.filePaths[0]
      const originalName = path.basename(sourcePath)
      const extension = path.extname(originalName).toLocaleLowerCase()
      if (!allowedResumeExtensions.has(extension)) throw new Error('仅支持 PDF、DOC 或 DOCX 简历')
      const source = await fs.open(sourcePath, 'r')
      let bytes: Buffer
      try {
        const stats = await source.stat()
        if (!stats.isFile()) throw new Error('所选路径不是普通文件')
        if (stats.size > MAX_RESUME_BYTES) throw new Error('简历文件不能超过 25 MB')
        bytes = await source.readFile()
      } finally {
        await source.close()
      }
      const id = randomUUID()
      const relativePath = await savePlaintext(bytes, id, extension)
      try {
        await createProtected({
          id,
          name: input.name?.trim() || path.parse(originalName).name,
          relativePath,
          originalName,
        })
        return await readProtectedRow(repositories.resumes.get(id) as Record<string, unknown>)
      } catch (error) {
        await fs.rm(path.resolve(userDataDirectory, relativePath), { force: true })
        throw error
      }
    },
    async open(id: string) {
      const { resume, extension } = await readResumeBytes(id)
      if (extension === '.pdf') {
        await fileActions.openPdf(id)
        return
      }
      await fileActions.openExternal(path.resolve(userDataDirectory, String(resume.relativePath)))
    },
    async readPdf(id: string) {
      const { resume, bytes, extension } = await readResumeBytes(id)
      if (extension !== '.pdf') throw new Error('该简历不是 PDF 文件')
      if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-')
        throw new Error('PDF 文件损坏或格式无效')
      return { name: String(resume.originalName), base64: bytes.toString('base64') }
    },
    async showInFolder(id: string) {
      const row = repositories.resumes.get(id) as Record<string, unknown> | undefined
      if (!row) throw new Error('没有找到对应简历')
      const root = await ensureResumeDirectories()
      const filePath = path.resolve(userDataDirectory, String(row.relativePath))
      if (!isInside(root, filePath)) throw new Error('简历文件路径无效')
      const stat = await fs.lstat(filePath)
      const realPath = await fs.realpath(filePath)
      if (!stat.isFile() || stat.isSymbolicLink() || !isInside(root, realPath))
        throw new Error('简历文件不可用')
      fileActions.showInFolder(filePath)
    },
  }
}
