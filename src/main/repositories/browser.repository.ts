import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

const now = () => new Date().toISOString()

export function createBrowserRepository(db: Database.Database) {
  return {
    listSites(query?: string) {
      const term = query?.trim()
      return db
        .prepare(
          `SELECT s.id,s.company_id AS companyId,s.name,s.url,s.kind,s.created_at AS createdAt,s.updated_at AS updatedAt,c.name AS companyName
        FROM recruitment_sites s LEFT JOIN companies c ON c.id=s.company_id
        WHERE @term IS NULL OR s.name LIKE @like ESCAPE '\\' OR COALESCE(c.name,'') LIKE @like ESCAPE '\\'
        ORDER BY COALESCE(c.name,s.name),s.kind,s.name`,
        )
        .all({ term: term ?? null, like: term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null })
    },
    saveSite(input: { companyId?: string | null; name: string; url: string; kind: 'COMPANY' | 'CAREERS' }) {
      const time = now()
      const id = randomUUID()
      db.prepare(
        `INSERT INTO recruitment_sites(id,company_id,name,url,kind,created_at,updated_at) VALUES (@id,@companyId,@name,@url,@kind,@now,@now)
        ON CONFLICT(url) DO UPDATE SET company_id=excluded.company_id,name=excluded.name,kind=excluded.kind,updated_at=excluded.updated_at`,
      ).run({
        id,
        companyId: input.companyId ?? null,
        name: input.name.trim(),
        url: input.url,
        kind: input.kind,
        now: time,
      })
      return db
        .prepare(
          'SELECT id,company_id AS companyId,name,url,kind,created_at AS createdAt,updated_at AS updatedAt FROM recruitment_sites WHERE url=?',
        )
        .get(input.url)
    },
    deleteSite(id: string) {
      return db.prepare('DELETE FROM recruitment_sites WHERE id=?').run(id).changes > 0
    },
    recordVisit(input: { url: string; title?: string; jobId?: string | null; visitedAt?: string }) {
      const id = randomUUID()
      db.prepare('INSERT INTO browser_history(id,url,title,visited_at,job_id) VALUES (?,?,?,?,?)').run(
        id,
        input.url,
        input.title ?? '',
        input.visitedAt ?? now(),
        input.jobId ?? null,
      )
      db.prepare(
        'DELETE FROM browser_history WHERE id IN (SELECT id FROM browser_history ORDER BY visited_at DESC LIMIT -1 OFFSET 500)',
      ).run()
      return id
    },
    listHistory(limit = 100) {
      return db
        .prepare(
          'SELECT id,url,title,visited_at AS visitedAt,job_id AS jobId FROM browser_history ORDER BY visited_at DESC,id DESC LIMIT ?',
        )
        .all(Math.min(Math.max(limit, 1), 500))
    },
    clearHistory() {
      db.prepare('DELETE FROM browser_history').run()
    },
    listAutofillMappings(hostname: string) {
      return db
        .prepare(
          'SELECT hostname,field_signature AS signature,profile_field AS sourceKey FROM autofill_mappings WHERE hostname=? ORDER BY field_signature',
        )
        .all(hostname.toLowerCase())
    },
    saveAutofillMapping(input: { hostname: string; signature: string; sourceKey: string }) {
      const time = now()
      db.prepare(
        `INSERT INTO autofill_mappings(id,hostname,field_signature,profile_field,created_at,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(hostname,field_signature) DO UPDATE SET profile_field=excluded.profile_field,updated_at=excluded.updated_at`,
      ).run(randomUUID(), input.hostname.toLowerCase(), input.signature, input.sourceKey, time, time)
    },
    getTabState(): { tabs: string[]; activeIndex: number } {
      const result = db.prepare("SELECT value FROM app_settings WHERE key='browser_tab_state'").get() as
        { value: string } | undefined
      if (!result) return { tabs: [], activeIndex: -1 }
      try {
        const value = JSON.parse(result.value) as { version?: unknown; tabs?: unknown; activeIndex?: unknown }
        if (value.version !== 1) return { tabs: [], activeIndex: -1 }
        const tabs = Array.isArray(value.tabs)
          ? value.tabs.filter((item): item is string => typeof item === 'string').slice(0, 12)
          : []
        return { tabs, activeIndex: Math.min(Math.max(Number(value.activeIndex ?? -1), -1), tabs.length - 1) }
      } catch {
        return { tabs: [], activeIndex: -1 }
      }
    },
    saveTabState(state: { tabs: string[]; activeIndex: number }) {
      const value = JSON.stringify({
        version: 1,
        tabs: state.tabs.slice(0, 12),
        activeIndex: Math.min(Math.max(state.activeIndex, -1), state.tabs.length - 1),
      })
      db.prepare(
        "INSERT INTO app_settings(key,value,updated_at) VALUES ('browser_tab_state',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      ).run(value, now())
    },
  }
}
