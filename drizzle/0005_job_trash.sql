ALTER TABLE jobs ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_jobs_deleted ON jobs(deleted_at);
