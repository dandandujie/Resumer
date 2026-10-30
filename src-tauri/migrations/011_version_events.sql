CREATE TABLE IF NOT EXISTS resume_version_events (
 id INTEGER PRIMARY KEY, version_id TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
 event TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 UNIQUE(version_id,event,label)
);
INSERT OR IGNORE INTO resume_version_events(version_id,event,label,created_at)
 SELECT id,event,label,created_at FROM resume_versions;
