-- Job archiving was replaced by the applied stage. Keep the legacy columns for
-- database compatibility, but clear their values and stop indexing them.
UPDATE applications
SET current_stage = 'APPLIED', archived_at = NULL
WHERE archived_at IS NOT NULL
   OR job_id IN (SELECT id FROM jobs WHERE archived_at IS NOT NULL);

UPDATE jobs SET archived_at = NULL WHERE archived_at IS NOT NULL;

DROP INDEX IF EXISTS idx_jobs_company;
CREATE INDEX idx_jobs_company ON jobs(company_id);

DROP INDEX IF EXISTS idx_applications_stage;
CREATE INDEX idx_applications_stage ON applications(current_stage);
