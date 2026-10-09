CREATE TABLE recruitment_sites (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('COMPANY', 'CAREERS')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_recruitment_sites_url ON recruitment_sites(url);
CREATE INDEX idx_recruitment_sites_company ON recruitment_sites(company_id, kind);

CREATE TABLE browser_history (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  visited_at TEXT NOT NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL
);
CREATE INDEX idx_browser_history_visited ON browser_history(visited_at DESC);
