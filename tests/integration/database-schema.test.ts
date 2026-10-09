import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadMigrations, migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { fakeSecretProtector } from '../helpers/fake-secret-protector'
import { encryptLegacyMigrationBackups } from '../../src/main/db/backup-before-migrate'
import { createCompaniesService } from '../../src/main/services/companies.service'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
})
afterEach(() => db.close())

describe('JobFlow SQLite schema and repositories', () => {
  it('creates all approved tables, indexes, and enables foreign keys', () => {
    migrateDatabase(db)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as { name: string }[]
    ).map(({ name }) => name)
    for (const table of [
      'companies',
      'jobs',
      'tags',
      'job_tags',
      'job_listings',
      'applications',
      'application_events',
      'reminders',
      'interviews',
      'interview_questions',
      'profile',
      'education',
      'projects',
      'custom_fields',
      'resume_versions',
      'autofill_mappings',
      'app_settings',
      'job_search_map',
      'schema_migrations',
    ]) {
      expect(tables).toContain(table)
    }
    const fts5Available =
      (db.prepare("SELECT value FROM app_settings WHERE key='fts5_available'").get() as { value: string })
        .value === '1'
    expect(tables.includes('job_search')).toBe(fts5Available)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
    ).map(({ name }) => name)
    expect(indexes).toContain('idx_one_primary_listing_per_job')
    expect(indexes).toContain('idx_applications_stage')
    expect(indexes).toContain('idx_companies_directory_id')
    expect(indexes).toContain('idx_companies_industry')
  })

  it('enforces one primary listing per job and one application per job', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '示例公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '嵌入式软件工程师' })
    repo.jobs.addListing({ jobId: job.id, isPrimary: true })
    expect(() =>
      db
        .prepare('INSERT INTO job_listings(id,job_id,captured_at,is_primary,created_at) VALUES (?,?,?,?,?)')
        .run('duplicate-primary', job.id, new Date().toISOString(), 1, new Date().toISOString()),
    ).toThrow()
    repo.applications.create({ jobId: job.id })
    expect(() => repo.applications.create({ jobId: job.id })).toThrow()
  })

  it('persists tags, listing URL lookup, transactional stage events, due reminders, interviews, questions, profile and resume lookup', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '测试公司' })
    const job = repo.jobs.create({
      companyId: company.id,
      title: '固件工程师',
      city: '杭州',
      requirements: 'C语言',
    })
    const tag = repo.jobs.createTag('嵌入式')
    repo.jobs.assignTag(job.id, tag.id)
    expect(repo.jobs.listTags(job.id).map((item) => item.name)).toContain('嵌入式')
    const listing = repo.jobs.addListing({
      jobId: job.id,
      url: 'https://example.com/jobs/1',
      jdText: '负责固件开发',
      isPrimary: true,
    })
    expect(repo.jobs.findListingByUrl('https://example.com/jobs/1')?.id).toBe(listing.id)
    const application = repo.applications.create({ jobId: job.id })
    repo.applications.transition(application.id, {
      stage: 'APPLIED',
      title: '已投递',
      at: '2026-09-23T00:00:00.000Z',
    })
    expect(repo.applications.get(application.id)?.currentStage).toBe('APPLIED')
    expect(repo.events.listByApplication(application.id)).toHaveLength(1)
    expect(() =>
      repo.applications.transition(application.id, {
        stage: 'OFFER',
        title: '录用',
        type: 'INVALID' as never,
      }),
    ).toThrow()
    expect(repo.applications.get(application.id)?.currentStage).toBe('APPLIED')
    expect(repo.events.listByApplication(application.id)).toHaveLength(1)
    repo.reminders.create({
      applicationId: application.id,
      title: '跟进投递',
      remindAt: '2026-09-22T00:00:00.000Z',
    })
    expect(repo.reminders.listDue('2026-09-23T23:59:59.000Z')).toHaveLength(1)
    const interview = repo.interviews.create({
      applicationId: application.id,
      type: 'TECHNICAL',
      round: '一面',
      interviewAt: '2026-09-24T01:00:00.000Z',
    })
    repo.interviews.addQuestion({
      interviewId: interview.id,
      question: '如何设计任务调度？',
      category: 'FreeRTOS',
    })
    expect(repo.interviews.listQuestions(interview.id)).toHaveLength(1)
    repo.profile.save({ name: '候选人', email: 'candidate@example.com' })
    expect(repo.profile.get()?.name).toBe('候选人')
    const resume = repo.resumes.create({
      name: '嵌入式简历',
      relativePath: 'files/resumes/resume.pdf',
      originalName: 'resume.pdf',
    })
    expect(repo.resumes.get(resume.id)?.relativePath).toBe('files/resumes/resume.pdf')
  })

  it('keeps the full-text index synchronized across insert, update and delete with a LIKE fallback', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '芯片科技' })
    const job = repo.jobs.create({ companyId: company.id, title: '驱动开发', city: '上海' })
    repo.jobs.addListing({ jobId: job.id, jdText: 'Linux 内核' })
    expect(repo.jobs.search('Linux').map((item) => item.id)).toContain(job.id)
    repo.jobs.updateSearchIndex(job.id, { title: '内核工程师' })
    expect(repo.jobs.search('驱动')).toHaveLength(0)
    expect(repo.jobs.search('内核').map((item) => item.id)).toContain(job.id)
    db.prepare("UPDATE app_settings SET value='0' WHERE key='fts5_available'").run()
    expect(repo.jobs.search('内核').map((item) => item.id)).toContain(job.id)
    repo.jobs.delete(job.id)
    expect(repo.jobs.search('内核')).toHaveLength(0)
  })

  it('refreshes search results after a company rename', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '旧公司名' })
    const job = repo.jobs.create({ companyId: company.id, title: '嵌入式工程师' })
    expect(repo.jobs.search('旧公司名').map((item) => item.id)).toContain(job.id)
    repo.companies.update(company.id, { name: '新公司名' })
    expect(repo.jobs.search('旧公司名')).toHaveLength(0)
    expect(repo.jobs.search('新公司名').map((item) => item.id)).toContain(job.id)
  })

  it('finds Chinese substrings inside continuous CJK titles and treats LIKE wildcards literally', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '中文搜索公司' })
    const cjkJob = repo.jobs.create({ companyId: company.id, title: '嵌入式驱动开发' })
    const literalJob = repo.jobs.create({ companyId: company.id, title: '包含%_字面字符' })
    expect(repo.jobs.search('驱动').map((item) => item.id)).toContain(cjkJob.id)
    expect(repo.jobs.search('%_').map((item) => item.id)).toEqual([literalJob.id])
  })

  it('uses parameterized LIKE search when FTS5 is unavailable', () => {
    migrateDatabase(db, { fts5: 'disabled' })
    expect(
      (db.prepare("SELECT value FROM app_settings WHERE key='fts5_available'").get() as { value: string })
        .value,
    ).toBe('0')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='job_search'").get()).toBeUndefined()
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '无 FTS 公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '嵌入式驱动开发' })
    repo.jobs.addListing({ jobId: job.id, jdText: '负责设备驱动模块' })
    expect(repo.jobs.search('驱动').map((item) => item.id)).toContain(job.id)
  })

  it('rolls back job writes when synchronizing the full-text index fails', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '索引公司' })
    db.exec('DROP TABLE job_search')
    db.exec(`CREATE TABLE job_search(rowid INTEGER PRIMARY KEY, company_name TEXT, title TEXT, city TEXT, jd_text TEXT, requirements TEXT, notes TEXT);
      CREATE TRIGGER fail_job_search_insert BEFORE INSERT ON job_search BEGIN SELECT RAISE(ABORT, 'FTS insert failed'); END`)
    expect(() => repo.jobs.create({ companyId: company.id, title: '索引失败回滚' })).toThrow()
    expect((db.prepare('SELECT count(*) AS count FROM jobs').get() as { count: number }).count).toBe(0)
    db.exec('DROP TRIGGER fail_job_search_insert')
    const job = repo.jobs.create({ companyId: company.id, title: '原始标题' })
    db.exec(
      `CREATE TRIGGER fail_job_search_insert BEFORE INSERT ON job_search BEGIN SELECT RAISE(ABORT, 'FTS insert failed'); END`,
    )
    expect(() => repo.jobs.update(job.id, { title: '不应保存的新标题' })).toThrow()
    expect((repo.jobs.get(job.id) as { title: string }).title).toBe('原始标题')
    expect(repo.jobs.search('原始标题').map((item) => item.id)).toContain(job.id)
  })

  it('rolls back a company rename when the second related job FTS refresh fails', () => {
    migrateDatabase(db)
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '原公司名' })
    const first = repo.jobs.create({ companyId: company.id, title: '第一职位' })
    const second = repo.jobs.create({ companyId: company.id, title: '第二职位' })
    const firstRow = (
      db.prepare('SELECT rowid FROM job_search_map WHERE job_id=?').get(first.id) as { rowid: number }
    ).rowid
    const secondRow = (
      db.prepare('SELECT rowid FROM job_search_map WHERE job_id=?').get(second.id) as { rowid: number }
    ).rowid
    db.exec(`DROP TABLE job_search;
      CREATE TABLE job_search(rowid INTEGER PRIMARY KEY, company_name TEXT, title TEXT, city TEXT, jd_text TEXT, requirements TEXT, notes TEXT);
      INSERT INTO job_search(rowid,company_name,title) VALUES (${firstRow},'原公司名','第一职位'),(${secondRow},'原公司名','第二职位')`)
    let firstRefreshHappened = false
    db.function('record_first_refresh', () => {
      firstRefreshHappened = true
    })
    db.exec(`CREATE TRIGGER record_first_company_refresh AFTER INSERT ON job_search
        WHEN NEW.company_name='新公司名' AND NEW.title='第一职位'
        BEGIN SELECT record_first_refresh(); END;
      CREATE TRIGGER fail_second_company_refresh BEFORE INSERT ON job_search
        WHEN NEW.company_name='新公司名' AND NEW.title='第二职位'
        BEGIN SELECT RAISE(ABORT, 'second FTS refresh failed'); END`)
    expect(() => repo.companies.update(company.id, { name: '新公司名' })).toThrow()
    expect(firstRefreshHappened).toBe(true)
    expect((repo.companies.get(company.id) as { name: string }).name).toBe('原公司名')
    expect(db.prepare('SELECT rowid,company_name,title FROM job_search ORDER BY rowid').all()).toEqual([
      { rowid: firstRow, company_name: '原公司名', title: '第一职位' },
      { rowid: secondRow, company_name: '原公司名', title: '第二职位' },
    ])
  })

  it('runs migrations once and records a schema hash', () => {
    expect(() => migrateDatabase(db)).not.toThrow()
    expect(() => migrateDatabase(db)).not.toThrow()
    expect(
      db.prepare('SELECT version, hash FROM schema_migrations').all() as { version: number; hash: string }[],
    ).toHaveLength(13)
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('recruitment_sites','browser_history') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'browser_history' }, { name: 'recruitment_sites' }])
    const applicationColumns = db.prepare('PRAGMA table_info(applications)').all() as Array<{
      name: string
      dflt_value: string | null
    }>
    expect(applicationColumns.find(({ name }) => name === 'stage_notification_enabled')?.dflt_value).toBe('0')
    expect(
      applicationColumns.find(({ name }) => name === 'next_action_notification_enabled')?.dflt_value,
    ).toBe('0')
  })

  it('normalizes legacy interview rounds to numbered rounds without preserving free-text names', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version < 11) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '旧轮次公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '旧轮次岗位' })
    const application = repo.applications.create({ jobId: job.id })
    const oldRound = repo.interviews.create({
      applicationId: application.id,
      type: 'TECHNICAL',
      round: '技术一面',
      interviewAt: '2026-09-20T09:00:00.000Z',
    })
    db.prepare('UPDATE interviews SET round_number=NULL,completed_at=? WHERE id=?').run(
      '2026-09-20T10:00:00.000Z',
      oldRound.id,
    )

    await migrateDatabase(db, { migrations })

    expect(repo.interviews.get(oldRound.id)).toMatchObject({ roundNumber: 1, round: '第 1 面' })
  })

  it('links every existing legacy round timeline entry instead of inserting duplicates', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version < 11) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '已有时间线公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '岗位' })
    const application = repo.applications.create({ jobId: job.id })
    const oldRound = repo.interviews.create({
      applicationId: application.id,
      type: 'TECHNICAL',
      round: '技术一面',
      interviewAt: '2026-09-20T09:00:00.000Z',
    })
    const secondRound = repo.interviews.create({
      applicationId: application.id,
      type: 'MANAGER',
      round: '主管面',
      interviewAt: '2026-09-21T09:00:00.000Z',
    })
    db.prepare('UPDATE interviews SET round_number=NULL,completed_at=? WHERE id=?').run(
      '2026-09-20T10:00:00.000Z',
      oldRound.id,
    )
    db.prepare('UPDATE interviews SET round_number=NULL,completed_at=? WHERE id=?').run(
      '2026-09-21T10:00:00.000Z',
      secondRound.id,
    )
    repo.events.insert({
      applicationId: application.id,
      type: 'OTHER',
      title: '第一面·技术一面',
      stage: 'INTERVIEW_DONE',
      eventAt: '2026-09-20T09:00:00.000Z',
      notes: '旧时间线记录',
    })
    repo.events.insert({
      applicationId: application.id,
      type: 'OTHER',
      title: '第二面·主管面',
      stage: 'INTERVIEW_DONE',
      eventAt: '2026-09-21T09:00:00.000Z',
      notes: '旧时间线记录',
    })

    await migrateDatabase(db, { migrations })

    expect(repo.events.listByApplication(application.id)).toHaveLength(2)
    expect(repo.events.listByApplication(application.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '第 1 面',
          interviewId: oldRound.id,
          interviewRoundNumber: 1,
        }),
        expect.objectContaining({
          title: '第 2 面',
          interviewId: secondRound.id,
          interviewRoundNumber: 2,
        }),
      ]),
    )
  })

  it('normalizes legacy technical interview labels and removes duplicate linked timeline markers', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version <= 11) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '阶段清理公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '技术面岗位' })
    const application = repo.applications.create({ jobId: job.id })
    const interview = repo.interviews.create({
      applicationId: application.id,
      type: 'TECHNICAL',
      round: '第 1 面',
      interviewAt: '2026-09-20T09:00:00.000Z',
    })
    db.prepare('UPDATE interviews SET round=? WHERE id=?').run('技术一面', interview.id)
    const addDuplicateMarker = (id: string) =>
      db
        .prepare(
          `INSERT INTO application_events(id,application_id,type,title,stage,event_at,notes,interview_id,interview_round_number,created_at)
        VALUES (?,?,'OTHER','第一面·技术一面','INTERVIEW_DONE','2026-09-20T09:00:00.000Z',NULL,?,1,'2026-09-20T10:00:00.000Z')`,
        )
        .run(id, application.id, interview.id)
    addDuplicateMarker('round-marker-1')
    addDuplicateMarker('round-marker-2')
    repo.events.insert({
      applicationId: application.id,
      type: 'NOTE',
      title: '历史技术一面备注',
      eventAt: '2026-09-20T11:00:00.000Z',
      notes: '技术一面准备内容',
    })

    await migrateDatabase(db, { migrations })

    expect(repo.interviews.get(interview.id)).toMatchObject({ round: '第 1 面' })
    expect(repo.events.listByApplication(application.id)).toHaveLength(2)
    expect(repo.events.listByApplication(application.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '第 1 面', interviewRoundNumber: 1 }),
        expect.objectContaining({ title: '历史技术面备注', notes: '技术面准备内容' }),
      ]),
    )
    expect(
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_events_interview_round'")
        .get(),
    ).toMatchObject({ sql: expect.stringContaining('CREATE UNIQUE INDEX') })
  })

  it('converts legacy archived jobs to applied and preserves their event history', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version <= 6) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '历史归档公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '历史归档岗位' })
    const application = repo.applications.create({ jobId: job.id, currentStage: 'TECH_INTERVIEW' })
    const secondJob = repo.jobs.create({ companyId: company.id, title: '仅岗位标记的历史记录' })
    const secondApplication = repo.applications.create({ jobId: secondJob.id, currentStage: 'HR_INTERVIEW' })
    const eventAt = '2026-09-20T08:00:00.000Z'
    repo.events.insert({
      applicationId: application.id,
      type: 'STAGE_CHANGED',
      title: '技术面',
      stage: 'TECH_INTERVIEW',
      eventAt,
    })
    db.prepare('UPDATE jobs SET archived_at=? WHERE id=?').run(eventAt, job.id)
    db.prepare('UPDATE applications SET archived_at=? WHERE id=?').run(eventAt, application.id)
    db.prepare('UPDATE jobs SET archived_at=? WHERE id=?').run(eventAt, secondJob.id)

    await migrateDatabase(db, { migrations })

    expect(db.prepare('SELECT archived_at AS archivedAt FROM jobs WHERE id=?').get(job.id)).toMatchObject({
      archivedAt: null,
    })
    expect(
      db
        .prepare('SELECT current_stage AS stage,archived_at AS archivedAt FROM applications WHERE id=?')
        .get(application.id),
    ).toMatchObject({ stage: 'APPLIED', archivedAt: null })
    expect(
      db
        .prepare('SELECT current_stage AS stage,archived_at AS archivedAt FROM applications WHERE id=?')
        .get(secondApplication.id),
    ).toMatchObject({ stage: 'APPLIED', archivedAt: null })
    expect(repo.events.listByApplication(application.id)).toMatchObject([
      { title: '技术面', stage: 'TECH_INTERVIEW', eventAt },
    ])
    const companyDetail = createCompaniesService(db, repo).get(company.id) as {
      jobs: Array<{ id: string; stage: string }>
      openJobs?: unknown
      archivedJobs?: unknown
    }
    expect(companyDetail.jobs.map(({ id, stage }) => ({ id, stage }))).toEqual(
      expect.arrayContaining([
        { id: job.id, stage: 'APPLIED' },
        { id: secondJob.id, stage: 'APPLIED' },
      ]),
    )
    expect(companyDetail).not.toHaveProperty('archivedJobs')
    expect(companyDetail).not.toHaveProperty('openJobs')
  })

  it('preserves existing profile values when saving new application fields', () => {
    migrateDatabase(db)
    db.prepare(
      "INSERT INTO profile(id,name,phone,updated_at) VALUES ('default','林同学','13800000000','2026-09-01T00:00:00.000Z')",
    ).run()
    const profile = createRepositories(db).profile
    profile.save({ documentType: '居民身份证', documentNumber: 'ID-TEST', emergencyContactName: '联系人' })
    profile.save({ mailingAddress: '武汉市' })
    expect(profile.get()).toMatchObject({
      name: '林同学',
      phone: '13800000000',
      documentType: '居民身份证',
      documentNumber: 'ID-TEST',
      emergencyContactName: '联系人',
      mailingAddress: '武汉市',
    })
  })

  it('migrates legacy interview stages without losing schedules, questions, or timeline history', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version <= 7) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '兼容公司' })
    const openJob = repo.jobs.create({ companyId: company.id, title: '有未完成面试' })
    const doneJob = repo.jobs.create({ companyId: company.id, title: '旧面试阶段' })
    const openApplication = repo.applications.create({ jobId: openJob.id, currentStage: 'TECH_INTERVIEW' })
    const doneApplication = repo.applications.create({ jobId: doneJob.id, currentStage: 'HR_INTERVIEW' })
    const openInterview = repo.interviews.create({
      applicationId: openApplication.id,
      type: 'TECHNICAL',
      round: '技术一面',
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    repo.interviews.addQuestion({ interviewId: openInterview.id, question: '旧题目', category: '算法' })
    repo.events.insert({
      applicationId: openApplication.id,
      type: 'NOTE',
      title: '手动历史',
      eventAt: '2026-09-25T09:00:00.000Z',
    })

    await migrateDatabase(db, { migrations })

    expect(repo.applications.get(openApplication.id)?.currentStage).toBe('INTERVIEW_PENDING')
    expect(repo.applications.get(doneApplication.id)?.currentStage).toBe('INTERVIEW_DONE')
    expect(repo.interviews.get(openInterview.id)).toMatchObject({
      round: '第 1 面',
      roundNumber: 1,
      cancelledAt: null,
    })
    expect(repo.interviews.listQuestions(openInterview.id)).toMatchObject([{ question: '旧题目' }])
    expect(repo.events.listByApplication(openApplication.id)).toContainEqual(
      expect.objectContaining({ title: '手动历史' }),
    )
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('rolls back a foreign-key rebuild failure and restores foreign-key enforcement', async () => {
    const migrations = loadMigrations()
    await migrateDatabase(db, { migrations: migrations.filter(({ version }) => version <= 7) })
    const repo = createRepositories(db)
    const company = repo.companies.create({ name: '迁移回滚公司' })
    const job = repo.jobs.create({ companyId: company.id, title: '迁移回滚岗位' })
    const application = repo.applications.create({ jobId: job.id })
    const invalidFinalMigration = {
      ...migrations[7],
      sql: '-- @jobflow: foreign-keys-off\nDROP TABLE applications;\nSELECT * FROM missing_table;',
    }

    await expect(
      migrateDatabase(db, { migrations: [...migrations.slice(0, 7), invalidFinalMigration] }),
    ).rejects.toThrow()

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(repo.applications.get(application.id)?.jobId).toBe(job.id)
    expect(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get(),
    ).toMatchObject({ version: 7 })
  })

  it('treats Windows and Unix line endings as the same migration content', async () => {
    const migrations = loadMigrations().map((migration) => ({
      ...migration,
      sql: migration.sql.replace(/\r\n/g, '\n'),
    }))
    await migrateDatabase(db, { migrations })
    const windowsMigrations = migrations.map((migration) => ({
      ...migration,
      sql: migration.sql.replace(/\n/g, '\r\n'),
    }))

    await expect(migrateDatabase(db, { migrations: windowsMigrations })).resolves.toBeUndefined()
  })

  it('creates an online backup before migrating a non-empty existing database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-migration-'))
    const filename = path.join(directory, 'jobflow.sqlite')
    const existing = new Database(filename)
    existing.exec("CREATE TABLE legacy_data (value TEXT); INSERT INTO legacy_data VALUES ('preserved')")
    const fileStore = createSecureFileStore(fakeSecretProtector)
    await migrateDatabase(existing, {
      directory: path.resolve('drizzle'),
      backupDirectory: directory,
      secureFileStore: fileStore,
    })
    existing.close()
    const backupFile = fs
      .readdirSync(directory)
      .find((name) => name.includes('.before-migration-') && name.endsWith('.jfr'))
    expect(backupFile).toBeTruthy()
    const snapshotPath = path.join(directory, 'restored-migration-snapshot.sqlite')
    fs.writeFileSync(
      snapshotPath,
      await fileStore.decrypt(fs.readFileSync(path.join(directory, backupFile!))),
    )
    const backup = new Database(snapshotPath)
    expect((backup.prepare('SELECT value FROM legacy_data').get() as { value: string }).value).toBe(
      'preserved',
    )
    backup.close()
    expect(fs.readdirSync(directory).some((name) => name === '.migration-backup-staging')).toBe(false)
    expect(
      fs
        .readdirSync(directory)
        .some((name) => name.startsWith('jobflow.sqlite.before-migration-') && name.endsWith('.sqlite')),
    ).toBe(false)
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('refuses to migrate a persistent database when account-bound snapshot protection is unavailable', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-migration-unprotected-'))
    const existing = new Database(path.join(directory, 'jobflow.sqlite'))
    existing.exec("CREATE TABLE legacy_data (value TEXT); INSERT INTO legacy_data VALUES ('preserved')")

    await expect(
      migrateDatabase(existing, { directory: path.resolve('drizzle'), backupDirectory: directory }),
    ).rejects.toThrow('数据库迁移前必须配置加密备份')

    expect(
      existing.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(),
    ).toBeUndefined()
    expect(fs.readdirSync(directory).some((name) => name.includes('.before-migration-'))).toBe(false)
    existing.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('converts existing plaintext migration snapshots into account-protected files before startup', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-legacy-migration-backup-'))
    const oldSnapshot = path.join(directory, 'jobflow.sqlite.before-migration-20260926T123456Z.sqlite')
    const original = Buffer.from('legacy sqlite snapshot')
    fs.writeFileSync(oldSnapshot, original)
    const fileStore = createSecureFileStore(fakeSecretProtector)

    await encryptLegacyMigrationBackups(directory, fileStore)

    expect(fs.existsSync(oldSnapshot)).toBe(false)
    const protectedSnapshot = `${oldSnapshot}.jfr`
    expect(fs.existsSync(protectedSnapshot)).toBe(true)
    expect(await fileStore.decrypt(fs.readFileSync(protectedSnapshot))).toEqual(original)
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('retains both copies when a legacy and encrypted migration snapshot disagree', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-conflicting-migration-backup-'))
    const oldSnapshot = path.join(directory, 'jobflow.sqlite.before-migration-20260926T123456Z.sqlite')
    const original = Buffer.from('legacy sqlite snapshot')
    fs.writeFileSync(oldSnapshot, original)
    const fileStore = createSecureFileStore(fakeSecretProtector)
    fs.writeFileSync(
      `${oldSnapshot}.jfr`,
      await fileStore.encrypt(Buffer.from('different protected snapshot')),
    )

    await expect(encryptLegacyMigrationBackups(directory, fileStore)).rejects.toThrow(
      '旧版与加密迁移备份不一致',
    )

    expect(fs.readFileSync(oldSnapshot)).toEqual(original)
    expect(fs.existsSync(`${oldSnapshot}.jfr`)).toBe(true)
    fs.rmSync(directory, { recursive: true, force: true })
  })
})
