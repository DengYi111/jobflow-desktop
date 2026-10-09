ALTER TABLE interviews ADD COLUMN ended_at TEXT;
DROP INDEX idx_interviews_active_application_round;

-- A rejection ends any open round; retain the interview record and its review data.
UPDATE interviews
SET ended_at = cancelled_at, cancelled_at = NULL
WHERE cancelled_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM applications a
    WHERE a.id = interviews.application_id
      AND a.current_stage = 'CLOSED'
      AND a.close_reason = 'REJECTED'
  );

CREATE UNIQUE INDEX idx_interviews_active_application_round
  ON interviews(application_id, round_number)
  WHERE round_number IS NOT NULL AND cancelled_at IS NULL AND ended_at IS NULL;
