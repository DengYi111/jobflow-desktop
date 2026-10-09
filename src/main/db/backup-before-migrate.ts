import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SecureFileStore } from '../services/secure-file-store'

export async function cleanupMigrationBackupStaging(backupDirectory: string): Promise<void> {
  const stagingDirectory = path.join(backupDirectory, '.migration-backup-staging')
  const stats = await fs.lstat(stagingDirectory).catch(() => undefined)
  if (!stats) return
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('迁移备份临时目录无效，已停止启动')
  await fs.rm(stagingDirectory, { recursive: true, force: false })
}

export async function encryptLegacyMigrationBackups(
  backupDirectory: string,
  secureFileStore: SecureFileStore,
): Promise<void> {
  const entries = await fs.readdir(backupDirectory, { withFileTypes: true })
  const legacyBackups = entries.filter((entry) =>
    /^jobflow\.sqlite\.before-migration-.+\.sqlite$/.test(entry.name),
  )
  for (const entry of legacyBackups) {
    const source = path.join(backupDirectory, entry.name)
    const destination = `${source}.jfr`
    const sourceStats = await fs.lstat(source)
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink())
      throw new Error('旧版迁移备份无法验证，已停止安全迁移')
    const plaintext = await fs.readFile(source)
    const existing = await fs.lstat(destination).catch(() => undefined)
    if (existing && (!existing.isFile() || existing.isSymbolicLink()))
      throw new Error('加密迁移备份无法验证，旧数据仍保留')
    if (existing) {
      const recovered = await secureFileStore.decrypt(await fs.readFile(destination))
      if (!recovered.equals(plaintext)) throw new Error('旧版与加密迁移备份不一致，已停止安全迁移')
    } else {
      const temporary = `${destination}.tmp-${randomUUID()}`
      try {
        await fs.writeFile(temporary, await secureFileStore.encrypt(plaintext), { flag: 'wx', mode: 0o600 })
        await fs.rename(temporary, destination)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    }
    await fs.rm(source, { force: false })
  }
}

export async function backupBeforeMigrate(
  db: Database.Database,
  backupDirectory: string,
  secureFileStore: SecureFileStore,
  now = new Date(),
): Promise<string | null> {
  const existingTables = db
    .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .get() as { count: number }
  if (existingTables.count === 0 || db.name === ':memory:') return null

  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  const stagingDirectory = path.join(backupDirectory, '.migration-backup-staging')
  const stagingStats = await fs.lstat(stagingDirectory).catch(() => undefined)
  if (stagingStats && (!stagingStats.isDirectory() || stagingStats.isSymbolicLink()))
    throw new Error('迁移备份临时目录无效，已停止启动')
  await fs.mkdir(stagingDirectory, { recursive: true })

  const id = randomUUID()
  const plaintextPath = path.join(stagingDirectory, `${id}.sqlite`)
  const encryptedPath = path.join(stagingDirectory, `${id}.jfr`)
  const destination = path.join(backupDirectory, `jobflow.sqlite.before-migration-${stamp}-${id}.jfr`)
  try {
    await db.backup(plaintextPath)
    const encrypted = await secureFileStore.encrypt(await fs.readFile(plaintextPath))
    await fs.writeFile(encryptedPath, encrypted, { flag: 'wx', mode: 0o600 })
    await fs.rename(encryptedPath, destination)
    return destination
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
  }
}
