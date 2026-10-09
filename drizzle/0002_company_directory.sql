ALTER TABLE companies ADD COLUMN industry_id TEXT;
ALTER TABLE companies ADD COLUMN directory_id TEXT;

CREATE INDEX idx_companies_industry ON companies(industry_id, archived_at);
CREATE UNIQUE INDEX idx_companies_directory_id ON companies(directory_id) WHERE directory_id IS NOT NULL;
