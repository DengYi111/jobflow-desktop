ALTER TABLE applications ADD COLUMN stage_notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(stage_notification_enabled IN (0,1));
ALTER TABLE applications ADD COLUMN stage_notification_at TEXT;
ALTER TABLE applications ADD COLUMN stage_notification_sent_at TEXT;
ALTER TABLE applications ADD COLUMN next_action_notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(next_action_notification_enabled IN (0,1));
ALTER TABLE applications ADD COLUMN next_action_notification_at TEXT;
ALTER TABLE applications ADD COLUMN next_action_notification_sent_at TEXT;
ALTER TABLE interviews ADD COLUMN completed_at TEXT;

CREATE INDEX idx_applications_stage_notifications ON applications(stage_notification_at, stage_notification_sent_at) WHERE stage_notification_enabled=1;
CREATE INDEX idx_applications_action_notifications ON applications(next_action_notification_at, next_action_notification_sent_at) WHERE next_action_notification_enabled=1;
