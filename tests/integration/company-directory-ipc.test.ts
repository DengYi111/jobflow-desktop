import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMigrations, migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createCompaniesService } from '../../src/main/services/companies.service'
import { createJobIpcServices } from '../../src/main/services/job-ipc-services'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrateDatabase(db)
})
afterEach(() => db.close())

describe('company directory persistence', () => {
  it('migrates existing company/job rows without changing IDs or user data', async () => {
    const legacy = new Database(':memory:')
    try {
      await migrateDatabase(legacy, { migrations: loadMigrations().slice(0, 1) })
      const company = { id: 'legacy-company', name: '腾讯' }
      const job = { id: 'legacy-job' }
      legacy
        .prepare('INSERT INTO companies(id,name,notes,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run(company.id, company.name, '我的备注', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      legacy
        .prepare('INSERT INTO jobs(id,company_id,title,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run(job.id, company.id, '软件工程师', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      await migrateDatabase(legacy)
      const columns = legacy.prepare('PRAGMA table_info(companies)').all() as Array<{ name: string }>
      expect(columns.map((column) => column.name)).toContain('industry_id')
      expect(columns.map((column) => column.name)).toContain('directory_id')
      expect(legacy.prepare('SELECT id,name,notes FROM companies').get()).toEqual({
        id: company.id,
        name: '腾讯',
        notes: '我的备注',
      })
      expect(
        (legacy.prepare('SELECT company_id FROM jobs WHERE id=?').get(job.id) as { company_id: string })
          .company_id,
      ).toBe(company.id)
      expect(
        legacy.prepare('SELECT industry_id,directory_id FROM companies WHERE id=?').get(company.id),
      ).toEqual({ industry_id: null, directory_id: null })
    } finally {
      legacy.close()
    }
  })

  it('imports an unmatched catalog entry once and reuses its local record', () => {
    const repositories = createRepositories(db)
    const service = createCompaniesService(db, repositories)
    const first = service.addFromDirectory({ directoryId: 'internet-software-01' })
    const second = service.addFromDirectory({ directoryId: 'internet-software-01' })
    expect(first.id).toBe(second.id)
    expect(first).toMatchObject({
      name: '腾讯控股',
      industryId: 'internet-software',
      directoryId: 'internet-software-01',
    })
    expect(repositories.companies.list()).toHaveLength(1)
  })

  it('links one normalized local alias without replacing user-entered fields or jobs', () => {
    const repositories = createRepositories(db)
    const company = repositories.companies.create({
      name: 'Tencent',
      careersUrl: 'https://jobs.example.com',
      website: 'https://example.com',
      notes: '跟进过',
    })
    const job = repositories.jobs.create({ companyId: company.id, title: '后端工程师' })
    const service = createCompaniesService(db, repositories)
    const linked = service.addFromDirectory({ directoryId: 'internet-software-01' })
    expect(linked).toMatchObject({
      id: company.id,
      careersUrl: 'https://jobs.example.com',
      website: 'https://example.com',
      notes: '跟进过',
      industryId: 'internet-software',
      directoryId: 'internet-software-01',
    })
    expect(repositories.jobs.get(job.id)).toMatchObject({ companyId: company.id })
  })

  it('reports multiple local matches instead of creating or choosing a duplicate', () => {
    const repositories = createRepositories(db)
    repositories.companies.create({ name: 'Tencent' })
    repositories.companies.create({ name: '腾讯控股' })
    const service = createCompaniesService(db, repositories)
    expect(() => service.addFromDirectory({ directoryId: 'internet-software-01' })).toThrow(
      'COMPANY_MATCH_CONFLICT',
    )
    expect(repositories.companies.list()).toHaveLength(2)
  })

  it('marks archived directory companies and restores the same local record on explicit re-add', () => {
    const repositories = createRepositories(db)
    const service = createCompaniesService(db, repositories)
    const created = service.addFromDirectory({ directoryId: 'internet-software-01' })
    repositories.companies.archive(created.id)
    const archived = service.listDirectory({ query: '微信' }).companies[0].localCompany as {
      id: string
      archivedAt: string | null
    }
    expect(archived).toMatchObject({ id: created.id })
    expect(archived.archivedAt).toBeTruthy()
    const restored = service.addFromDirectory({ directoryId: 'internet-software-01' }) as {
      id: string
      archivedAt: string | null
    }
    expect(restored).toMatchObject({ id: created.id, archivedAt: null })
    expect(repositories.companies.list()).toHaveLength(1)
  })

  it('exposes catalog search and import through validated IPC and requires a local company ID for jobs', async () => {
    const repositories = createRepositories(db)
    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repositories))
    const call = (channel: string, input: unknown) =>
      registry.dispatch(channel, { senderFrame: { url: 'app://jobflow/', isMainFrame: true }, args: [input] })
    await expect(
      call('jobflow:companies.listDirectory', { industryId: 'made-up-industry' }),
    ).rejects.toThrow()
    const results = (await call('jobflow:companies.listDirectory', {
      query: '微信',
      industryId: 'internet-software',
    })) as {
      ok: true
      data: { industries: Array<{ id: string }>; companies: Array<{ id: string; name: string }> }
    }
    expect(results.data.industries).toHaveLength(18)
    expect(results.data.companies[0]).toMatchObject({ id: 'internet-software-01', name: '腾讯控股' })
    await expect(
      call('jobflow:jobs.create', { companyId: 'internet-software-01', title: '开发工程师' }),
    ).rejects.toThrow()
    const imported = (await call('jobflow:companies.addFromDirectory', {
      directoryId: 'internet-software-01',
    })) as { ok: true; data: { id: string } }
    const job = (await call('jobflow:jobs.create', { companyId: imported.data.id, title: '开发工程师' })) as {
      ok: true
      data: { id: string }
    }
    expect(job.data.id).toBeTruthy()
  })
})
