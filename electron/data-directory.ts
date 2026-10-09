import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

export function resolveJobFlowDataDirectory(
  packaged: boolean,
  executablePath: string,
  developmentDirectory = 'E:\\JobFlow\\Data',
): string {
  if (!packaged) return developmentDirectory
  const installationDirectory = path.dirname(executablePath)
  return path.resolve(installationDirectory, '..', 'Data')
}

export interface DataDirectoryPreparation {
  migrated: boolean
  legacyDirectoryToRemove?: string
}

const MIGRATION_SELECTION_MARKER = '.legacy-userdata-migration-selected'
const MIGRATION_COMPLETE_MARKER = '.legacy-userdata-migration-complete'

interface DirectoryEntry {
  kind: 'directory' | 'file'
  relativePath: string
  sha256?: string
}

function snapshotDirectory(directory: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = []
  const visit = (currentDirectory: string, relativeDirectory: string) => {
    for (const name of readdirSync(currentDirectory).sort()) {
      const absolutePath = path.join(currentDirectory, name)
      const relativePath = path.join(relativeDirectory, name)
      const stats = lstatSync(absolutePath)
      if (stats.isDirectory()) {
        entries.push({ kind: 'directory', relativePath })
        visit(absolutePath, relativePath)
      } else if (stats.isFile()) {
        const digest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
        entries.push({ kind: 'file', relativePath, sha256: digest })
      } else {
        throw new Error(`旧数据目录中含有不支持的文件类型：${relativePath}`)
      }
    }
  }
  visit(directory, '')
  return entries
}

function isInside(parentDirectory: string, childDirectory: string): boolean {
  const relativePath = path.relative(parentDirectory, childDirectory)
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))
  )
}

function directoryIsEmpty(directory: string): boolean {
  return readdirSync(directory).length === 0
}

/**
 * Creates the persistent data directory and safely copies any prior Electron userData into it.
 * The original directory is intentionally left in place until the database opens successfully.
 */
export function prepareDataDirectory(
  targetDirectory: string,
  legacyDirectory: string,
): DataDirectoryPreparation {
  const target = path.resolve(targetDirectory)
  const legacy = path.resolve(legacyDirectory)
  if (target === legacy) return { migrated: false }
  if (isInside(target, legacy) || isInside(legacy, target)) {
    throw new Error('新旧数据目录存在包含关系，已停止迁移以避免误删数据。')
  }

  const legacyExists = existsSync(legacy)
  if (legacyExists && !statSync(legacy).isDirectory()) {
    throw new Error(`旧数据路径不是文件夹：${legacy}`)
  }
  const legacyEntries = legacyExists ? snapshotDirectory(legacy) : []
  mkdirSync(path.dirname(target), { recursive: true })

  const targetExists = existsSync(target)
  if (targetExists && !statSync(target).isDirectory()) {
    throw new Error(`JobFlow 数据路径不是文件夹：${target}`)
  }

  // A marker is only written after the chosen database opens successfully. It also lets a later
  // launch retry cleaning a partially removed, locked legacy directory without treating it as a
  // competing database and blocking the app.
  if (
    targetExists &&
    (existsSync(path.join(target, MIGRATION_SELECTION_MARKER)) ||
      existsSync(path.join(target, MIGRATION_COMPLETE_MARKER)))
  ) {
    return { migrated: false, legacyDirectoryToRemove: legacyExists ? legacy : undefined }
  }

  if (targetExists && !directoryIsEmpty(target) && legacyEntries.length > 0) {
    throw new Error(
      'E 盘数据目录和旧数据目录同时存在数据。为避免覆盖任一份记录，已停止启动；请先备份并确认要保留的数据。',
    )
  }

  const shouldMigrate =
    legacyExists && legacyEntries.length > 0 && (!targetExists || directoryIsEmpty(target))
  if (shouldMigrate) {
    const stagingDirectory = `${target}.migration-${process.pid}-${Date.now()}`
    try {
      cpSync(legacy, stagingDirectory, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
      })
      const stagedEntries = snapshotDirectory(stagingDirectory)
      if (JSON.stringify(stagedEntries) !== JSON.stringify(legacyEntries)) {
        throw new Error('复制后的文件校验未通过。')
      }

      if (targetExists) rmSync(target, { recursive: true, force: false })
      renameSync(stagingDirectory, target)
    } catch (error) {
      rmSync(stagingDirectory, { recursive: true, force: true })
      if (error instanceof Error && error.message.includes('同时存在数据')) throw error
      throw new Error(
        `复制旧数据到 ${target} 失败，旧数据仍保留在 ${legacy}。${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else if (!targetExists) {
    mkdirSync(target, { recursive: true })
  }

  return {
    migrated: shouldMigrate,
    legacyDirectoryToRemove: legacyExists ? legacy : undefined,
  }
}

export function markDataMigrationComplete(targetDirectory: string): void {
  const target = path.resolve(targetDirectory)
  writeFileSync(path.join(target, MIGRATION_COMPLETE_MARKER), 'JobFlow data migration completed\n', {
    flag: 'w',
  })
  rmSync(path.join(target, MIGRATION_SELECTION_MARKER), { force: true })
}

/** Records that an operator verified which copy of conflicting legacy data should be retained. */
export function markDataMigrationSourceSelected(targetDirectory: string): void {
  writeFileSync(
    path.join(path.resolve(targetDirectory), MIGRATION_SELECTION_MARKER),
    'JobFlow data source selected\n',
    { flag: 'w' },
  )
}

/** Remove only the dedicated legacy Electron userData directory after the new DB opened. */
export function removeLegacyDataDirectory(directory: string | undefined, targetDirectory: string): void {
  if (!directory) return
  const legacy = path.resolve(directory)
  const target = path.resolve(targetDirectory)
  if (legacy === target || isInside(legacy, target) || isInside(target, legacy)) {
    throw new Error('拒绝清理与当前数据目录重叠的旧目录。')
  }
  rmSync(legacy, { recursive: true, force: false })
}
