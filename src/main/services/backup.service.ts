import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type DatabaseType from 'better-sqlite3'

export interface BackupDialogs {
  chooseExportPath(): Promise<string | null>
  chooseRestorePath(): Promise<string | null>
  chooseCsvPath(): Promise<string | null>
}

import type { SecureFileStore } from './secure-file-store'

interface LegacyManifest {
  format: 'jobflow-backup'
  version: 1
  schemaVersion: number
  createdAt: string
  files: Array<{ path: string; sha256: string }>
}
interface BackupManifest {
  format: 'jobflow-backup'
  version: 2
  schemaVersion: number
  createdAt: string
  metadataFile: string
  metadataSha256: string
  payloads: Array<{ id: string; sha256: string }>
}
interface BackupEntry {
  id: string
  path: string
}
const databaseName = 'jobflow.sqlite'
const resumePath = 'files/resumes'
const exportStagingName = '.backup-export-staging'
const maxManifestBytes = 1024 * 1024
const maxMetadataBytes = 8 * 1024 * 1024
const maxDatabaseBytes = 256 * 1024 * 1024
const maxResumeBytes = 25 * 1024 * 1024
const maxBackupBytes = 1024 * 1024 * 1024
const maxBackupEntries = 1000
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex')

function isSafeRelativePath(value: string): boolean {
  return (
    Boolean(value) &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).some((segment) => !segment || segment === '.' || segment === '..')
  )
}

async function readSafeFile(
  root: string,
  relativePath: string,
  maxBytes = maxDatabaseBytes,
): Promise<Buffer> {
  if (!isSafeRelativePath(relativePath)) throw new Error('备份清单包含越界路径')
  let current = root
  const segments = relativePath.split(/[\\/]/)
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink() || (index === segments.length - 1 ? !stats.isFile() : !stats.isDirectory()))
      throw new Error('备份文件类型无效')
    if (index === segments.length - 1 && stats.size > maxBytes) throw new Error('备份文件超过允许大小')
  }
  const resolved = path.resolve(root, relativePath)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('备份清单包含越界路径')
  return fs.readFile(current)
}

async function collectFiles(root: string, prefix = ''): Promise<string[]> {
  const result: string[] = []
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix.replace(/\\/g, '/'), entry.name)
    if (entry.isSymbolicLink()) throw new Error('备份目录包含不支持的符号链接')
    if (entry.isDirectory()) result.push(...(await collectFiles(root, relative)))
    else if (entry.isFile()) result.push(relative)
    else throw new Error('备份目录包含不支持的文件类型')
  }
  return result
}

async function copyTree(source: string, destination: string, budget = { bytes: 0, files: 0 }): Promise<void> {
  try {
    await fs.access(source)
  } catch {
    return
  }
  const stats = await fs.lstat(source)
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('简历目录无效，已停止备份')
  await fs.mkdir(destination, { recursive: true })
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isSymbolicLink()) throw new Error('简历目录包含不支持的符号链接')
    if (entry.isDirectory()) await copyTree(from, to, budget)
    else if (entry.isFile()) {
      const stats = await fs.lstat(from)
      if (stats.size > maxResumeBytes) throw new Error('简历文件超过备份大小限制')
      budget.bytes += stats.size
      budget.files += 1
      if (budget.bytes > maxBackupBytes || budget.files > maxBackupEntries)
        throw new Error('简历目录超过备份容量限制')
      await fs.copyFile(from, to)
    } else throw new Error('简历目录包含不支持的文件类型')
  }
}

async function writeEncryptedDatabaseSnapshot(
  database: DatabaseType.Database,
  destination: string,
  store: SecureFileStore,
): Promise<void> {
  const plaintext = `${destination}.plain-${randomUUID()}`
  try {
    await database.backup(plaintext)
    const encrypted = await store.encrypt(await fs.readFile(plaintext))
    await fs.writeFile(destination, encrypted, { flag: 'wx', mode: 0o600 })
  } finally {
    await fs.rm(plaintext, { force: true })
  }
}

function schemaVersion(db: DatabaseType.Database): number {
  return (
    db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations').get() as {
      version: number
    }
  ).version
}

async function writeEncryptedPackage(
  database: DatabaseType.Database,
  dataDirectory: string,
  destination: string,
  store: SecureFileStore,
): Promise<void> {
  const temporary = `${destination}.tmp-${randomUUID()}`
  const stagingRoot = path.join(dataDirectory, exportStagingName)
  const plaintext = path.join(stagingRoot, randomUUID())
  await fs.mkdir(path.dirname(destination), { recursive: true })
  try {
    await fs.mkdir(plaintext, { recursive: true })
    const snapshotPath = path.join(plaintext, databaseName)
    await database.backup(snapshotPath)
    const snapshot = new Database(snapshotPath)
    let version: number
    try {
      if (snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='browser_history'").get())
        snapshot.exec('DELETE FROM browser_history')
      if (snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_settings'").get())
        snapshot.prepare("DELETE FROM app_settings WHERE key='browser_tab_state'").run()
      version = schemaVersion(snapshot)
    } finally {
      snapshot.close()
    }
    await copyTree(path.join(dataDirectory, resumePath), path.join(plaintext, resumePath))
    const files = await collectFiles(plaintext)
    if (files.length > maxBackupEntries) throw new Error('备份包含过多文件，已停止导出')
    let totalBytes = 0
    for (const relativePath of files) {
      const stats = await fs.stat(path.join(plaintext, relativePath))
      const limit = relativePath === databaseName ? maxDatabaseBytes : maxResumeBytes
      if (stats.size > limit) throw new Error(`备份文件超过允许大小：${relativePath}`)
      totalBytes += stats.size
      if (totalBytes > maxBackupBytes) throw new Error('备份总大小超过允许上限，已停止导出')
    }
    await fs.mkdir(path.join(temporary, 'payloads'), { recursive: true })
    const entries: BackupEntry[] = []
    const payloads: BackupManifest['payloads'] = []
    for (const relativePath of files) {
      const id = randomUUID()
      const encrypted = await store.encrypt(await fs.readFile(path.join(plaintext, relativePath)))
      await fs.writeFile(path.join(temporary, 'payloads', `${id}.jfr`), encrypted, { flag: 'wx' })
      entries.push({ id, path: relativePath })
      payloads.push({ id, sha256: digest(encrypted) })
    }
    const metadataFile = 'metadata.jfr'
    const encryptedMetadata = await store.encrypt(Buffer.from(JSON.stringify({ entries }), 'utf8'))
    await fs.writeFile(path.join(temporary, metadataFile), encryptedMetadata, { flag: 'wx' })
    const manifest: BackupManifest = {
      format: 'jobflow-backup',
      version: 2,
      schemaVersion: version,
      createdAt: new Date().toISOString(),
      metadataFile,
      metadataSha256: digest(encryptedMetadata),
      payloads,
    }
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await fs.rename(temporary, destination)
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true })
    throw error
  } finally {
    await fs.rm(plaintext, { recursive: true, force: true })
    const remaining = await fs.readdir(stagingRoot).catch(() => [])
    if (remaining.length === 0) await fs.rm(stagingRoot, { recursive: true, force: true })
  }
}

export async function cleanupBackupExportStaging(dataDirectory: string): Promise<void> {
  const stagingDirectory = path.join(dataDirectory, exportStagingName)
  const stats = await fs.lstat(stagingDirectory).catch(() => undefined)
  if (!stats) return
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('备份临时目录无效，已停止启动')
  await fs.rm(stagingDirectory, { recursive: true, force: false })
}

async function parseManifest(source: string): Promise<BackupManifest | LegacyManifest> {
  const root = await fs.lstat(source)
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error('备份路径无效')
  try {
    const contents = await readSafeFile(source, 'manifest.json', maxManifestBytes)
    const parsed = JSON.parse(contents.toString('utf8')) as BackupManifest | LegacyManifest
    if (
      parsed.format !== 'jobflow-backup' ||
      !Number.isInteger(parsed.schemaVersion) ||
      parsed.schemaVersion < 0
    )
      throw new Error('此备份版本不受支持')
    if (parsed.version === 1 && Array.isArray(parsed.files)) return parsed
    if (
      parsed.version === 2 &&
      parsed.metadataFile === 'metadata.jfr' &&
      /^[a-f0-9]{64}$/.test(parsed.metadataSha256) &&
      Array.isArray(parsed.payloads)
    )
      return parsed
    throw new Error('此备份版本不受支持')
  } catch (error) {
    if (error instanceof Error && error.message === '此备份版本不受支持') throw error
    throw new Error('备份清单无法读取，文件可能已损坏')
  }
}

async function validateV2(
  source: string,
  manifest: BackupManifest,
  supportedVersion: number,
  store: SecureFileStore,
): Promise<BackupEntry[]> {
  if (manifest.schemaVersion > supportedVersion)
    throw new Error('此备份由更新版本的 JobFlow 创建，请先更新应用后再恢复')
  if (manifest.payloads.length > maxBackupEntries) throw new Error('备份清单内容无效')
  const metadataCiphertext = await readSafeFile(source, manifest.metadataFile, maxMetadataBytes)
  if (digest(metadataCiphertext) !== manifest.metadataSha256)
    throw new Error('备份文件校验失败：metadata.jfr')
  let metadata: { entries?: BackupEntry[] }
  try {
    metadata = JSON.parse((await store.decrypt(metadataCiphertext)).toString('utf8')) as {
      entries?: BackupEntry[]
    }
  } catch {
    throw new Error('备份资料无法解密或已损坏，未改动当前数据')
  }
  if (!Array.isArray(metadata.entries) || metadata.entries.length > maxBackupEntries)
    throw new Error('备份清单内容无效')
  const payloadById = new Map(manifest.payloads.map((payload) => [payload.id, payload]))
  if (payloadById.size !== manifest.payloads.length || metadata.entries.length !== payloadById.size)
    throw new Error('备份清单内容无效')
  const paths = new Set<string>()
  let totalBytes = 0
  for (const entry of metadata.entries) {
    if (
      !entry ||
      !/^[0-9a-f-]{36}$/i.test(entry.id) ||
      !isSafeRelativePath(entry.path) ||
      paths.has(entry.path)
    )
      throw new Error('备份清单内容无效')
    paths.add(entry.path)
    const payload = payloadById.get(entry.id)
    if (!payload || !/^[a-f0-9]{64}$/.test(payload.sha256)) throw new Error('备份清单内容无效')
    const maxBytes = entry.path === databaseName ? maxDatabaseBytes + 1024 : maxResumeBytes + 1024
    const encrypted = await readSafeFile(source, `payloads/${entry.id}.jfr`, maxBytes)
    totalBytes += encrypted.byteLength
    if (totalBytes > maxBackupBytes + maxBackupEntries * 1024) throw new Error('备份总大小超过允许上限')
    if (digest(encrypted) !== payload.sha256) throw new Error(`备份文件校验失败：${entry.id}`)
  }
  if (!paths.has(databaseName)) throw new Error('备份中缺少岗位数据库')
  return metadata.entries
}

async function validateV1(source: string, manifest: LegacyManifest, supportedVersion: number): Promise<void> {
  if (manifest.schemaVersion > supportedVersion)
    throw new Error('此备份由更新版本的 JobFlow 创建，请先更新应用后再恢复')
  const declared = new Set<string>()
  let totalBytes = 0
  for (const file of manifest.files) {
    if (
      !file ||
      !isSafeRelativePath(file.path) ||
      declared.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('备份清单包含无效文件路径')
    declared.add(file.path)
    if (declared.size > maxBackupEntries) throw new Error('备份清单包含过多文件')
    const fileLimit = file.path === databaseName ? maxDatabaseBytes + 1024 : maxResumeBytes + 1024
    const bytes = await readSafeFile(source, file.path, fileLimit)
    totalBytes += bytes.byteLength
    if (totalBytes > maxBackupBytes) throw new Error('备份总大小超过允许上限')
    if (digest(bytes) !== file.sha256) throw new Error(`备份文件校验失败：${file.path}`)
  }
  if (!declared.has(databaseName)) throw new Error('备份中缺少岗位数据库')
}

function validateDatabase(databasePath: string, expectedVersion: number): void {
  let candidate: DatabaseType.Database | undefined
  try {
    candidate = new Database(databasePath, { readonly: true, fileMustExist: true })
    if ((candidate.pragma('quick_check') as Array<{ quick_check: string }>)[0]?.quick_check !== 'ok')
      throw new Error()
    if (
      (candidate.pragma('foreign_key_check') as unknown[]).length ||
      !candidate
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get() ||
      schemaVersion(candidate) !== expectedVersion
    )
      throw new Error()
  } catch {
    throw new Error('备份数据库无法通过完整性检查，未改动当前数据')
  } finally {
    candidate?.close()
  }
}

function csvCell(value: unknown): string {
  let cell = value == null ? '' : String(value)
  if (/^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`
  return `"${cell.replace(/"/g, '""')}"`
}

function csvDocument(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

async function writeCsvFolder(database: DatabaseType.Database, destination: string): Promise<void> {
  const temporary = `${destination}.tmp-${randomUUID()}`
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.mkdir(temporary)
  try {
    const datasets = [
      [
        'companies.csv',
        ['公司编号', '公司名称', '行业编号', '公司官网', '招聘官网', '备注', '创建时间', '更新时间'],
        'SELECT id,name,industry_id,website,careers_url,notes,created_at,updated_at FROM companies ORDER BY name',
      ],
      [
        'jobs.csv',
        [
          '岗位编号',
          '公司',
          '岗位名称',
          '部门',
          '城市',
          '招聘编号',
          '薪资',
          '阶段',
          '优先级',
          '置顶',
          '投递时间',
          '下一步行动',
          '行动时间',
          '创建时间',
          '更新时间',
        ],
        'SELECT j.id,c.name,j.title,j.department,j.city,j.job_code,j.salary,a.current_stage,a.priority,a.pinned,a.applied_at,a.next_action,a.next_action_at,j.created_at,j.updated_at FROM jobs j JOIN companies c ON c.id=j.company_id JOIN applications a ON a.job_id=j.id ORDER BY c.name,j.title',
      ],
      [
        'timeline.csv',
        ['公司', '岗位', '事件类型', '事件标题', '阶段', '时间', '渠道', '备注'],
        'SELECT c.name,j.title,e.type,e.title,e.stage,e.event_at,e.channel,e.notes FROM application_events e JOIN applications a ON a.id=e.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id ORDER BY e.event_at,e.created_at',
      ],
    ] as const
    for (const [name, headers, sql] of datasets) {
      const rows = (database.prepare(sql).all() as Array<Record<string, unknown>>).map((row) =>
        Object.values(row),
      )
      await fs.writeFile(path.join(temporary, name), csvDocument([...headers], rows), 'utf8')
    }
    await fs.rename(temporary, destination)
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export function createBackupService(
  database: DatabaseType.Database,
  dataDirectory: string,
  dialogs: BackupDialogs,
  options: {
    closeDatabase?: () => void
    secureFileStore: SecureFileStore
    prepareLegacyRestore?: (stagingDirectory: string) => Promise<void>
  },
) {
  const stageDirectory = path.join(dataDirectory, 'restore-staging')
  return {
    async exportFromDialog() {
      const destination = await dialogs.chooseExportPath()
      if (!destination) return { canceled: true }
      await writeEncryptedPackage(database, dataDirectory, destination, options.secureFileStore)
      return { canceled: false }
    },
    async restoreFromDialog() {
      const source = await dialogs.chooseRestorePath()
      if (!source) return { canceled: true, staged: false }
      const supportedVersion = schemaVersion(database)
      const manifest = await parseManifest(source)
      const entries =
        manifest.version === 2
          ? await validateV2(source, manifest, supportedVersion, options.secureFileStore)
          : (await validateV1(source, manifest, supportedVersion),
            manifest.files.map(({ path: entryPath }) => ({ path: entryPath, id: '' })))
      await fs.rm(stageDirectory, { recursive: true, force: true })
      await fs.mkdir(stageDirectory, { recursive: true })
      try {
        for (const entry of entries) {
          const destination = path.join(stageDirectory, entry.path)
          await fs.mkdir(path.dirname(destination), { recursive: true })
          const value =
            manifest.version === 2
              ? await options.secureFileStore.decrypt(await readSafeFile(source, `payloads/${entry.id}.jfr`))
              : await readSafeFile(source, entry.path)
          await fs.writeFile(destination, value, { flag: 'wx' })
        }
        if (manifest.version === 1) await options.prepareLegacyRestore?.(stageDirectory)
        validateDatabase(path.join(stageDirectory, databaseName), manifest.schemaVersion)
        return { canceled: false, staged: true }
      } catch (error) {
        await fs.rm(stageDirectory, { recursive: true, force: true })
        throw error
      }
    },
    async exportCsvFromDialog() {
      const destination = await dialogs.chooseCsvPath()
      if (!destination) return { canceled: true }
      await writeCsvFolder(database, destination)
      return { canceled: false }
    },
    async applyStagedRestore() {
      try {
        await fs.access(path.join(stageDirectory, databaseName))
      } catch {
        return { applied: false, error: '没有待应用的恢复数据', restartRequired: false }
      }
      const backupDirectory = path.join(
        dataDirectory,
        'backups',
        `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      )
      const rollbackDatabase = path.join(backupDirectory, `${databaseName}.jfr`)
      await fs.mkdir(backupDirectory, { recursive: true })
      await writeEncryptedDatabaseSnapshot(database, rollbackDatabase, options.secureFileStore)
      await copyTree(path.join(dataDirectory, resumePath), path.join(backupDirectory, resumePath))
      database.pragma('wal_checkpoint(TRUNCATE)')
      options.closeDatabase?.()
      const liveDatabase = path.join(dataDirectory, databaseName)
      const stagedDatabase = path.join(stageDirectory, databaseName)
      const liveResumes = path.join(dataDirectory, resumePath)
      const stagedResumes = path.join(stageDirectory, resumePath)
      const parkedDatabase = path.join(stageDirectory, 'previous.sqlite')
      try {
        await fs.rename(liveDatabase, parkedDatabase)
        await fs.rename(stagedDatabase, liveDatabase)
        await fs.rm(liveResumes, { recursive: true, force: true })
        try {
          await fs.rename(stagedResumes, liveResumes)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await fs.rm(stageDirectory, { recursive: true, force: true })
        return { applied: true as const, restartRequired: true }
      } catch (error) {
        await fs.rm(liveDatabase, { force: true })
        const restoredDatabase = await options.secureFileStore.decrypt(await fs.readFile(rollbackDatabase))
        await fs.writeFile(liveDatabase, restoredDatabase, { flag: 'wx', mode: 0o600 })
        await fs.rm(liveResumes, { recursive: true, force: true })
        try {
          await copyTree(path.join(backupDirectory, resumePath), liveResumes)
        } catch {
          /* rollback remains available under backups */
        }
        return {
          applied: false as const,
          error: error instanceof Error ? error.message : String(error),
          restartRequired: true,
        }
      }
    },
  }
}
