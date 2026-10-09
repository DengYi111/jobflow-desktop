CREATE TABLE companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  careers_url TEXT, website TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, department TEXT, city TEXT, job_code TEXT,
  salary TEXT, deadline TEXT, requirements TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  color TEXT, created_at TEXT NOT NULL
);
CREATE TABLE job_tags (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(job_id, tag_id)
);
CREATE TABLE job_listings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url TEXT, source TEXT, page_title TEXT, jd_text TEXT,
  captured_at TEXT NOT NULL, deadline_snapshot TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TABLE resume_versions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, relative_path TEXT NOT NULL,
  original_name TEXT NOT NULL, notes TEXT,
  created_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  current_stage TEXT NOT NULL CHECK(current_stage IN (
    'TO_APPLY','APPLIED','ASSESSMENT_PENDING','ASSESSMENT_DONE',
    'WRITTEN_TEST_PENDING','WRITTEN_TEST_DONE','TECH_INTERVIEW',
    'HR_INTERVIEW','OFFER_COMMUNICATION','OFFER','CLOSED')),
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  resume_version_id TEXT REFERENCES resume_versions(id) ON DELETE SET NULL,
  applied_at TEXT, next_action TEXT, next_action_at TEXT,
  close_reason TEXT CHECK(close_reason IS NULL OR close_reason IN (
    'REJECTED','VOLUNTARY','HC_CLOSED','NO_RESPONSE','OFFER_DECLINED','OTHER')),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN (
    'SAVED','STAGE_CHANGED','APPLICATION_SUBMITTED','ASSESSMENT_RECEIVED',
    'ASSESSMENT_COMPLETED','WRITTEN_TEST_RECEIVED','WRITTEN_TEST_COMPLETED',
    'INTERVIEW_SCHEDULED','OFFER_RECEIVED','CLOSED','NOTE','OTHER')),
  title TEXT NOT NULL, stage TEXT, channel TEXT,
  event_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL, remind_at TEXT NOT NULL,
  completed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('TECHNICAL','HR','MANAGER','CROSS_FUNCTIONAL','OTHER')),
  round TEXT NOT NULL, interview_at TEXT NOT NULL,
  duration_minutes INTEGER, format TEXT, result TEXT,
  overall_performance TEXT, strengths TEXT, gaps TEXT,
  knowledge_gaps TEXT, next_prep TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE interview_questions (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question TEXT NOT NULL, category TEXT NOT NULL,
  my_answer TEXT, better_answer TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE profile (
  id TEXT PRIMARY KEY CHECK(id = 'default'), name TEXT, phone TEXT, email TEXT,
  gender TEXT, birthday TEXT, hometown TEXT, current_city TEXT,
  expected_city TEXT, expected_salary TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE education (
  id TEXT PRIMARY KEY, school TEXT NOT NULL, degree TEXT, major TEXT,
  start_date TEXT, end_date TEXT, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT,
  start_date TEXT, end_date TEXT, description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY, field_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL, value TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE autofill_mappings (
  id TEXT PRIMARY KEY, hostname TEXT NOT NULL,
  field_signature TEXT NOT NULL, profile_field TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(hostname, field_signature)
);
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_company ON jobs(company_id, archived_at);
CREATE INDEX idx_applications_stage ON applications(current_stage, archived_at);
CREATE INDEX idx_applications_next_action ON applications(next_action_at);
CREATE INDEX idx_events_timeline ON application_events(application_id, event_at DESC);
CREATE INDEX idx_reminders_due ON reminders(remind_at, completed_at);
CREATE INDEX idx_interviews_schedule ON interviews(interview_at);
CREATE INDEX idx_questions_category ON interview_questions(category);
CREATE INDEX idx_listings_job_capture ON job_listings(job_id, captured_at DESC);
CREATE INDEX idx_listings_url ON job_listings(url);
CREATE UNIQUE INDEX idx_one_primary_listing_per_job
  ON job_listings(job_id) WHERE is_primary = 1;
CREATE TABLE job_search_map (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE
);
-- Optional FTS5 support. The migration runner records the LIKE fallback if this fails.
CREATE VIRTUAL TABLE job_search USING fts5(company_name, title, city,
  jd_text, requirements, notes);
