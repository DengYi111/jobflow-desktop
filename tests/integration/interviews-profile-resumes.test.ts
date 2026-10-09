import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createInterviewsService } from '../../src/main/services/interviews.service'
import { createInterviewFlowService } from '../../src/main/services/interview-flow.service'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'
import { createJobIpcServices } from '../../src/main/services/job-ipc-services'
import { createProfileService } from '../../src/main/services/profile.service'
import { fakeSecretProtector } from '../helpers/fake-secret-protector'
import { createResumesService as createResumesServiceImplementation } from '../../src/main/services/resumes.service'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { migrateProfileProtection } from '../../src/main/services/profile-protection-migration'
import { defaultQuestionCategories } from '../../src/main/services/interviews.service'

let db: Database.Database
let temp: string
let repositories: ReturnType<typeof createRepositories>
const secureFileStore = createSecureFileStore(fakeSecretProtector)

function createResumesService(...args: Parameters<typeof createResumesServiceImplementation>) {
  const [repository, directory, dialog, actions] = args
  return createResumesServiceImplementation(repository, directory, dialog, actions, {
    protector: fakeSecretProtector,
    fileStore: secureFileStore,
  })
}

beforeEach(() => {
  db = new Database(':memory:')
  migrateDatabase(db)
  repositories = createRepositories(db)
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-library-'))
})

afterEach(() => {
  db.close()
  fs.rmSync(temp, { recursive: true, force: true })
})

function createApplication() {
  const company = repositories.companies.create({ name: '星河科技' })
  const job = repositories.jobs.create({ companyId: company.id, title: '嵌入式开发工程师' })
  return { company, job, application: repositories.applications.create({ jobId: job.id }) }
}

describe('interviews, question bank, profile and resumes', () => {
  it('lists every interview question for one application with its round annotation', async () => {
    const { application } = createApplication()
    const other = createApplication()
    const service = createInterviewsService(repositories, createInterviewFlowService(db))
    const first = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T02:00:00.000Z',
      type: 'TECHNICAL',
    })
    const second = service.create({
      applicationId: application.id,
      roundNumber: 2,
      interviewAt: '2026-10-02T02:00:00.000Z',
      type: 'HR',
    })
    const unrelated = service.create({
      applicationId: other.application.id,
      roundNumber: 1,
      interviewAt: '2026-10-03T02:00:00.000Z',
      type: 'OTHER',
    })
    service.addQuestion({ interviewId: first.id, question: 'C 指针', category: 'C语言' })
    service.addQuestion({ interviewId: second.id, question: '离职原因', category: '行为面' })
    service.addQuestion({ interviewId: unrelated.id, question: '无关问题', category: '其他' })

    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repositories))
    const result = await registry.dispatch('jobflow:interviews.questions.listByApplication', {
      senderFrame: { url: 'app://jobflow/', isMainFrame: true },
      args: [{ id: application.id }],
    })
    expect(result).toMatchObject({
      ok: true,
      data: [
        { question: 'C 指针', roundNumber: 1, round: '第 1 面', type: 'TECHNICAL' },
        { question: '离职原因', roundNumber: 2, round: '第 2 面', type: 'HR' },
      ],
    })
  })

  it('provides the approved editable question category defaults in order', () => {
    expect(defaultQuestionCategories).toEqual([
      'C语言',
      '数据结构',
      '算法',
      'STM32',
      'FreeRTOS',
      '操作系统',
      '计算机网络',
      'Linux',
      '项目',
      '行为面',
      '其他',
    ])
  })

  it('keeps numbered rounds and their review and categorized questions', () => {
    const { application } = createApplication()
    const service = createInterviewsService(repositories)
    const first = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T02:00:00.000Z',
      type: 'TECHNICAL',
    })
    const second = service.create({
      applicationId: application.id,
      roundNumber: 2,
      interviewAt: '2026-10-02T02:00:00.000Z',
      type: 'HR',
    })
    service.update({ id: second.id, roundNumber: 2, interviewAt: '2026-10-03T02:00:00.000Z', type: 'HR' })
    expect(service.list()).toHaveLength(2)
    service.saveReview({
      id: first.id,
      result: '通过',
      strengths: '基础扎实',
      knowledgeGaps: '中断处理',
      nextPrep: '补充复习',
    })
    service.saveReview({ id: first.id, gaps: '结论表达不够聚焦' })
    service.saveReview({ id: first.id, gaps: undefined })
    const question = service.addQuestion({
      interviewId: first.id,
      question: '  volatile 的作用？ ',
      category: 'C语言',
      myAnswer: '初始回答',
      betterAnswer: '更完整的回答',
      notes: '复习内存模型',
    })
    service.updateQuestion({ id: question.id, category: '操作系统', notes: '已复习' })
    expect(service.get(first.id)).toMatchObject({
      result: '通过',
      strengths: '基础扎实',
      gaps: '结论表达不够聚焦',
      knowledgeGaps: '中断处理',
      nextPrep: '补充复习',
    })
    expect(service.listQuestions(first.id)[0]).toMatchObject({
      category: '操作系统',
      myAnswer: '初始回答',
      betterAnswer: '更完整的回答',
      notes: '已复习',
    })
    expect(service.get(second.id)?.round).toBe('第 2 面')
    service.addQuestion({ interviewId: second.id, question: '会议前准备内容', category: '项目' })
    service.delete(second.id)
    expect(service.get(second.id)).toBeUndefined()
    expect(service.listQuestions(second.id)).toHaveLength(0)
  })

  it('changes only an interview type without reopening a completed round or clearing its data', () => {
    const { application } = createApplication()
    const service = createInterviewsService(repositories)
    const interview = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-09-20T02:00:00.000Z',
      type: 'TECHNICAL',
    })
    repositories.interviews.complete(interview.id, '2026-09-20T03:00:00.000Z')
    service.saveReview({ id: interview.id, strengths: '记录保留' })
    service.addQuestion({ interviewId: interview.id, question: '问题保留', category: '算法' })
    service.setType(interview.id, 'MANAGER')
    expect(service.get(interview.id)).toMatchObject({
      type: 'MANAGER',
      completedAt: '2026-09-20T03:00:00.000Z',
      strengths: '记录保留',
    })
    expect(service.listQuestions(interview.id)).toHaveLength(1)
  })

  it('stores a selected online or offline mode with its matching location', () => {
    const { application } = createApplication()
    const service = createInterviewsService(repositories)
    const online = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T02:00:00.000Z',
      mode: 'ONLINE',
      location: 'https://meet.example.com/room',
    })
    const offline = service.create({
      applicationId: application.id,
      roundNumber: 2,
      interviewAt: '2026-10-02T02:00:00.000Z',
      mode: 'OFFLINE',
      location: '上海市浦东新区 1 号楼',
    })
    expect(service.get(online.id)).toMatchObject({
      mode: 'ONLINE',
      location: 'https://meet.example.com/room',
    })
    expect(service.get(offline.id)).toMatchObject({ mode: 'OFFLINE', location: '上海市浦东新区 1 号楼' })
    const noLocation = service.create({
      applicationId: application.id,
      roundNumber: 3,
      interviewAt: '2026-10-04T02:00:00.000Z',
      mode: 'ONLINE',
      location: '',
    })
    expect(service.get(noLocation.id)).toMatchObject({ mode: 'ONLINE', location: null })
    expect(() =>
      service.create({
        applicationId: application.id,
        roundNumber: 4,
        interviewAt: '2026-10-05T02:00:00.000Z',
        mode: 'ONLINE',
        location: 'javascript:alert(1)',
      }),
    ).toThrow()
  })

  it('stores an independent optional desktop reminder date for each interview', () => {
    const { application } = createApplication()
    const service = createInterviewsService(repositories)
    const first = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T02:00:00.000Z',
    })
    const second = service.create({
      applicationId: application.id,
      roundNumber: 2,
      interviewAt: '2026-10-02T02:00:00.000Z',
    })
    expect(first).toMatchObject({ notificationEnabled: false, notificationAt: null })
    service.setNotification({ id: first.id, enabled: true, notificationAt: '2026-10-01T01:30:00.000Z' })
    expect(service.get(first.id)).toMatchObject({
      notificationEnabled: true,
      notificationAt: '2026-10-01T01:30:00.000Z',
    })
    expect(service.get(second.id)).toMatchObject({ notificationEnabled: false, notificationAt: null })
    service.setNotification({ id: first.id, enabled: false, notificationAt: null })
    expect(service.get(first.id)).toMatchObject({ notificationEnabled: false, notificationAt: null })
  })

  it('registers files dropped into the resume folder exactly once', async () => {
    const userData = path.join(temp, 'user-data-dropped')
    const folder = path.join(userData, 'files', 'resumes')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'portfolio-resume.pdf'), 'valid local test file')
    const service = createResumesService(repositories, userData, async () => ({
      canceled: true,
      filePaths: [],
    }))
    const firstScan = await service.list()
    const secondScan = await service.list()
    expect(firstScan).toHaveLength(1)
    expect(firstScan[0]).toMatchObject({
      originalName: 'portfolio-resume.pdf',
      relativePath: expect.stringMatching(/^files[\\/]resumes[\\/]vault[\\/].+\.jfr$/),
    })
    expect(fs.existsSync(path.join(folder, 'portfolio-resume.pdf'))).toBe(false)
    expect(secondScan).toHaveLength(1)
    expect(db.prepare('SELECT count(*) AS count FROM resume_versions').get()).toMatchObject({ count: 1 })
  })

  it('resumes an interrupted legacy-file migration from its protected pending file', async () => {
    const userData = path.join(temp, 'user-data-legacy-resume')
    const oldRelativePath = path.join('files', 'resumes', 'old-resume.pdf')
    const pendingPath = path.join(userData, 'files', 'resumes', '.migration-resume-legacy.pending')
    const encryptedRelativePath = path.join('files', 'resumes', 'vault', 'resume-legacy.jfr')
    fs.mkdirSync(path.dirname(pendingPath), { recursive: true })
    fs.writeFileSync(pendingPath, '%PDF-1.4 legacy resume')
    fs.mkdirSync(path.join(userData, 'files', 'resumes', 'vault'), { recursive: true })
    fs.writeFileSync(
      path.join(userData, encryptedRelativePath),
      await secureFileStore.encrypt(Buffer.from('%PDF-1.4 legacy resume')),
    )
    repositories.resumes.create({
      id: 'resume-legacy',
      name: '旧简历',
      originalName: '旧简历.pdf',
      relativePath: oldRelativePath,
    })
    await migrateProfileProtection(db, fakeSecretProtector)
    const service = createResumesService(repositories, userData, async () => ({
      canceled: true,
      filePaths: [],
    }))

    await service.migrateStorage()

    expect(repositories.resumes.get('resume-legacy')).toMatchObject({ relativePath: encryptedRelativePath })
    expect(fs.existsSync(pendingPath)).toBe(false)
    expect((await service.readPdf('resume-legacy')).name).toBe('旧简历.pdf')
  })

  it('cleans up duplicate plaintext files only after verifying an interrupted migration', async () => {
    const userData = path.join(temp, 'user-data-duplicate-resume')
    const resumeDirectory = path.join(userData, 'files', 'resumes')
    const oldRelativePath = path.join('files', 'resumes', 'old-resume.pdf')
    const pendingPath = path.join(resumeDirectory, '.migration-resume-duplicate.pending')
    const original = Buffer.from('%PDF-1.4 same legacy resume')
    fs.mkdirSync(path.join(resumeDirectory, 'vault'), { recursive: true })
    fs.writeFileSync(path.join(userData, oldRelativePath), original)
    fs.writeFileSync(pendingPath, original)
    fs.writeFileSync(
      path.join(userData, 'files', 'resumes', 'vault', 'resume-duplicate.jfr'),
      await secureFileStore.encrypt(original),
    )
    repositories.resumes.create({
      id: 'resume-duplicate',
      name: '旧简历',
      originalName: '旧简历.pdf',
      relativePath: oldRelativePath,
    })
    await migrateProfileProtection(db, fakeSecretProtector)
    const service = createResumesService(repositories, userData, async () => ({
      canceled: true,
      filePaths: [],
    }))

    await service.migrateStorage()

    expect(fs.existsSync(path.join(userData, oldRelativePath))).toBe(false)
    expect(fs.existsSync(pendingPath)).toBe(false)
    expect(repositories.resumes.get('resume-duplicate')).toMatchObject({
      relativePath: path.join('files', 'resumes', 'vault', 'resume-duplicate.jfr'),
    })
    expect((await service.readPdf('resume-duplicate')).base64).toBe(original.toString('base64'))
  })

  it('preserves conflicting migration files and refuses to guess which resume is authoritative', async () => {
    const userData = path.join(temp, 'user-data-conflicting-resume')
    const resumeDirectory = path.join(userData, 'files', 'resumes')
    const oldRelativePath = path.join('files', 'resumes', 'old-resume.pdf')
    const sourcePath = path.join(userData, oldRelativePath)
    const pendingPath = path.join(resumeDirectory, '.migration-resume-conflict.pending')
    fs.mkdirSync(path.join(resumeDirectory, 'vault'), { recursive: true })
    fs.writeFileSync(sourcePath, '%PDF-1.4 original')
    fs.writeFileSync(pendingPath, '%PDF-1.4 conflicting copy')
    fs.writeFileSync(
      path.join(resumeDirectory, 'vault', 'resume-conflict.jfr'),
      await secureFileStore.encrypt(Buffer.from('%PDF-1.4 original')),
    )
    repositories.resumes.create({
      id: 'resume-conflict',
      name: '旧简历',
      originalName: '旧简历.pdf',
      relativePath: oldRelativePath,
    })
    await migrateProfileProtection(db, fakeSecretProtector)
    const service = createResumesService(repositories, userData, async () => ({
      canceled: true,
      filePaths: [],
    }))

    await expect(service.migrateStorage()).rejects.toThrow('简历迁移文件不一致，已停止安全迁移')

    expect(fs.existsSync(sourcePath)).toBe(true)
    expect(fs.existsSync(pendingPath)).toBe(true)
    expect(repositories.resumes.get('resume-conflict')).toMatchObject({ relativePath: oldRelativePath })
  })

  it('searches bank by company, job and category and counts exact normalized question text', () => {
    const { application, company, job } = createApplication()
    const service = createInterviewsService(repositories)
    const one = service.create({
      applicationId: application.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T02:00:00.000Z',
    })
    const two = service.create({
      applicationId: application.id,
      roundNumber: 2,
      interviewAt: '2026-10-02T02:00:00.000Z',
    })
    service.addQuestion({ interviewId: one.id, question: '  C++ 线程安全？ ', category: 'C语言' })
    service.addQuestion({ interviewId: two.id, question: 'c++ 线程安全?', category: 'C语言' })
    service.addQuestion({ interviewId: two.id, question: 'C 线程安全?', category: 'C语言' })
    service.addQuestion({ interviewId: two.id, question: '  ＯＳ   Scheduler  ', category: '系统调度自定义' })
    service.addQuestion({ interviewId: two.id, question: '线程栈大小如何确定', category: 'Linux' })
    const results = service.searchQuestionBank({ companyId: company.id, jobId: job.id, category: 'C语言' })
    expect(results).toHaveLength(2)
    expect(results.find((item) => item.normalizedQuestion === 'c++ 线程安全?')).toMatchObject({
      occurrenceCount: 2,
      normalizedQuestion: 'c++ 线程安全?',
    })
    expect(results.find((item) => item.normalizedQuestion === 'c 线程安全?')).toMatchObject({
      occurrenceCount: 1,
    })
    expect(service.searchQuestionBank({ query: '线程栈', category: 'C语言' })).toHaveLength(0)
    expect(
      service.searchQuestionBank({ query: ' ＯＳ   SCHEDULER ', category: '系统调度自定义' }),
    ).toMatchObject([{ normalizedQuestion: 'os scheduler', occurrenceCount: 1, category: '系统调度自定义' }])
  })

  it('saves nullable profile data and ordered editable education, projects and custom fields', async () => {
    const service = createProfileService(repositories, fakeSecretProtector)
    await service.save({ name: '小林', phone: null, email: 'lin@example.com' })
    await service.addEducation({ school: '乙大学', sortOrder: 2 })
    const education = await service.addEducation({ school: '甲大学', degree: '本科', sortOrder: 1 })
    await service.updateEducation({ id: education!.id, major: '自动化', sortOrder: 3 })
    await service.addProject({ name: '乙项目', sortOrder: 2 })
    const project = await service.addProject({ name: '甲项目', sortOrder: 1 })
    await service.updateProject({ id: project!.id, role: '负责人' })
    await service.saveCustomField({ fieldKey: 'portfolio', label: '作品集', value: 'https://example.test' })
    const profileData = await service.get()
    expect(profileData).toMatchObject({ profile: { name: '小林', phone: null, email: 'lin@example.com' } })
    expect(profileData.education.map((item) => item!.school)).toEqual(['乙大学', '甲大学'])
    expect(profileData.education[1]).toMatchObject({ major: '自动化', sortOrder: 3 })
    expect(profileData.projects.map((item) => item!.name)).toEqual(['甲项目', '乙项目'])
    expect(profileData.projects[0]).toMatchObject({ role: '负责人' })
    expect(profileData.customFields[0]).toMatchObject({ value: 'https://example.test' })
    service.deleteEducation(education!.id)
    service.deleteProject(project!.id)
    service.deleteCustomField('portfolio')
    const afterDelete = await service.get()
    expect(afterDelete.education).toHaveLength(1)
    expect(afterDelete.projects).toHaveLength(1)
    expect(afterDelete.customFields).toHaveLength(0)
  })

  it('imports resumes into managed storage and archive keeps application references', async () => {
    const { application } = createApplication()
    const source = path.join(temp, 'resume-source.pdf')
    fs.writeFileSync(source, 'readable test resume')
    const service = createResumesService(repositories, path.join(temp, 'user-data'), async () => ({
      canceled: false,
      filePaths: [source],
    }))
    const imported = await service.importFromDialog({ name: '嵌入式简历' })
    expect(imported).toMatchObject({
      name: '嵌入式简历',
      originalName: 'resume-source.pdf',
      relativePath: expect.stringMatching(/^files[\\/]resumes[\\/]/),
    })
    const storedPath = path.join(temp, 'user-data', imported.relativePath)
    expect(fs.readFileSync(storedPath).toString('utf8')).not.toContain('readable test resume')
    expect((await secureFileStore.decrypt(fs.readFileSync(storedPath))).toString('utf8')).toBe(
      'readable test resume',
    )
    repositories.applications.updateDetails(application.id, {})
    db.prepare('UPDATE applications SET resume_version_id=? WHERE id=?').run(imported.id, application.id)
    await service.archive(imported.id)
    expect(await service.list()).toHaveLength(0)
    expect(
      db
        .prepare('SELECT resume_version_id AS resumeVersionId FROM applications WHERE id=?')
        .get(application.id),
    ).toMatchObject({ resumeVersionId: imported.id })
    expect(fs.existsSync(storedPath)).toBe(true)
  })

  it('stores ordered internship history alongside education without replacing it', async () => {
    const service = createProfileService(repositories, fakeSecretProtector)
    const education = await service.addEducation({ school: '甲大学', degree: '本科' })
    const second = await service.addInternship({
      employer: '乙科技',
      role: '嵌入式实习生',
      startDate: '2025-06',
      endDate: '2025-09',
      description: '驱动开发',
      sortOrder: 2,
    })
    await service.addInternship({ employer: '甲科技', role: '研发实习生', sortOrder: 1 })
    await service.updateInternship({ id: second!.id, description: '负责设备驱动开发', sortOrder: 0 })
    const profileData = await service.get()
    expect(profileData).toMatchObject({
      education: [{ id: education!.id, school: '甲大学' }],
      internships: [{ employer: '乙科技', description: '负责设备驱动开发' }, { employer: '甲科技' }],
    })
    service.deleteInternship(second!.id)
    expect((await service.get()).internships).toHaveLength(1)
    expect((await service.get()).education).toHaveLength(1)
  })

  it('opens only registered resume IDs and reveals their managed folder', async () => {
    const source = path.join(temp, 'open-me.pdf')
    fs.writeFileSync(source, 'pdf test payload')
    const openPdf = vi.fn().mockResolvedValue(undefined)
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const showInFolder = vi.fn()
    const userData = path.join(temp, 'user-data-open')
    const service = createResumesService(
      repositories,
      userData,
      async () => ({ canceled: false, filePaths: [source] }),
      { openPdf, openExternal, showInFolder },
    )
    const imported = await service.importFromDialog()

    await service.open(imported.id)
    await service.showInFolder(imported.id)

    expect(openPdf).toHaveBeenCalledWith(imported.id)
    expect(openExternal).not.toHaveBeenCalled()
    expect(showInFolder).toHaveBeenCalledWith(path.join(userData, imported.relativePath))
  })

  it('reads PDF preview bytes by registered resume ID and rejects non-PDF content', async () => {
    const userData = path.join(temp, 'pdf-preview-data')
    const source = path.join(temp, 'preview.pdf')
    fs.writeFileSync(source, '%PDF-1.4\npreview fixture')
    const service = createResumesService(repositories, userData, async () => ({
      canceled: false,
      filePaths: [source],
    }))
    const imported = await service.importFromDialog()
    expect(imported).toBeTruthy()
    const preview = await service.readPdf(imported!.id)
    expect(preview).toMatchObject({
      name: 'preview.pdf',
      base64: Buffer.from('%PDF-1.4\npreview fixture').toString('base64'),
    })
    await expect(service.readPdf('missing-resume-id')).rejects.toThrow('没有找到对应简历')
  })

  it('rejects a registered resume path that escapes the managed folder', async () => {
    const outsidePath = path.join(temp, 'outside.pdf')
    fs.writeFileSync(outsidePath, 'outside resume')
    const outside = repositories.resumes.create({
      name: '不可信路径',
      originalName: 'outside.pdf',
      relativePath: path.join('..', 'outside.pdf'),
    })
    const openPdf = vi.fn()
    const showInFolder = vi.fn()
    const service = createResumesService(
      repositories,
      path.join(temp, 'user-data-path-check'),
      async () => ({ canceled: true, filePaths: [] }),
      { openPdf, openExternal: vi.fn(), showInFolder },
    )

    await expect(service.open(outside.id)).rejects.toThrow('简历文件路径无效')
    await expect(service.showInFolder(outside.id)).rejects.toThrow('简历文件路径无效')
    expect(openPdf).not.toHaveBeenCalled()
    expect(showInFolder).not.toHaveBeenCalled()
  })

  it('removes the copied file when saving its resume record fails', async () => {
    const source = path.join(temp, 'resume-db-failure.pdf')
    fs.writeFileSync(source, 'resume content')
    const userData = path.join(temp, 'user-data-db-failure')
    const failingRepositories = {
      ...repositories,
      resumes: {
        ...repositories.resumes,
        create: () => {
          throw new Error('database write failed')
        },
      },
    }
    const service = createResumesService(failingRepositories, userData, async () => ({
      canceled: false,
      filePaths: [source],
    }))

    await expect(service.importFromDialog()).rejects.toThrow('database write failed')
    expect(fs.readdirSync(path.join(userData, 'files', 'resumes', 'vault'))).toEqual([])
  })

  it('does not accept a renderer-supplied resume file path', async () => {
    const { createHandlerRegistry } = await import('../../src/main/ipc/register-handlers')
    const registry = createHandlerRegistry('app://jobflow', {})
    await expect(
      registry.dispatch('jobflow:resumes.importFromDialog', {
        senderFrame: { url: 'app://jobflow/' },
        args: [{ path: 'C:\\private.pdf' }],
      }),
    ).rejects.toThrow()
  })

  it('rejects unsupported file types and oversized resumes before copying', async () => {
    const unsupportedSource = path.join(temp, 'payload.exe')
    fs.writeFileSync(unsupportedSource, 'not a resume')
    const unsupported = createResumesService(
      repositories,
      path.join(temp, 'user-data-unsupported'),
      async () => ({ canceled: false, filePaths: [unsupportedSource] }),
    )
    await expect(unsupported.importFromDialog()).rejects.toThrow('仅支持 PDF、DOC 或 DOCX 简历')
    expect(fs.existsSync(path.join(temp, 'user-data-unsupported', 'files', 'resumes'))).toBe(false)

    const oversizedSource = path.join(temp, 'oversized.pdf')
    fs.closeSync(fs.openSync(oversizedSource, 'w'))
    fs.truncateSync(oversizedSource, 25 * 1024 * 1024 + 1)
    const oversized = createResumesService(
      repositories,
      path.join(temp, 'user-data-oversized'),
      async () => ({ canceled: false, filePaths: [oversizedSource] }),
    )
    await expect(oversized.importFromDialog()).rejects.toThrow('简历文件不能超过 25 MB')
    expect(fs.existsSync(path.join(temp, 'user-data-oversized', 'files', 'resumes'))).toBe(false)
  })
})
