ALTER TABLE interviews ADD COLUMN notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(notification_enabled IN (0,1));
ALTER TABLE interviews ADD COLUMN notification_at TEXT;
ALTER TABLE interviews ADD COLUMN notification_sent_at TEXT;

CREATE UNIQUE INDEX idx_resume_relative_path ON resume_versions(relative_path COLLATE NOCASE);
