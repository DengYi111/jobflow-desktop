ALTER TABLE interviews ADD COLUMN mode TEXT;
ALTER TABLE interviews ADD COLUMN location TEXT;

CREATE TRIGGER interviews_mode_insert_check
BEFORE INSERT ON interviews
WHEN NEW.mode IS NOT NULL AND NEW.mode NOT IN ('ONLINE','OFFLINE')
BEGIN
  SELECT RAISE(ABORT, 'Invalid interview mode');
END;

CREATE TRIGGER interviews_mode_update_check
BEFORE UPDATE OF mode ON interviews
WHEN NEW.mode IS NOT NULL AND NEW.mode NOT IN ('ONLINE','OFFLINE')
BEGIN
  SELECT RAISE(ABORT, 'Invalid interview mode');
END;

CREATE TABLE internships (
  id TEXT PRIMARY KEY,
  employer TEXT NOT NULL,
  role TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_internships_order ON internships(sort_order,id);
