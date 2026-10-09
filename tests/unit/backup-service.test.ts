import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBackupService as createBackupServiceImplementation } from '../../src/main/services/backup.service'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { fakeSecretProtector } from '../helpers/fake-secret-protector'

const temporaryDirectories: string[] = []
const openedDatabases = new Set<Database.Database>()
const secureFileStore = createSecureFileStore(fakeSecretProtector)

function createBackupService(
  db: Database.Database,
  dataDirectory: string,
  dialogs: Parameters<typeof createBackupServiceImplementation>[2],
  options: Parameters<typeof createBackupServiceImplementation>[3] = {},
) {
  return createBackupServiceImplementation(db, dataDirectory, dialogs, { ...options, secureFileStore })
}

function trackDatabase(database: Database.Database) {
  openedDatabases.add(database)
  return database
}

async function makeDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobflow-backup-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function createDatabase() {
  const db = trackDatabase(new Database(':memory:'))
  db.exec(
    'CREATE TABLE schema_migrations(version INTEGER); CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT,industry_id TEXT,website TEXT,careers_url TEXT,notes TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE jobs(id TEXT PRIMARY KEY,company_id TEXT,title TEXT,department TEXT,city TEXT,job_code TEXT,salary TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE applications(id TEXT PRIMARY KEY,job_id TEXT,current_stage TEXT,priority INTEGER,pinned INTEGER,applied_at TEXT,next_action TEXT,next_action_at TEXT); CREATE TABLE application_events(id TEXT PRIMARY KEY,application_id TEXT,type TEXT,title TEXT,stage TEXT,event_at TEXT,channel TEXT,notes TEXT,created_at TEXT); CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE browser_history(id TEXT PRIMARY KEY,url TEXT,title TEXT,visited_at TEXT)',
  )
  return db
}

afterEach(async () => {
  for (const database of openedDatabases) if (database.open) database.close()
  openedDatabases.clear()
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

describe('backup service', () => {
  it('exports a validated data package with resumes and without browser session data', async () => {
    const dataDirectory = await makeDirectory()
    const output = path.join(await makeDirectory(), 'JobFlow-backup-test')
    await fs.mkdir(path.join(dataDirectory, 'files', 'resumes'), { recursive: true })
    await fs.mkdir(path.join(dataDirectory, 'session-data'), { recursive: true })
    await fs.writeFile(path.join(dataDirectory, 'files', 'resumes', 'resume.pdf'), 'pdf')
    await fs.writeFile(path.join(dataDirectory, 'session-data', 'cookie'), 'secret')
    const db = createDatabase()
    db.prepare('INSERT INTO browser_history(id,url,title,visited_at) VALUES (?,?,?,?)').run(
      'visit-1',
      'https://example.test',
      'test',
      '2026-01-01',
    )
    db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(
      'browser_tab_state',
      '{"version":1}',
      '2026-01-01',
    )
    const service = createBackupService(db, dataDirectory, {
      chooseExportPath: async () => output,
      chooseRestorePath: async () => null,
      chooseCsvPath: async () => null,
    })

    const result = await service.exportFromDialog()

    expect(result).toEqual({ canceled: false })
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')) as {
      version: number
      metadataFile: string
      payloads: Array<{ id: string; sha256: string }>
    }
    expect(manifest.version).toBe(2)
    expect(await fs.stat(path.join(output, manifest.metadataFile))).toBeTruthy()
    const packageFiles = await fs.readdir(path.join(output, 'payloads'))
    expect(packageFiles).toHaveLength(manifest.payloads.length)
    for (const file of packageFiles) {
      const encrypted = await fs.readFile(path.join(output, 'payloads', file))
      expect(encrypted.toString('utf8')).not.toContain('pdf')
      expect(encrypted.toString('utf8')).not.toContain('cookie')
    }
    await expect(fs.stat(path.join(output, 'session-data'))).rejects.toThrow()
    const metadata = JSON.parse(
      (await secureFileStore.decrypt(await fs.readFile(path.join(output, manifest.metadataFile)))).toString(
        'utf8',
      ),
    ) as { entries: Array<{ id: string; path: string }> }
    const databaseEntry = metadata.entries.find((entry) => entry.path === 'jobflow.sqlite')!
    const restoredDatabasePath = path.join(dataDirectory, 'test-inspection.sqlite')
    await fs.writeFile(
      restoredDatabasePath,
      await secureFileStore.decrypt(
        await fs.readFile(path.join(output, 'payloads', `${databaseEntry.id}.jfr`)),
      ),
    )
    const exportedDatabase = trackDatabase(new Database(restoredDatabasePath, { readonly: true }))
    expect(exportedDatabase.prepare('SELECT count(*) AS count FROM browser_history').get()).toEqual({
      count: 0,
    })
    expect(
      exportedDatabase
        .prepare("SELECT count(*) AS count FROM app_settings WHERE key='browser_tab_state'")
        .get(),
    ).toEqual({ count: 0 })
    exportedDatabase.close()
    db.close()
  })

  it('validates the selected backup and stages it without changing live data', async () => {
    const dataDirectory = await makeDirectory()
    const output = path.join(await makeDirectory(), 'JobFlow-backup-test')
    const db = createDatabase()
    const service = createBackupService(db, dataDirectory, {
      chooseExportPath: async () => output,
      chooseRestorePath: async () => output,
      chooseCsvPath: async () => null,
    })
    await service.exportFromDialog()

    expect(await service.restoreFromDialog()).toEqual({ canceled: false, staged: true })
    expect(await fs.stat(path.join(dataDirectory, 'restore-staging', 'jobflow.sqlite'))).toBeTruthy()
    db.close()
  })

  it('accepts a checksummed legacy package and secures its staged contents before apply', async () => {
    const dataDirectory = await makeDirectory()
    const source = path.join(await makeDirectory(), 'legacy-backup')
    await fs.mkdir(source)
    const legacyDatabase = createDatabase()
    const databaseFile = path.join(source, 'jobflow.sqlite')
    const diskDatabase = new Database(databaseFile)
    diskDatabase.exec(
      'CREATE TABLE schema_migrations(version INTEGER); CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT,industry_id TEXT,website TEXT,careers_url TEXT,notes TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE jobs(id TEXT PRIMARY KEY,company_id TEXT,title TEXT,department TEXT,city TEXT,job_code TEXT,salary TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE applications(id TEXT PRIMARY KEY,job_id TEXT,current_stage TEXT,priority INTEGER,pinned INTEGER,applied_at TEXT,next_action TEXT,next_action_at TEXT); CREATE TABLE application_events(id TEXT PRIMARY KEY,application_id TEXT,type TEXT,title TEXT,stage TEXT,event_at TEXT,channel TEXT,notes TEXT,created_at TEXT); CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE browser_history(id TEXT PRIMARY KEY,url TEXT,title TEXT,visited_at TEXT)',
    )
    diskDatabase.close()
    legacyDatabase.close()
    const databaseBytes = await fs.readFile(databaseFile)
    const { createHash } = await import('node:crypto')
    await fs.writeFile(
      path.join(source, 'manifest.json'),
      JSON.stringify({
        format: 'jobflow-backup',
        version: 1,
        schemaVersion: 0,
        createdAt: new Date().toISOString(),
        files: [{ path: 'jobflow.sqlite', sha256: createHash('sha256').update(databaseBytes).digest('hex') }],
      }),
    )
    const db = createDatabase()
    let prepared = false
    const service = createBackupService(
      db,
      dataDirectory,
      {
        chooseExportPath: async () => null,
        chooseRestorePath: async () => source,
        chooseCsvPath: async () => null,
      },
      {
        prepareLegacyRestore: async (staging) => {
          prepared = true
          expect(await fs.stat(path.join(staging, 'jobflow.sqlite'))).toBeTruthy()
        },
      },
    )

    await expect(service.restoreFromDialog()).resolves.toEqual({ canceled: false, staged: true })
    expect(prepared).toBe(true)
    db.close()
  })

  it('rejects corrupted backup contents without creating a restore stage', async () => {
    const dataDirectory = await makeDirectory()
    const packageDirectory = path.join(await makeDirectory(), 'bad-backup')
    await fs.mkdir(packageDirectory, { recursive: true })
    await fs.writeFile(
      path.join(packageDirectory, 'manifest.json'),
      JSON.stringify({ version: 1, files: [{ path: 'jobflow.sqlite', sha256: 'wrong' }] }),
    )
    await fs.writeFile(path.join(packageDirectory, 'jobflow.sqlite'), 'not a database')
    const db = createDatabase()
    const service = createBackupService(db, dataDirectory, {
      chooseExportPath: async () => null,
      chooseRestorePath: async () => packageDirectory,
      chooseCsvPath: async () => null,
    })

    await expect(service.restoreFromDialog()).rejects.toThrow()
    await expect(fs.stat(path.join(dataDirectory, 'restore-staging'))).rejects.toThrow()
    db.close()
  })

  it('refuses a backup from a newer schema before staging any files', async () => {
    const dataDirectory = await makeDirectory()
    const output = path.join(await makeDirectory(), 'newer-backup')
    const newerDatabase = createDatabase()
    newerDatabase.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(4)
    await createBackupService(newerDatabase, dataDirectory, {
      chooseExportPath: async () => output,
      chooseRestorePath: async () => null,
      chooseCsvPath: async () => null,
    }).exportFromDialog()
    const currentDatabase = createDatabase()
    currentDatabase.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(3)
    const service = createBackupService(currentDatabase, dataDirectory, {
      chooseExportPath: async () => null,
      chooseRestorePath: async () => output,
      chooseCsvPath: async () => null,
    })

    await expect(service.restoreFromDialog()).rejects.toThrow('此备份由更新版本的 JobFlow 创建')
    await expect(fs.stat(path.join(dataDirectory, 'restore-staging'))).rejects.toThrow()
    newerDatabase.close()
    currentDatabase.close()
  })

  it('treats canceled export and restore dialogs as no-ops', async () => {
    const dataDirectory = await makeDirectory()
    const db = createDatabase()
    const service = createBackupService(db, dataDirectory, {
      chooseExportPath: async () => null,
      chooseRestorePath: async () => null,
      chooseCsvPath: async () => null,
    })

    await expect(service.exportFromDialog()).resolves.toEqual({ canceled: true })
    await expect(service.restoreFromDialog()).resolves.toEqual({ canceled: true, staged: false })
    await expect(service.exportCsvFromDialog()).resolves.toEqual({ canceled: true })
    await expect(fs.stat(path.join(dataDirectory, 'restore-staging'))).rejects.toThrow()
    db.close()
  })

  it('snapshots the live database and replaces it only after a validated restore is staged', async () => {
    const dataDirectory = path.join(await makeDirectory(), 'app-data')
    await fs.mkdir(dataDirectory)
    const output = path.join(await makeDirectory(), 'JobFlow-backup-test')
    const db = trackDatabase(new Database(path.join(dataDirectory, 'jobflow.sqlite')))
    db.exec(
      'CREATE TABLE schema_migrations(version INTEGER); CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT,industry_id TEXT,website TEXT,careers_url TEXT,notes TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE jobs(id TEXT PRIMARY KEY,company_id TEXT,title TEXT,department TEXT,city TEXT,job_code TEXT,salary TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE applications(id TEXT PRIMARY KEY,job_id TEXT,current_stage TEXT,priority INTEGER,pinned INTEGER,applied_at TEXT,next_action TEXT,next_action_at TEXT); CREATE TABLE application_events(id TEXT PRIMARY KEY,application_id TEXT,type TEXT,title TEXT,stage TEXT,event_at TEXT,channel TEXT,notes TEXT,created_at TEXT)',
    )
    db.prepare('INSERT INTO companies(id,name) VALUES (?,?)').run('c1', '恢复目标')
    const service = createBackupService(
      db,
      dataDirectory,
      {
        chooseExportPath: async () => output,
        chooseRestorePath: async () => output,
        chooseCsvPath: async () => null,
      },
      { closeDatabase: () => db.close() },
    )
    await service.exportFromDialog()
    db.prepare('UPDATE companies SET name=? WHERE id=?').run('当前数据', 'c1')
    await service.restoreFromDialog()

    expect(await service.applyStagedRestore()).toEqual({ applied: true, restartRequired: true })
    const restored = trackDatabase(
      new Database(path.join(dataDirectory, 'jobflow.sqlite'), { readonly: true }),
    )
    expect(
      (restored.prepare('SELECT name FROM companies WHERE id=?').get('c1') as { name: string }).name,
    ).toBe('恢复目标')
    restored.close()
    const rollback = (await fs.readdir(path.join(dataDirectory, 'backups')))[0]
    const beforeRestore = trackDatabase(
      new Database(path.join(dataDirectory, 'backups', rollback, 'jobflow.sqlite'), { readonly: true }),
    )
    expect(
      (beforeRestore.prepare('SELECT name FROM companies WHERE id=?').get('c1') as { name: string }).name,
    ).toBe('当前数据')
    beforeRestore.close()
  })

  it('exports CSV safely for Chinese text, delimiters, quotes, and formula cells', async () => {
    const dataDirectory = await makeDirectory()
    const output = path.join(await makeDirectory(), 'JobFlow-CSV-test')
    const db = createDatabase()
    db.prepare('INSERT INTO companies(id,name) VALUES (?,?)').run('c1', '=星河,"科技"')
    const service = createBackupService(db, dataDirectory, {
      chooseExportPath: async () => null,
      chooseRestorePath: async () => null,
      chooseCsvPath: async () => output,
    })

    await service.exportCsvFromDialog()

    const csv = await fs.readFile(path.join(output, 'companies.csv'))
    expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(csv.toString('utf8')).toContain('\'=星河,""科技""')
    db.close()
  })
})
