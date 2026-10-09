import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SearchIndexSync } from './search-index.repository'

export interface CompanyInput {
  name: string
  careersUrl?: string | null
  website?: string | null
  notes?: string | null
  industryId?: string | null
  directoryId?: string | null
}
export function createCompaniesRepository(db: Database.Database, syncSearchIndex: SearchIndexSync) {
  return {
    create(input: CompanyInput) {
      const now = new Date().toISOString()
      const company = { id: randomUUID(), ...input, createdAt: now, updatedAt: now }
      db.prepare(
        'INSERT INTO companies(id,name,careers_url,website,notes,industry_id,directory_id,created_at,updated_at) VALUES (@id,@name,@careersUrl,@website,@notes,@industryId,@directoryId,@createdAt,@updatedAt)',
      ).run({
        ...company,
        careersUrl: input.careersUrl ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        industryId: input.industryId ?? null,
        directoryId: input.directoryId ?? null,
      })
      return company
    },
    get(id: string) {
      return db
        .prepare(
          'SELECT id,name,careers_url AS careersUrl,website,notes,industry_id AS industryId,directory_id AS directoryId,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM companies WHERE id=?',
        )
        .get(id)
    },
    list(query = '', industryId?: string) {
      return db
        .prepare(
          "SELECT id,name,careers_url AS careersUrl,website,notes,industry_id AS industryId,directory_id AS directoryId,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM companies WHERE archived_at IS NULL AND name LIKE ? ESCAPE '\\' AND (? IS NULL OR industry_id=?) ORDER BY name COLLATE NOCASE",
        )
        .all(`%${query.replace(/[\\%_]/g, '\\$&')}%`, industryId ?? null, industryId ?? null)
    },
    listActiveForDirectoryMatch() {
      return db
        .prepare(
          'SELECT id,name,careers_url AS careersUrl,website,notes,industry_id AS industryId,directory_id AS directoryId,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM companies WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE',
        )
        .all()
    },
    listDirectoryLinks() {
      return db
        .prepare(
          'SELECT id,name,careers_url AS careersUrl,website,notes,industry_id AS industryId,directory_id AS directoryId,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM companies WHERE directory_id IS NOT NULL',
        )
        .all()
    },
    findByDirectoryId(directoryId: string) {
      return db
        .prepare(
          'SELECT id,name,careers_url AS careersUrl,website,notes,industry_id AS industryId,directory_id AS directoryId,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM companies WHERE directory_id=?',
        )
        .get(directoryId)
    },
    linkDirectory(id: string, directoryId: string, industryId: string) {
      db.prepare(
        'UPDATE companies SET directory_id=COALESCE(directory_id,?),industry_id=COALESCE(industry_id,?),updated_at=? WHERE id=?',
      ).run(directoryId, industryId, new Date().toISOString(), id)
      return this.get(id)
    },
    restoreDirectory(id: string, industryId: string) {
      db.prepare(
        'UPDATE companies SET archived_at=NULL,industry_id=COALESCE(industry_id,?),updated_at=? WHERE id=?',
      ).run(industryId, new Date().toISOString(), id)
      return this.get(id)
    },
    update(id: string, input: Partial<CompanyInput>) {
      const allowed = ['name', 'careersUrl', 'website', 'notes', 'industryId'] as const
      const columns = {
        name: 'name',
        careersUrl: 'careers_url',
        website: 'website',
        notes: 'notes',
        industryId: 'industry_id',
      } as const
      const values: Record<string, unknown> = { id, updatedAt: new Date().toISOString() }
      const sets = ['updated_at=@updatedAt']
      for (const key of allowed)
        if (key in input) {
          sets.push(`${columns[key]}=@${key}`)
          values[key] = input[key]
        }
      return db.transaction(() => {
        db.prepare(`UPDATE companies SET ${sets.join(',')} WHERE id=@id`).run(values)
        if ('name' in input) {
          const jobs = db.prepare('SELECT id FROM jobs WHERE company_id=?').all(id) as { id: string }[]
          for (const job of jobs) syncSearchIndex(job.id)
        }
        return this.get(id)
      })()
    },
    archive(id: string) {
      db.prepare('UPDATE companies SET archived_at=?,updated_at=? WHERE id=?').run(
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      )
    },
    listJobs(id: string) {
      return db
        .prepare(
          `SELECT j.id,j.company_id AS companyId,c.name AS companyName,j.title,j.department,j.city,j.job_code AS jobCode,j.salary,j.deadline,j.requirements,j.notes,j.updated_at AS updatedAt,a.current_stage AS stage,a.priority,a.pinned,a.applied_at AS appliedAt,a.next_action AS nextAction,a.next_action_at AS nextActionAt
        FROM jobs j JOIN companies c ON c.id=j.company_id JOIN applications a ON a.job_id=j.id
        WHERE j.company_id=? AND j.deleted_at IS NULL
        ORDER BY CASE WHEN a.current_stage IN ('OFFER','CLOSED') THEN 1 ELSE 0 END,j.updated_at DESC,j.id ASC`,
        )
        .all(id)
    },
  }
}
