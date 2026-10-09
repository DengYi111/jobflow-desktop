import type Database from 'better-sqlite3'

export type SearchIndexSync = (jobId: string) => void

export function createSearchIndexSync(db: Database.Database): SearchIndexSync {
  return (jobId) => {
    const job = db
      .prepare(
        `SELECT j.id,j.title,j.city,j.requirements,j.notes,c.name AS companyName,
      COALESCE((SELECT group_concat(jl.jd_text, ' ') FROM job_listings jl WHERE jl.job_id=j.id), '') AS jdText
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=?`,
      )
      .get(jobId) as
      | {
          id: string
          title: string
          city: string | null
          requirements: string | null
          notes: string | null
          companyName: string
          jdText: string
        }
      | undefined
    if (!job) return
    const setting = db.prepare("SELECT value FROM app_settings WHERE key='fts5_available'").get() as
      { value: string } | undefined
    const ftsEnabled =
      setting?.value === '1' &&
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='job_search'").get())
    db.transaction(() => {
      db.prepare('INSERT INTO job_search_map(job_id) VALUES (?) ON CONFLICT(job_id) DO NOTHING').run(jobId)
      const mapped = db.prepare('SELECT rowid FROM job_search_map WHERE job_id=?').get(jobId) as {
        rowid: number
      }
      if (ftsEnabled) {
        db.prepare('DELETE FROM job_search WHERE rowid=?').run(mapped.rowid)
        db.prepare(
          'INSERT INTO job_search(rowid,company_name,title,city,jd_text,requirements,notes) VALUES (?,?,?,?,?,?,?)',
        ).run(
          mapped.rowid,
          job.companyName,
          job.title,
          job.city ?? '',
          job.jdText,
          job.requirements ?? '',
          job.notes ?? '',
        )
      }
    })()
  }
}
