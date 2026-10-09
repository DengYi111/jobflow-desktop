import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SecureFileStore } from '../services/secure-file-store'
import { backupBeforeMigrate } from './backup-before-migrate'

export interface Migration {
  version: number
  filename: string
  sql: string
  foreignKeysOff?: boolean
}

export function loadMigrations(directory = path.resolve(process.cwd(), 'drizzle')): Migration[] {
  return fs
    .readdirSync(directory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(directory, filename), 'utf8')
      return {
        version: Number(filename.split('_', 1)[0]),
        filename,
        sql,
        foreignKeysOff: /^\s*--\s*@jobflow:\s*foreign-keys-off\s*$/im.test(sql),
      }
    })
}

export async function migrateDatabase(
  db: Database.Database,
  options: {
    directory?: string
    backupDirectory?: string
    secureFileStore?: SecureFileStore
    migrations?: Migration[]
    fts5?: 'auto' | 'disabled'
  } = {},
): Promise<void> {
  const migrations = options.migrations ?? loadMigrations(options.directory)
  db.pragma('foreign_keys = ON')
  const hasMigrationTable = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(),
  )
  const existingTables = db
    .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .get() as { count: number }
  const applied = hasMigrationTable
    ? (db.prepare('SELECT version, hash FROM schema_migrations ORDER BY version').all() as {
        version: number
        hash: string
      }[])
    : []
  const appliedVersions = new Map(applied.map(({ version, hash }) => [version, hash]))
  const newestAvailable = Math.max(0, ...migrations.map(({ version }) => version))
  const newestApplied = Math.max(0, ...applied.map(({ version }) => version))
  if (newestApplied > newestAvailable)
    throw new Error('Database schema is newer than this version of JobFlow')
  const orderedVersions = [...migrations].map(({ version }) => version).sort((a, b) => a - b)
  if (orderedVersions.some((version, index) => version !== index + 1))
    throw new Error('Migration versions must be sequential starting at 1')
  const pending = migrations.filter(({ version }) => !appliedVersions.has(version))
  for (const migration of migrations) {
    const existingHash = appliedVersions.get(migration.version)
    if (existingHash && existingHash !== hashSql(migration.sql))
      throw new Error(`Migration ${migration.version} has changed after it was applied`)
  }
  if (pending.length === 0) {
    if (migrations.some(({ version }) => version > newestApplied))
      throw new Error('Database migration state is inconsistent')
    return
  }
  if (existingTables.count > 0 && db.name !== ':memory:') {
    if (!options.secureFileStore) throw new Error('数据库迁移前必须配置加密备份')
    await backupBeforeMigrate(db, options.backupDirectory ?? path.dirname(db.name), options.secureFileStore)
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL, applied_at TEXT NOT NULL)',
  )
  for (const migration of pending) {
    const ftsStatement = migration.sql.match(/CREATE VIRTUAL TABLE\s+job_search\b[^;]*;/is)?.[0]
    const baseSql = ftsStatement ? migration.sql.replace(ftsStatement, '') : migration.sql
    if (migration.foreignKeysOff) db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        db.exec(baseSql)
        if (ftsStatement) {
          let fts5Available = false
          if (options.fts5 !== 'disabled') {
            try {
              db.exec(ftsStatement)
              fts5Available = true
            } catch {
              // FTS5 is optional in system SQLite builds; the repository falls back to LIKE.
            }
          }
          const value = fts5Available ? '1' : '0'
          db.prepare(
            "INSERT INTO app_settings(key,value,updated_at) VALUES ('fts5_available',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
          ).run(value, new Date().toISOString())
        }
        db.prepare('INSERT INTO schema_migrations(version,name,hash,applied_at) VALUES (?,?,?,?)').run(
          migration.version,
          migration.filename,
          hashSql(migration.sql),
          new Date().toISOString(),
        )
        const violations = db.pragma('foreign_key_check') as unknown[]
        if (violations.length)
          throw new Error(`Foreign key check failed after migration ${migration.version}`)
      })()
    } finally {
      if (migration.foreignKeysOff) db.pragma('foreign_keys = ON')
    }
  }
}

function hashSql(sql: string): string {
  return crypto.createHash('sha256').update(sql.replace(/\r\n?/g, '\n')).digest('hex')
}
