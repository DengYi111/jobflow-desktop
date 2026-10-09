import type Database from 'better-sqlite3'
import { createRepositories } from '../repositories'
import { AppError } from '../errors/app-error'

export type JobRepositories = ReturnType<typeof createRepositories>
export interface JobCaptureInput {
  companyId: string
  title: string
  city?: string
  department?: string
  jobCode?: string
  salary?: string
  deadline?: string
  requirements?: string
  notes?: string
  priority?: 1 | 2 | 3
  pinned?: boolean
  nextAction?: string | null
  nextActionAt?: string | null
  url?: string | null
  source?: string | null
  pageTitle?: string | null
  jdText?: string | null
  deadlineSnapshot?: string | null
  tags?: string[]
}

export function createJobsService(db: Database.Database, repositories: JobRepositories) {
  return {
    list(input: Parameters<JobRepositories['jobs']['list']>[0] = {}) {
      return repositories.jobs.list(input)
    },
    get(id: string) {
      const job = repositories.jobs.get(id) as Record<string, unknown> | undefined
      if (!job) return null
      const application = db
        .prepare(
          'SELECT id,job_id AS jobId,current_stage AS currentStage,priority,pinned,resume_version_id AS resumeVersionId,applied_at AS appliedAt,next_action AS nextAction,next_action_at AS nextActionAt,close_reason AS closeReason,created_at AS createdAt,updated_at AS updatedAt FROM applications WHERE job_id=?',
        )
        .get(id)
      return {
        ...job,
        company: repositories.companies.get(String(job.companyId)),
        application,
        listings: repositories.jobs.listListings(id),
        tags: repositories.jobs.listTags(id),
        events: application ? repositories.events.listByApplication((application as { id: string }).id) : [],
      }
    },
    create(input: JobCaptureInput, options: { allowDuplicate?: boolean } = {}) {
      return db.transaction(() => {
        const job = repositories.jobs.create({
          companyId: input.companyId,
          title: input.title.trim(),
          city: input.city,
          department: input.department,
          jobCode: input.jobCode,
          salary: input.salary,
          deadline: input.deadline,
          requirements: input.requirements,
          notes: input.notes,
        })
        const application = repositories.applications.create({
          jobId: job.id,
          currentStage: 'TO_APPLY',
          priority: input.priority ?? 2,
          pinned: input.pinned,
        })
        repositories.applications.updateDetails(application.id, {
          nextAction: input.nextAction ?? null,
          nextActionAt: input.nextActionAt ?? null,
        })
        if (input.url || input.source || input.pageTitle || input.jdText || input.deadlineSnapshot)
          repositories.jobs.addListing({
            jobId: job.id,
            url: input.url,
            source: input.source,
            pageTitle: input.pageTitle,
            jdText: input.jdText,
            deadlineSnapshot: input.deadlineSnapshot ?? input.deadline,
            isPrimary: true,
          })
        for (const name of new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))) {
          const existing = db.prepare('SELECT id FROM tags WHERE name=?').get(name) as
            { id: string } | undefined
          const tag = existing ?? repositories.jobs.createTag(name)
          repositories.jobs.assignTag(job.id, tag.id)
        }
        return {
          id: job.id,
          applicationId: application.id,
          duplicateAccepted: Boolean(options.allowDuplicate),
        }
      })()
    },
    update(input: { id: string; expectedUpdatedAt?: string } & Partial<Omit<JobCaptureInput, 'jdText'>>) {
      const {
        id,
        expectedUpdatedAt,
        priority,
        pinned,
        nextAction,
        nextActionAt,
        tags,
        url,
        source,
        pageTitle,
        deadlineSnapshot,
        ...jobFields
      } = input
      return db.transaction(() => {
        if (expectedUpdatedAt) {
          const current = repositories.jobs.get(id) as { updatedAt: string } | undefined
          if (!current) throw new Error('没有找到岗位记录')
          if (current.updatedAt !== expectedUpdatedAt)
            throw new AppError('STALE_REVISION', '岗位信息已被其他操作更新，请刷新后重试')
        }
        repositories.jobs.update(id, jobFields)
        const application = db.prepare('SELECT id FROM applications WHERE job_id=?').get(id) as
          { id: string } | undefined
        if (
          application &&
          (priority !== undefined ||
            pinned !== undefined ||
            nextAction !== undefined ||
            nextActionAt !== undefined)
        )
          repositories.applications.updateDetails(application.id, {
            priority,
            pinned,
            nextAction,
            nextActionAt,
          })
        if (tags) {
          db.prepare('DELETE FROM job_tags WHERE job_id=?').run(id)
          for (const name of new Set(tags.map((tag) => tag.trim()).filter(Boolean))) {
            const existing = db.prepare('SELECT id FROM tags WHERE name=?').get(name) as
              { id: string } | undefined
            const tag = existing ?? repositories.jobs.createTag(name)
            repositories.jobs.assignTag(id, tag.id)
          }
        }
        const primary = db.prepare('SELECT id FROM job_listings WHERE job_id=? AND is_primary=1').get(id) as
          { id: string } | undefined
        if (primary && [url, source, pageTitle, deadlineSnapshot].some((value) => value !== undefined))
          repositories.jobs.updateListing(primary.id, { url, source, pageTitle, deadlineSnapshot })
        return this.get(id)
      })()
    },
    softDelete(id: string) {
      if (!repositories.jobs.get(id)) throw new Error('Job not found')
      if (!repositories.jobs.softDelete(id)) throw new Error('Job is already deleted')
    },
    restore(id: string) {
      if (!repositories.jobs.get(id)) throw new Error('Job not found')
      if (!repositories.jobs.restore(id)) throw new Error('Job is not in trash')
    },
    permanentlyDelete(id: string) {
      const job = repositories.jobs.get(id) as { deletedAt?: string | null } | undefined
      if (!job) throw new Error('Job not found')
      if (!job.deletedAt) throw new Error('Job must be in trash before permanent deletion')
      db.transaction(() => {
        const application = db.prepare('SELECT id FROM applications WHERE job_id=?').get(id) as
          { id: string } | undefined
        if (application) db.prepare('DELETE FROM applications WHERE id=?').run(application.id)
        repositories.jobs.delete(id)
      })()
    },
    clearTrash() {
      const ids = (
        db.prepare('SELECT id FROM jobs WHERE deleted_at IS NOT NULL ORDER BY id').all() as Array<{
          id: string
        }>
      ).map(({ id }) => id)
      db.transaction(() => {
        for (const id of ids) {
          const application = db.prepare('SELECT id FROM applications WHERE job_id=?').get(id) as
            { id: string } | undefined
          if (application) db.prepare('DELETE FROM applications WHERE id=?').run(application.id)
          repositories.jobs.delete(id)
        }
      })()
      return ids.length
    },
    addListing(
      jobId: string,
      input: {
        url?: string | null
        source?: string | null
        pageTitle?: string | null
        capturedAt?: string
        jdText?: string | null
        deadlineSnapshot?: string | null
      },
    ) {
      if (!repositories.jobs.get(jobId)) throw new Error('Job not found')
      return repositories.jobs.addListing({ jobId, ...input, isPrimary: false })
    },
    updateListing(input: {
      id: string
      url?: string | null
      source?: string | null
      pageTitle?: string | null
      capturedAt?: string
      deadlineSnapshot?: string | null
    }) {
      const metadata: {
        url?: string | null
        source?: string | null
        pageTitle?: string | null
        capturedAt?: string
        deadlineSnapshot?: string | null
      } = {}
      if (input.url !== undefined) metadata.url = input.url
      if (input.source !== undefined) metadata.source = input.source
      if (input.pageTitle !== undefined) metadata.pageTitle = input.pageTitle
      if (input.capturedAt !== undefined) metadata.capturedAt = input.capturedAt
      if (input.deadlineSnapshot !== undefined) metadata.deadlineSnapshot = input.deadlineSnapshot
      return repositories.jobs.updateListing(input.id, metadata)
    },
    findDuplicates(input: { title: string; companyId?: string; url?: string }) {
      const urlKey = input.url ? normalizeUrl(input.url) : null
      const titleKey = normalizeTitle(input.title)
      const listingRows = db
        .prepare(
          'SELECT j.id,j.company_id AS companyId,j.title,l.url FROM jobs j LEFT JOIN job_listings l ON l.job_id=j.id WHERE j.deleted_at IS NULL',
        )
        .all() as Array<{ id: string; companyId: string; title: string; url: string | null }>
      const matched = listingRows.filter(
        (job) =>
          (urlKey && job.url && normalizeUrl(job.url) === urlKey) ||
          (input.companyId && job.companyId === input.companyId && normalizeTitle(job.title) === titleKey),
      )
      const ids = [...new Set(matched.map((job) => job.id))]
      return ids
        .map((id) =>
          db
            .prepare(
              `SELECT j.id,j.company_id AS companyId,c.name AS companyName,j.title,j.city,j.deadline,j.updated_at AS updatedAt,a.current_stage AS stage,a.priority,a.pinned,a.next_action AS nextAction,a.next_action_at AS nextActionAt,a.applied_at AS appliedAt
        FROM jobs j JOIN companies c ON c.id=j.company_id JOIN applications a ON a.job_id=j.id WHERE j.id=?`,
            )
            .get(id),
        )
        .filter((job): job is Record<string, unknown> => Boolean(job))
    },
  }
}

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

export function normalizeUrl(value: string): string {
  const url = new URL(value.trim())
  url.hash = ''
  url.hostname = url.hostname.toLocaleLowerCase('en-US')
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_.+|ref|source)$/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, url.pathname === '/' ? '/' : '')
}
