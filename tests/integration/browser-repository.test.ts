import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createBrowserRepository } from '../../src/main/repositories/browser.repository'
import { createRepositories } from '../../src/main/repositories'

let db: Database.Database
let browser: ReturnType<typeof createBrowserRepository>
beforeEach(async () => {
  db = new Database(':memory:')
  await migrateDatabase(db)
  browser = createBrowserRepository(db)
})
afterEach(() => db.close())

describe('browser repository', () => {
  it('saves searchable company and careers websites without duplicate URLs', () => {
    const company = createRepositories(db).companies.create({ name: '星河科技' })
    const first = browser.saveSite({
      companyId: company.id,
      name: '星河科技招聘官网',
      url: 'https://jobs.stars.example/',
      kind: 'CAREERS',
    })
    const updated = browser.saveSite({
      companyId: company.id,
      name: '星河校招',
      url: 'https://jobs.stars.example/',
      kind: 'CAREERS',
    })
    expect(updated).toMatchObject({ id: first?.id, name: '星河校招', companyId: company.id })
    expect(browser.listSites('星河')).toHaveLength(1)
  })

  it('keeps bounded navigation history and safely restores a validated tab snapshot', () => {
    browser.recordVisit({ url: 'https://jobs.stars.example/', title: '招聘首页' })
    expect(browser.listHistory()).toMatchObject([{ url: 'https://jobs.stars.example/', title: '招聘首页' }])
    browser.saveTabState({ tabs: ['https://jobs.stars.example/', 'https://example.org/'], activeIndex: 1 })
    expect(browser.getTabState()).toEqual({
      tabs: ['https://jobs.stars.example/', 'https://example.org/'],
      activeIndex: 1,
    })
    db.prepare("UPDATE app_settings SET value='not json' WHERE key='browser_tab_state'").run()
    expect(browser.getTabState()).toEqual({ tabs: [], activeIndex: -1 })
    browser.saveTabState({ tabs: ['https://jobs.stars.example/'], activeIndex: 0 })
    db.prepare("UPDATE app_settings SET value=? WHERE key='browser_tab_state'").run(
      JSON.stringify({ version: 2, tabs: ['https://jobs.stars.example/'], activeIndex: 0 }),
    )
    expect(browser.getTabState()).toEqual({ tabs: [], activeIndex: -1 })
  })

  it('clears visit history without changing saved sites or jobs', () => {
    const company = createRepositories(db).companies.create({ name: '星河科技' })
    const site = browser.saveSite({
      companyId: company.id,
      name: '校招',
      url: 'https://jobs.stars.example/',
      kind: 'CAREERS',
    })
    createRepositories(db).jobs.create({ companyId: company.id, title: '软件工程师' })
    browser.recordVisit({ url: 'https://jobs.stars.example/', title: '校招' })

    browser.clearHistory()

    expect(browser.listHistory()).toEqual([])
    expect(browser.listSites()).toMatchObject([{ id: site?.id }])
    expect((db.prepare('SELECT count(*) AS count FROM jobs').get() as { count: number }).count).toBe(1)
  })

  it('stores autofill mappings by exact normalized hostname and updates existing field choices', () => {
    browser.saveAutofillMapping({
      hostname: 'Jobs.Stars.Example',
      signature: 'input|text|name',
      profileField: 'name',
    })
    browser.saveAutofillMapping({
      hostname: 'jobs.stars.example',
      signature: 'input|text|name',
      profileField: 'phone',
    })
    browser.saveAutofillMapping({
      hostname: 'apply.stars.example',
      signature: 'input|text|name',
      profileField: 'email',
    })
    expect(browser.listAutofillMappings('jobs.stars.example')).toEqual([
      { hostname: 'jobs.stars.example', signature: 'input|text|name', profileField: 'phone' },
    ])
  })
})
