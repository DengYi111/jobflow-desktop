import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createSavedSiteService } from '../../src/main/services/saved-sites.service'

let db: Database.Database
let repositories: ReturnType<typeof createRepositories>
let savedSites: ReturnType<typeof createSavedSiteService>
let companyId: string

beforeEach(() => {
  db = new Database(':memory:')
  migrateDatabase(db)
  repositories = createRepositories(db)
  companyId = repositories.companies.create({ name: '汇川技术' }).id
  savedSites = createSavedSiteService(db, repositories.browser, repositories.companies)
})

afterEach(() => db.close())

describe('saved career sites', () => {
  it('saves a recruitment site and synchronizes its company URL as one operation', () => {
    const site = savedSites.save({
      companyId,
      name: '汇川科技招聘官网',
      url: 'https://recruit.inovance.com',
      kind: 'CAREERS',
    })

    expect(repositories.browser.listSites()).toMatchObject([{ id: site.id, companyId, name: site.name }])
    expect(repositories.companies.get(companyId)).toMatchObject({ careersUrl: site.url })
  })

  it('rolls the saved site back when company synchronization fails', () => {
    db.exec(
      "CREATE TRIGGER reject_company_url BEFORE UPDATE ON companies BEGIN SELECT RAISE(ABORT, 'company write failed'); END",
    )

    expect(() =>
      savedSites.save({
        companyId,
        name: '汇川科技招聘官网',
        url: 'https://recruit.inovance.com',
        kind: 'CAREERS',
      }),
    ).toThrow()

    expect(repositories.browser.listSites()).toEqual([])
    expect(repositories.companies.get(companyId)).toMatchObject({ careersUrl: null })
  })
})
