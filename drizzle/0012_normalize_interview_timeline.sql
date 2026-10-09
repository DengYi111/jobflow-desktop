UPDATE interviews
SET round = '第 ' || coalesce(round_number, 1) || ' 面'
WHERE round LIKE '%技术一面%';

UPDATE application_events
SET title = replace(title, '技术一面', '技术面'),
    notes = CASE WHEN notes IS NULL THEN NULL ELSE replace(notes, '技术一面', '技术面') END
WHERE title LIKE '%技术一面%' OR notes LIKE '%技术一面%';

UPDATE application_events
SET title = '第 ' || interview_round_number || ' 面'
WHERE interview_id IS NOT NULL
  AND interview_round_number IS NOT NULL
  AND stage = 'INTERVIEW_DONE';

DELETE FROM application_events
WHERE interview_id IS NOT NULL
  AND interview_round_number IS NOT NULL
  AND id NOT IN (
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY interview_id, interview_round_number
               ORDER BY created_at ASC, event_at ASC, id ASC
             ) AS duplicate_number
      FROM application_events
      WHERE interview_id IS NOT NULL
        AND interview_round_number IS NOT NULL
    )
    WHERE duplicate_number = 1
  );

DROP INDEX idx_events_interview_round;
CREATE UNIQUE INDEX idx_events_interview_round
  ON application_events(interview_id, interview_round_number)
  WHERE interview_id IS NOT NULL AND interview_round_number IS NOT NULL;
