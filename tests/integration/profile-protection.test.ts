import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createProfileRepository } from '../../src/main/repositories/profile.repository'
import { createProfileService } from '../../src/main/services/profile.service'
import { migrateProfileProtection } from '../../src/main/services/profile-protection-migration'
import type { SecretProtector } from '../../src/main/security/protected-value'

function createDatabase() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE profile(id TEXT PRIMARY KEY,name TEXT,phone TEXT,email TEXT,gender TEXT,birthday TEXT,hometown TEXT,current_city TEXT,expected_city TEXT,expected_salary TEXT,document_type TEXT,document_number TEXT,ethnicity TEXT,emergency_contact_name TEXT,emergency_contact_phone TEXT,mailing_address TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE education(id TEXT PRIMARY KEY,school TEXT NOT NULL,degree TEXT,major TEXT,start_date TEXT,end_date TEXT,notes TEXT,sort_order INTEGER);
    CREATE TABLE internships(id TEXT PRIMARY KEY,employer TEXT NOT NULL,role TEXT,start_date TEXT,end_date TEXT,description TEXT,sort_order INTEGER);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT,start_date TEXT,end_date TEXT,description TEXT,sort_order INTEGER);
    CREATE TABLE custom_fields(id TEXT PRIMARY KEY,field_key TEXT,label TEXT,value TEXT,updated_at TEXT);
    CREATE TABLE resume_versions(id TEXT PRIMARY KEY,name TEXT,relative_path TEXT,original_name TEXT,notes TEXT,created_at TEXT,archived_at TEXT);
  `)
  db.prepare('INSERT INTO profile(id,name,phone,document_number,updated_at) VALUES (?,?,?,?,?)').run(
    'default',
    '林同学',
    '13800000000',
    'ID-TEST-1',
    '2026-01-01',
  )
  db.prepare('INSERT INTO education(id,school,degree,major) VALUES (?,?,?,?)').run(
    'edu-1',
    '甲大学',
    '本科',
    null,
  )
  db.prepare('INSERT INTO internships(id,employer,role) VALUES (?,?,?)').run(
    'intern-1',
    '乙科技',
    '研发实习生',
  )
  db.prepare('INSERT INTO projects(id,name,description) VALUES (?,?,?)').run(
    'project-1',
    '设备项目',
    '个人资料迁移哨兵',
  )
  db.prepare('INSERT INTO custom_fields(id,field_key,label,value,updated_at) VALUES (?,?,?,?,?)').run(
    'custom-1',
    'portfolio',
    '作品集',
    'https://private.example',
    '2026-01-01',
  )
  db.prepare(
    'INSERT INTO resume_versions(id,name,relative_path,original_name,notes,created_at) VALUES (?,?,?,?,?,?)',
  ).run('resume-1', '秋招简历', 'files/resumes/秋招.pdf', '秋招简历-姓名.pdf', '实习经历', '2026-01-01')
  return db
}

function createProtector(failOn?: string) {
  const protector: SecretProtector = {
    async isAvailable() {
      return true
    },
    async encrypt(value) {
      if (value === failOn) throw new Error('injected encryption failure')
      return Buffer.from(`cipher:${value}`, 'utf8')
    },
    async decrypt(value) {
      const encoded = Buffer.from(value).toString('utf8')
      if (!encoded.startsWith('cipher:')) throw new Error('invalid test cipher')
      return { plainText: encoded.slice('cipher:'.length), shouldReEncrypt: false }
    },
  }
  return protector
}

describe('profile data protection migration', () => {
  it('encrypts values on write and returns decrypted profile data to the trusted application UI', async () => {
    const db = createDatabase()
    const protector = createProtector()
    const service = createProfileService({ profile: createProfileRepository(db) } as never, protector)
    try {
      await service.save({ name: '隐私测试姓名', documentNumber: 'ID-SENTINEL-9381' })

      expect(
        (
          db
            .prepare("SELECT name,document_number AS documentNumber FROM profile WHERE id='default'")
            .get() as Record<string, string>
        ).name,
      ).toMatch(/^jobflow:protected:v1:/)
      await expect(service.get()).resolves.toMatchObject({
        profile: { name: '隐私测试姓名', documentNumber: 'ID-SENTINEL-9381' },
      })
    } finally {
      db.close()
    }
  })

  it('fails closed rather than returning plaintext when OS encryption is unavailable', async () => {
    const db = createDatabase()
    const unavailable = {
      ...createProtector(),
      async isAvailable() {
        return false
      },
    }
    const service = createProfileService({ profile: createProfileRepository(db) } as never, unavailable)
    try {
      await expect(service.get()).rejects.toThrow('系统安全存储不可用')
      await expect(service.save({ name: '不能明文保存' })).rejects.toThrow('系统安全存储不可用')
    } finally {
      db.close()
    }
  })

  it('protects old profile and résumé-profile text without changing the values users see', async () => {
    const db = createDatabase()
    try {
      await migrateProfileProtection(db, createProtector())

      expect(
        (
          db.prepare('SELECT name,phone,document_number AS documentNumber FROM profile').get() as Record<
            string,
            string
          >
        ).name,
      ).toMatch(/^jobflow:protected:v1:/)
      expect(
        (db.prepare('SELECT school,degree FROM education').get() as Record<string, string>).school,
      ).toMatch(/^jobflow:protected:v1:/)
      expect(
        (db.prepare('SELECT employer,role FROM internships').get() as Record<string, string>).role,
      ).toMatch(/^jobflow:protected:v1:/)
      expect(
        (db.prepare('SELECT label,value FROM custom_fields').get() as Record<string, string>).value,
      ).toMatch(/^jobflow:protected:v1:/)
      expect(
        (
          db.prepare('SELECT name,original_name AS originalName,notes FROM resume_versions').get() as Record<
            string,
            string
          >
        ).originalName,
      ).toMatch(/^jobflow:protected:v1:/)
      expect(
        (
          db
            .prepare("SELECT value FROM app_settings WHERE key='security.profile_protection_version'")
            .get() as { value: string }
        ).value,
      ).toBe('2')
    } finally {
      db.close()
    }
  })

  it('is safe to retry after migration has completed', async () => {
    const db = createDatabase()
    let encryptions = 0
    const protector = createProtector()
    const counted: SecretProtector = {
      ...protector,
      async encrypt(value) {
        encryptions += 1
        return protector.encrypt(value)
      },
    }
    try {
      await migrateProfileProtection(db, counted)
      const firstRunCount = encryptions
      await migrateProfileProtection(db, counted)

      expect(encryptions).toBe(firstRunCount)
    } finally {
      db.close()
    }
  })

  it('does not partially update tables if encrypting any profile value fails', async () => {
    const db = createDatabase()
    try {
      await expect(migrateProfileProtection(db, createProtector('研发实习生'))).rejects.toThrow()

      expect((db.prepare('SELECT name,phone FROM profile').get() as Record<string, string>).name).toBe(
        '林同学',
      )
      expect((db.prepare('SELECT school FROM education').get() as Record<string, string>).school).toBe(
        '甲大学',
      )
      expect(
        db.prepare('SELECT value FROM app_settings WHERE key=?').get('security.profile_protection_version'),
      ).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
