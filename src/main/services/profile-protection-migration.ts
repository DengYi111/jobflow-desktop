import type Database from 'better-sqlite3'
import { protectValue, unprotectValue, type SecretProtector } from '../security/protected-value'

const migrationKey = 'security.profile_protection_version'
const migrationVersion = '2'
const protectedColumns = {
  profile: [
    'name',
    'phone',
    'email',
    'gender',
    'birthday',
    'hometown',
    'current_city',
    'expected_city',
    'expected_salary',
    'document_type',
    'document_number',
    'ethnicity',
    'emergency_contact_name',
    'emergency_contact_phone',
    'mailing_address',
  ],
  education: ['school', 'degree', 'major', 'start_date', 'end_date', 'notes'],
  internships: ['employer', 'role', 'start_date', 'end_date', 'description'],
  projects: ['name', 'role', 'start_date', 'end_date', 'description'],
  custom_fields: ['label', 'value'],
  resume_versions: ['name', 'original_name', 'notes'],
} as const

interface PendingValue {
  table: keyof typeof protectedColumns
  id: string
  column: string
  value: string
}

export async function migrateProfileProtection(
  db: Database.Database,
  protector: SecretProtector,
): Promise<void> {
  const applied = db.prepare('SELECT value FROM app_settings WHERE key=?').get(migrationKey) as
    { value: string } | undefined
  if (applied?.value === migrationVersion) return
  if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用，个人资料尚未迁移')

  const pendingValues: PendingValue[] = []
  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      ({ name }) => name,
    ),
  )
  for (const [table, columns] of Object.entries(protectedColumns) as Array<
    [keyof typeof protectedColumns, readonly string[]]
  >) {
    if (!existingTables.has(table)) continue
    const rows = db.prepare(`SELECT id,${columns.join(',')} FROM ${table}`).all() as Array<
      Record<string, string | null>
    >
    for (const row of rows) {
      if (!row.id) throw new Error('个人资料记录缺少有效编号')
      for (const column of columns) {
        const currentValue = row[column]
        if (currentValue == null || currentValue === '') continue
        const decoded = await unprotectValue(currentValue, protector)
        if (decoded.wasPlaintext || decoded.shouldReEncrypt) {
          const encrypted = await protectValue(decoded.value, protector)
          if (encrypted != null) pendingValues.push({ table, id: row.id, column, value: encrypted })
        }
      }
    }
  }

  const migrate = db.transaction(() => {
    for (const item of pendingValues) {
      db.prepare(`UPDATE ${item.table} SET ${item.column}=? WHERE id=?`).run(item.value, item.id)
    }
    db.prepare(
      `INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    ).run(migrationKey, migrationVersion, new Date().toISOString())
  })
  migrate()
}
