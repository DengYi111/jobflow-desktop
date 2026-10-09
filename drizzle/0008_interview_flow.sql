-- @jobflow: foreign-keys-off

ALTER TABLE interviews ADD COLUMN round_number INTEGER;
ALTER TABLE interviews ADD COLUMN cancelled_at TEXT;
ALTER TABLE applications ADD COLUMN interview_return_stage TEXT;
ALTER TABLE application_events ADD COLUMN interview_id TEXT REFERENCES interviews(id) ON DELETE CASCADE;
ALTER TABLE application_events ADD COLUMN interview_round_number INTEGER;

CREATE INDEX idx_events_interview_round ON application_events(interview_id, interview_round_number)
  WHERE interview_id IS NOT NULL;

CREATE TABLE applications_new (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  current_stage TEXT NOT NULL CHECK(current_stage IN (
    'TO_APPLY','APPLIED','ASSESSMENT_PENDING','ASSESSMENT_DONE',
    'WRITTEN_TEST_PENDING','WRITTEN_TEST_DONE','INTERVIEW_PENDING',
    'INTERVIEW_DONE','TECH_INTERVIEW','HR_INTERVIEW','OFFER_COMMUNICATION','OFFER','CLOSED')),
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  resume_version_id TEXT REFERENCES resume_versions(id) ON DELETE SET NULL,
  applied_at TEXT,
  next_action TEXT,
  next_action_at TEXT,
  close_reason TEXT CHECK(close_reason IS NULL OR close_reason IN (
    'REJECTED','VOLUNTARY','HC_CLOSED','NO_RESPONSE','OFFER_DECLINED','OTHER')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stage_notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(stage_notification_enabled IN (0,1)),
  stage_notification_at TEXT,
  stage_notification_sent_at TEXT,
  next_action_notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(next_action_notification_enabled IN (0,1)),
  next_action_notification_at TEXT,
  next_action_notification_sent_at TEXT,
  interview_return_stage TEXT
);

INSERT INTO applications_new (
  id,job_id,current_stage,priority,pinned,resume_version_id,applied_at,next_action,next_action_at,
  close_reason,archived_at,created_at,updated_at,stage_notification_enabled,stage_notification_at,
  stage_notification_sent_at,next_action_notification_enabled,next_action_notification_at,
  next_action_notification_sent_at,interview_return_stage
)
SELECT a.id,a.job_id,
  CASE WHEN a.current_stage IN ('TECH_INTERVIEW','HR_INTERVIEW') THEN
    CASE WHEN EXISTS (
      SELECT 1 FROM interviews i WHERE i.application_id=a.id AND i.completed_at IS NULL AND i.cancelled_at IS NULL
    ) THEN 'INTERVIEW_PENDING' ELSE 'INTERVIEW_DONE' END
  ELSE a.current_stage END,
  a.priority,a.pinned,a.resume_version_id,a.applied_at,a.next_action,a.next_action_at,
  a.close_reason,a.archived_at,a.created_at,a.updated_at,a.stage_notification_enabled,a.stage_notification_at,
  a.stage_notification_sent_at,a.next_action_notification_enabled,a.next_action_notification_at,
  a.next_action_notification_sent_at,a.interview_return_stage
FROM applications a;

DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;

CREATE INDEX idx_applications_stage ON applications(current_stage);
CREATE INDEX idx_applications_next_action ON applications(next_action_at);
CREATE INDEX idx_applications_stage_notifications ON applications(stage_notification_at, stage_notification_sent_at)
  WHERE stage_notification_enabled=1;
CREATE INDEX idx_applications_action_notifications ON applications(next_action_notification_at, next_action_notification_sent_at)
  WHERE next_action_notification_enabled=1;

CREATE UNIQUE INDEX idx_interviews_active_application_round
  ON interviews(application_id, round_number)
  WHERE round_number IS NOT NULL AND cancelled_at IS NULL;
