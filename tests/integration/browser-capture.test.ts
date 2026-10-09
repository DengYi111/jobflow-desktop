import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createJobsService } from '../../src/main/services/jobs.service'
import { createBrowserCaptureService } from '../../src/main/services/browser-capture.service'

let db: Database.Database
let repositories: ReturnType<typeof createRepositories>
let jobs: ReturnType<typeof createJobsService>
let capture: ReturnType<typeof createBrowserCaptureService>

beforeEach(async () => {
  db = new Database(':memory:')
  await migrateDatabase(db)
  repositories = createRepositories(db)
  jobs = createJobsService(db, repositories)
  capture = createBrowserCaptureService(db, repositories, jobs)
})
afterEach(() => db.close())

describe('browser job capture', () => {
  it('atomically creates a local company, draft application and original page snapshot', () => {
    const result = capture.capture({
      companyName: '星河科技',
      title: '嵌入式工程师',
      city: '武汉',
      jobCode: 'FW-42',
      requirements: '负责设备软件',
      url: 'https://careers.stars.example/job/42',
      pageTitle: '星河校招',
      jdText: '岗位职责原文',
    })
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') return
    expect(repositories.jobs.get(result.id)).toMatchObject({
      title: '嵌入式工程师',
      city: '武汉',
      jobCode: 'FW-42',
      requirements: '负责设备软件',
    })
    expect(repositories.applications.get(result.applicationId)).toMatchObject({ currentStage: 'TO_APPLY' })
    expect(repositories.jobs.listListings(result.id)).toMatchObject([
      {
        url: 'https://careers.stars.example/job/42',
        pageTitle: '星河校招',
        jdText: '岗位职责原文',
        isPrimary: 1,
      },
    ])
    expect(repositories.companies.list().map((company) => company.name)).toEqual(['星河科技'])
  })

  it('returns duplicate candidates without writing anything until explicitly accepted', () => {
    const company = repositories.companies.create({ name: '星河科技' })
    jobs.create({ companyId: company.id, title: '嵌入式工程师', url: 'https://careers.stars.example/job/42' })

    const result = capture.capture({
      companyName: '新公司名',
      title: '嵌入式工程师',
      url: 'https://careers.stars.example/job/42',
    })

    expect(result.kind).toBe('duplicates')
    expect((result as { kind: 'duplicates'; matches: unknown[] }).matches).toHaveLength(1)
    expect(repositories.companies.list().map((item) => item.name)).toEqual(['星河科技'])
    expect(jobs.list({ filters: {} }).total).toBe(1)
  })

  it('rolls back a newly created company when vacancy persistence fails', () => {
    db.exec(
      "CREATE TRIGGER reject_capture_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'capture failure'); END",
    )

    expect(() =>
      capture.capture({
        companyName: '不能留下的公司',
        title: '测试岗位',
        url: 'https://careers.example.org/job/1',
      }),
    ).toThrow('capture failure')
    expect(db.prepare('SELECT count(*) AS count FROM companies').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT count(*) AS count FROM jobs').get()).toEqual({ count: 0 })
  })
})
