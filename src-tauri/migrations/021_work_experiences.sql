CREATE TABLE work_experiences (
 id TEXT PRIMARY KEY, company TEXT NOT NULL, position TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('work','internship')),
 started_on TEXT NOT NULL, current INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
ALTER TABLE work_notes ADD COLUMN experience_id TEXT REFERENCES work_experiences(id);
CREATE INDEX work_notes_experience_date ON work_notes(experience_id,occurred_on);
