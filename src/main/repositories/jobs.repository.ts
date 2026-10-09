import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createSearchIndexSync, type SearchIndexSync } from './search-index.repository'

const isoNow = () => new Date().toISOString()
type JobListQueryRow = Record<string, string | number | null>
export interface JobInput {
  companyId: string
  title: string
  department?: string | null
  city?: string | null
  jobCode?: string | null
  salary?: string | null
  deadline?: string | null
  requirements?: string | null
  notes?: string | null
}

export function createJobsRepository(
  db: Database.Database,
  syncSearchIndex: SearchIndexSync = createSearchIndexSync(db),
) {
  return {
    create(input: JobInput) {
      const now = isoNow()
      const job = { id: randomUUID(), ...input, createdAt: now, updatedAt: now }
      db.transaction(() => {
        db.prepare(
          `INSERT INTO jobs(id,company_id,title,department,city,job_code,salary,deadline,requirements,notes,created_at,updated_at)
          VALUES (@id,@companyId,@title,@department,@city,@jobCode,@salary,@deadline,@requirements,@notes,@createdAt,@updatedAt)`,
        ).run({
          ...job,
          department: input.department ?? null,
          city: input.city ?? null,
          jobCode: input.jobCode ?? null,
          salary: input.salary ?? null,
          deadline: input.deadline ?? null,
          requirements: input.requirements ?? null,
          notes: input.notes ?? null,
        })
        syncSearchIndex(job.id)
      })()
      return job
    },
    update(id: string, input: Partial<JobInput>) {
      const columns = {
        companyId: 'company_id',
        title: 'title',
        department: 'department',
        city: 'city',
        jobCode: 'job_code',
        salary: 'salary',
        deadline: 'deadline',
        requirements: 'requirements',
        notes: 'notes',
      } as const
      const params: Record<string, unknown> = { id, updatedAt: isoNow() }
      const assignments = ['updated_at=@updatedAt']
      for (const key of Object.keys(columns) as (keyof typeof columns)[])
        if (key in input && input[key] !== undefined) {
          assignments.push(`${columns[key]}=@${key}`)
          params[key] = input[key]
        }
      return db.transaction(() => {
        db.prepare(`UPDATE jobs SET ${assignments.join(',')} WHERE id=@id`).run(params)
        syncSearchIndex(id)
        return this.get(id)
      })()
    },
    get(id: string) {
      return db
        .prepare(
          'SELECT id,company_id AS companyId,title,department,city,job_code AS jobCode,salary,deadline,requirements,notes,created_at AS createdAt,updated_at AS updatedAt,deleted_at AS deletedAt FROM jobs WHERE id=?',
        )
        .get(id)
    },
    list(
      input: {
        filters?: {
          query?: string
          city?: string
          stage?: string
          priority?: 1 | 2 | 3
          tag?: string
          appliedFrom?: string
          appliedTo?: string
          deadlineFrom?: string
          deadlineTo?: string
          companyId?: string
        }
        sort?: 'updatedAt' | 'priority' | 'appliedAt' | null
        direction?: 'asc' | 'desc'
        page?: { page: number; pageSize: number }
      } = {},
    ) {
      const filters = input.filters ?? {}
      const where = ['1=1']
      const params: Record<string, unknown> = {}
      where.push(filters.stage === 'DELETED' ? 'j.deleted_at IS NOT NULL' : 'j.deleted_at IS NULL')
      if (filters.companyId) {
        where.push('j.company_id = @companyId')
        params.companyId = filters.companyId
      }
      if (filters.query?.trim()) {
        where.push(
          "(c.name LIKE @query ESCAPE '\\' OR j.title LIKE @query ESCAPE '\\' OR COALESCE(j.city,'') LIKE @query ESCAPE '\\' OR COALESCE(j.requirements,'') LIKE @query ESCAPE '\\' OR COALESCE(j.notes,'') LIKE @query ESCAPE '\\' OR EXISTS (SELECT 1 FROM job_listings jl WHERE jl.job_id=j.id AND COALESCE(jl.jd_text,'') LIKE @query ESCAPE '\\'))",
        )
        params.query = `%${filters.query.trim().replace(/[\\%_]/g, '\\$&')}%`
      }
      if (filters.city) {
        where.push('j.city = @city')
        params.city = filters.city
      }
      if (filters.stage && filters.stage !== 'DELETED') {
        where.push('a.current_stage = @stage')
        params.stage = filters.stage
      }
      if (filters.priority) {
        where.push('a.priority = @priority')
        params.priority = filters.priority
      }
      if (filters.tag) {
        where.push(
          'EXISTS (SELECT 1 FROM job_tags jt JOIN tags t ON t.id=jt.tag_id WHERE jt.job_id=j.id AND (t.id=@tag OR t.name=@tag))',
        )
        params.tag = filters.tag
      }
      if (filters.appliedFrom) {
        where.push('a.applied_at >= @appliedFrom')
        params.appliedFrom = filters.appliedFrom
      }
      if (filters.appliedTo) {
        where.push('a.applied_at < @appliedToExclusive')
        params.appliedToExclusive = nextDate(filters.appliedTo)
      }
      if (filters.deadlineFrom) {
        where.push('j.deadline >= @deadlineFrom')
        params.deadlineFrom = filters.deadlineFrom
      }
      if (filters.deadlineTo) {
        where.push('j.deadline < @deadlineToExclusive')
        params.deadlineToExclusive = nextDate(filters.deadlineTo)
      }
      const whereSql = where.join(' AND ')
      const total = (
        db
          .prepare(
            `SELECT count(*) AS total FROM jobs j JOIN companies c ON c.id=j.company_id JOIN applications a ON a.job_id=j.id WHERE ${whereSql}`,
          )
          .get(params) as { total: number }
      ).total
      const page = input.page ?? { page: 1, pageSize: 20 }
      const direction = input.direction === 'asc' ? 'ASC' : 'DESC'
      const orderBy =
        input.sort === 'priority'
          ? `a.priority ${direction}, j.updated_at DESC`
          : input.sort === 'appliedAt'
            ? `CASE WHEN a.applied_at IS NULL THEN 1 ELSE 0 END, a.applied_at ${direction}, j.updated_at DESC`
            : input.sort === 'updatedAt'
              ? `j.updated_at ${direction}`
              : 'a.priority ASC, j.updated_at DESC'
      const rows = db
        .prepare(
          `SELECT j.id,j.company_id AS companyId,c.name AS companyName,j.title,j.department,j.city,j.job_code AS jobCode,j.salary,j.deadline,j.requirements,j.notes,j.created_at AS createdAt,j.updated_at AS updatedAt,j.deleted_at AS deletedAt,a.id AS applicationId,a.current_stage AS stage,a.priority,a.pinned,a.applied_at AS appliedAt,a.next_action AS nextAction,a.next_action_at AS nextActionAt,
        COALESCE((SELECT url FROM job_listings WHERE job_id=j.id AND is_primary=1 AND url IS NOT NULL ORDER BY captured_at DESC LIMIT 1),(SELECT url FROM job_listings WHERE job_id=j.id AND url IS NOT NULL ORDER BY captured_at DESC,created_at DESC LIMIT 1)) AS primaryListingUrl,
        (SELECT i.id FROM interviews i WHERE i.application_id=a.id AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.completed_at IS NULL ORDER BY i.round_number DESC,i.interview_at DESC,i.created_at DESC LIMIT 1) AS currentInterviewId,
        (SELECT i.round_number FROM interviews i WHERE i.application_id=a.id AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.completed_at IS NULL ORDER BY i.round_number DESC,i.interview_at DESC,i.created_at DESC LIMIT 1) AS currentInterviewRoundNumber,
        (SELECT i.round FROM interviews i WHERE i.application_id=a.id AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.completed_at IS NULL ORDER BY i.round_number DESC,i.interview_at DESC,i.created_at DESC LIMIT 1) AS currentInterviewRound,
        (SELECT i.type FROM interviews i WHERE i.application_id=a.id AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.completed_at IS NULL ORDER BY i.round_number DESC,i.interview_at DESC,i.created_at DESC LIMIT 1) AS currentInterviewType,
        (SELECT i.interview_at FROM interviews i WHERE i.application_id=a.id AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.completed_at IS NULL ORDER BY i.round_number DESC,i.interview_at DESC,i.created_at DESC LIMIT 1) AS currentInterviewAt,
        (SELECT group_concat(t.name, ',') FROM job_tags jt JOIN tags t ON t.id=jt.tag_id WHERE jt.job_id=j.id) AS tags
        FROM jobs j JOIN companies c ON c.id=j.company_id JOIN applications a ON a.job_id=j.id WHERE ${whereSql}
        ORDER BY CASE WHEN a.current_stage IN ('OFFER','CLOSED') THEN 1 ELSE 0 END, a.pinned DESC, ${orderBy}, j.id ASC LIMIT @limit OFFSET @offset`,
        )
        .all({
          ...params,
          limit: page.pageSize,
          offset: (page.page - 1) * page.pageSize,
        }) as JobListQueryRow[]
      const items = rows.map((value) => {
        const interviewId = value.currentInterviewId
        return {
          ...value,
          currentInterview:
            typeof interviewId === 'string'
              ? {
                  id: interviewId,
                  roundNumber:
                    typeof value.currentInterviewRoundNumber === 'number'
                      ? value.currentInterviewRoundNumber
                      : null,
                  round: String(value.currentInterviewRound ?? ''),
                  type: String(value.currentInterviewType ?? ''),
                  interviewAt: String(value.currentInterviewAt ?? ''),
                }
              : null,
        }
      })
      return { items, total }
    },
    softDelete(id: string) {
      return (
        db
          .prepare('UPDATE jobs SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL')
          .run(isoNow(), isoNow(), id).changes > 0
      )
    },
    restore(id: string) {
      return (
        db
          .prepare('UPDATE jobs SET deleted_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NOT NULL')
          .run(isoNow(), id).changes > 0
      )
    },
    delete(id: string) {
      const mapped = db.prepare('SELECT rowid FROM job_search_map WHERE job_id=?').get(id) as
        { rowid: number } | undefined
      db.transaction(() => {
        if (
          mapped &&
          db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='job_search'").get()
        )
          db.prepare('DELETE FROM job_search WHERE rowid=?').run(mapped.rowid)
        db.prepare('DELETE FROM jobs WHERE id=?').run(id)
      })()
    },
    addListing(input: {
      jobId: string
      url?: string | null
      source?: string | null
      pageTitle?: string | null
      jdText?: string | null
      deadlineSnapshot?: string | null
      capturedAt?: string
      isPrimary?: boolean
    }) {
      const item = {
        id: randomUUID(),
        ...input,
        url: input.url ?? null,
        source: input.source ?? null,
        pageTitle: input.pageTitle ?? null,
        jdText: input.jdText ?? null,
        deadlineSnapshot: input.deadlineSnapshot ?? null,
        capturedAt: input.capturedAt ?? isoNow(),
        isPrimary: input.isPrimary ? 1 : 0,
        createdAt: isoNow(),
      }
      db.transaction(() => {
        if (item.isPrimary) db.prepare('UPDATE job_listings SET is_primary=0 WHERE job_id=?').run(item.jobId)
        db.prepare(
          'INSERT INTO job_listings(id,job_id,url,source,page_title,jd_text,captured_at,deadline_snapshot,is_primary,created_at) VALUES (@id,@jobId,@url,@source,@pageTitle,@jdText,@capturedAt,@deadlineSnapshot,@isPrimary,@createdAt)',
        ).run(item)
        db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run(isoNow(), item.jobId)
        syncSearchIndex(item.jobId)
      })()
      return { ...item, isPrimary: Boolean(item.isPrimary) }
    },
    listListings(jobId: string) {
      return db
        .prepare(
          'SELECT id,job_id AS jobId,url,source,page_title AS pageTitle,jd_text AS jdText,captured_at AS capturedAt,deadline_snapshot AS deadlineSnapshot,is_primary AS isPrimary,created_at AS createdAt FROM job_listings WHERE job_id=? ORDER BY captured_at DESC,created_at DESC',
        )
        .all(jobId)
    },
    updateListing(
      id: string,
      input: {
        url?: string | null
        source?: string | null
        pageTitle?: string | null
        capturedAt?: string
        deadlineSnapshot?: string | null
      },
    ) {
      const columns = {
        url: 'url',
        source: 'source',
        pageTitle: 'page_title',
        capturedAt: 'captured_at',
        deadlineSnapshot: 'deadline_snapshot',
      } as const
      const params: Record<string, unknown> = { id }
      const assignments: string[] = []
      for (const key of Object.keys(columns) as (keyof typeof columns)[])
        if (key in input && input[key] !== undefined) {
          assignments.push(`${columns[key]}=@${key}`)
          params[key] = input[key]
        }
      if (!assignments.length)
        return db
          .prepare(
            'SELECT id,job_id AS jobId,url,source,page_title AS pageTitle,jd_text AS jdText,captured_at AS capturedAt,deadline_snapshot AS deadlineSnapshot,is_primary AS isPrimary,created_at AS createdAt FROM job_listings WHERE id=?',
          )
          .get(id)
      const job = db.prepare('SELECT job_id AS jobId FROM job_listings WHERE id=?').get(id) as
        { jobId: string } | undefined
      if (!job) return undefined
      db.transaction(() => {
        db.prepare(`UPDATE job_listings SET ${assignments.join(',')} WHERE id=@id`).run(params)
        db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run(isoNow(), job.jobId)
        syncSearchIndex(job.jobId)
      })()
      return db
        .prepare(
          'SELECT id,job_id AS jobId,url,source,page_title AS pageTitle,jd_text AS jdText,captured_at AS capturedAt,deadline_snapshot AS deadlineSnapshot,is_primary AS isPrimary,created_at AS createdAt FROM job_listings WHERE id=?',
        )
        .get(id)
    },
    findListingByUrl(url: string) {
      return db
        .prepare(
          'SELECT id,job_id AS jobId,url,source,page_title AS pageTitle,jd_text AS jdText,captured_at AS capturedAt,deadline_snapshot AS deadlineSnapshot,is_primary AS isPrimary,created_at AS createdAt FROM job_listings WHERE url=? ORDER BY captured_at DESC LIMIT 1',
        )
        .get(url)
    },
    createTag(name: string, color?: string | null) {
      const item = { id: randomUUID(), name: name.trim(), color: color ?? null, createdAt: isoNow() }
      db.prepare('INSERT INTO tags(id,name,color,created_at) VALUES (@id,@name,@color,@createdAt)').run(item)
      return item
    },
    assignTag(jobId: string, tagId: string) {
      db.prepare(
        'INSERT INTO job_tags(job_id,tag_id) VALUES (?,?) ON CONFLICT(job_id,tag_id) DO NOTHING',
      ).run(jobId, tagId)
    },
    listTags(jobId: string) {
      return db
        .prepare(
          'SELECT t.id,t.name,t.color,t.created_at AS createdAt FROM tags t JOIN job_tags jt ON jt.tag_id=t.id WHERE jt.job_id=? ORDER BY t.name',
        )
        .all(jobId)
    },
    updateSearchIndex(
      jobId: string,
      update?: Partial<Pick<JobInput, 'title' | 'city' | 'requirements' | 'notes'>>,
    ) {
      if (update && Object.keys(update).length) this.update(jobId, update)
      else syncSearchIndex(jobId)
    },
    search(query: string) {
      const term = query.trim()
      if (!term) return []
      const setting = db.prepare("SELECT value FROM app_settings WHERE key='fts5_available'").get() as
        { value: string } | undefined
      const containsCjkOrLikeWildcard =
        /[\u2e80-\u2eff\u2f00-\u2fdf\u3040-\u30ff\u3100-\u312f\u3130-\u318f\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff%_\\]/u.test(
          term,
        )
      if (setting?.value === '1' && !containsCjkOrLikeWildcard) {
        try {
          const phrase = `"${term.replace(/"/g, '""')}"*`
          return db
            .prepare(
              `SELECT j.id,j.company_id AS companyId,j.title,j.city,c.name AS companyName FROM job_search s
            JOIN job_search_map m ON m.rowid=s.rowid JOIN jobs j ON j.id=m.job_id JOIN companies c ON c.id=j.company_id
            WHERE job_search MATCH ? AND j.deleted_at IS NULL ORDER BY j.updated_at DESC`,
            )
            .all(phrase)
        } catch {
          /* Fall through if the system SQLite cannot query FTS5. */
        }
      }
      const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
      return db
        .prepare(
          `SELECT DISTINCT j.id,j.company_id AS companyId,j.title,j.city,c.name AS companyName FROM jobs j
        JOIN companies c ON c.id=j.company_id LEFT JOIN job_listings l ON l.job_id=j.id
        WHERE j.deleted_at IS NULL AND (c.name LIKE ? ESCAPE '\\' OR j.title LIKE ? ESCAPE '\\' OR COALESCE(j.city,'') LIKE ? ESCAPE '\\' OR COALESCE(j.requirements,'') LIKE ? ESCAPE '\\' OR COALESCE(j.notes,'') LIKE ? ESCAPE '\\' OR COALESCE(l.jd_text,'') LIKE ? ESCAPE '\\') ORDER BY j.updated_at DESC`,
        )
        .all(like, like, like, like, like, like)
    },
  }
}

function nextDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
