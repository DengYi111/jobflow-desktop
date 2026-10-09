CREATE TEMP TABLE migrated_interview_rounds AS
  SELECT
    application_id,
    id,
    COALESCE((
      SELECT MAX(existing.round_number)
      FROM interviews AS existing
      WHERE existing.application_id = legacy.application_id
    ), 0) + ROW_NUMBER() OVER (
      PARTITION BY application_id
      ORDER BY interview_at, created_at, id
    ) AS normalized_round
  FROM interviews AS legacy
  WHERE round_number IS NULL;

UPDATE interviews
SET round_number = (
      SELECT normalized_round FROM migrated_interview_rounds WHERE migrated_interview_rounds.id = interviews.id
    ),
    round = '第 ' || (
      SELECT normalized_round FROM migrated_interview_rounds WHERE migrated_interview_rounds.id = interviews.id
    ) || ' 面'
WHERE id IN (SELECT id FROM migrated_interview_rounds);

UPDATE application_events AS event
SET interview_id = (
      SELECT interview.id
      FROM migrated_interview_rounds AS migrated
      JOIN interviews AS interview ON interview.id = migrated.id
      WHERE migrated.application_id = event.application_id
        AND interview.interview_at = event.event_at
      ORDER BY interview.created_at, interview.id
      LIMIT 1
    ),
    interview_round_number = (
      SELECT migrated.normalized_round
      FROM migrated_interview_rounds AS migrated
      JOIN interviews AS interview ON interview.id = migrated.id
      WHERE migrated.application_id = event.application_id
        AND interview.interview_at = event.event_at
      ORDER BY interview.created_at, interview.id
      LIMIT 1
    )
WHERE event.interview_id IS NULL
  AND event.stage IN ('INTERVIEW_DONE', 'TECH_INTERVIEW', 'HR_INTERVIEW')
  AND EXISTS (
    SELECT 1
    FROM migrated_interview_rounds AS migrated
    JOIN interviews AS interview ON interview.id = migrated.id
    WHERE migrated.application_id = event.application_id
      AND interview.interview_at = event.event_at
  );

INSERT INTO application_events (
  id, application_id, type, title, stage, event_at, notes,
  interview_id, interview_round_number, created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  i.application_id, 'OTHER', '第 ' || i.round_number || ' 面', 'INTERVIEW_DONE', i.interview_at,
  '面试时间：' || i.interview_at, i.id, i.round_number, COALESCE(i.updated_at, i.created_at)
FROM interviews AS i
WHERE i.completed_at IS NOT NULL
  AND i.cancelled_at IS NULL
  AND i.round_number IS NOT NULL
  AND i.id IN (SELECT id FROM migrated_interview_rounds)
  AND NOT EXISTS (
    SELECT 1 FROM application_events AS e
    WHERE e.interview_id = i.id AND e.interview_round_number = i.round_number
  );

DROP TABLE migrated_interview_rounds;
