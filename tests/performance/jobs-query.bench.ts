import Database from 'better-sqlite3'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'

const fixtureCount = 10_000
let database: Database.Database
let jobs: ReturnType<typeof createRepositories>['jobs']

beforeAll(async () => {
  database = new Database(':memory:')
  await migrateDatabase(database)
  jobs = createRepositories(database).jobs
  const now = '2026-09-27T00:00:00.000Z'
  const insertCompany = database.prepare(
    'INSERT INTO companies(id,name,created_at,updated_at) VALUES (?,?,?,?)',
  )
  const insertJob = database.prepare(
    `INSERT INTO jobs(id,company_id,title,department,city,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  )
  const insertApplication = database.prepare(
    `INSERT INTO applications(id,job_id,current_stage,priority,pinned,created_at,updated_at)
     VALUES (?,?,?, ?,0,?,?)`,
  )

  database.transaction(() => {
    for (let companyIndex = 0; companyIndex < 100; companyIndex += 1) {
      insertCompany.run(`company-${companyIndex}`, `公司 ${companyIndex}`, now, now)
    }
    for (let jobIndex = 0; jobIndex < fixtureCount; jobIndex += 1) {
      const companyIndex = jobIndex % 100
      const companyId = `company-${companyIndex}`
      const jobId = `job-${jobIndex}`
      const applicationId = `application-${jobIndex}`
      insertJob.run(
        jobId,
        companyId,
        `工程师岗位 ${jobIndex}`,
        '研发',
        jobIndex % 2 ? '武汉' : '上海',
        now,
        now,
      )
      insertApplication.run(
        applicationId,
        jobId,
        jobIndex % 4 === 0 ? 'TO_APPLY' : 'APPLIED',
        jobIndex % 3 === 0 ? 1 : 2,
        now,
        now,
      )
    }
  })()
})

afterAll(() => database?.close())

describe(`jobs repository with ${fixtureCount} records`, () => {
  bench('returns the first page with deterministic pin/priority ordering', () => {
    const result = jobs.list({ page: { page: 1, pageSize: 7 } })
    if (result.items.length !== 7 || result.total !== fixtureCount)
      throw new Error('query returned an invalid page')
  })

  bench('filters by stage and priority before paging', () => {
    const result = jobs.list({
      filters: { stage: 'APPLIED', priority: 1 },
      page: { page: 2, pageSize: 20 },
    })
    if (result.items.length !== 20 || result.total === 0)
      throw new Error('filtered query returned an invalid page')
  })

  bench('filters by city and sorts by application date before paging', () => {
    const result = jobs.list({
      filters: { city: '武汉' },
      sort: 'appliedAt',
      direction: 'desc',
      page: { page: 1, pageSize: 30 },
    })
    if (result.items.length !== 30 || result.total === 0)
      throw new Error('sorted query returned an invalid page')
  })
})
