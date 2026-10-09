import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { migrateDatabase } from './migrate'
import { cleanupMigrationBackupStaging, encryptLegacyMigrationBackups } from './backup-before-migrate'
import type { SecureFileStore } from '../services/secure-file-store'

const require = createRequire(import.meta.url)
const BetterSqlite = require('better-sqlite3') as typeof import('better-sqlite3')

export async function openDatabase(
  userDataDirectory: string,
  migrationDirectory: string,
  secureFileStore: SecureFileStore,
): Promise<Database.Database> {
  fs.mkdirSync(userDataDirectory, { recursive: true })
  await cleanupMigrationBackupStaging(userDataDirectory)
  await encryptLegacyMigrationBackups(userDataDirectory, secureFileStore)
  const db = new BetterSqlite(path.join(userDataDirectory, 'jobflow.sqlite'))
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')
    await migrateDatabase(db, {
      directory: migrationDirectory,
      backupDirectory: userDataDirectory,
      secureFileStore,
    })
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
