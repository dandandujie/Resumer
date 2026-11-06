-- 自包含快照保留练习依据，即使原简历被删除也不丢失问答。
CREATE TABLE IF NOT EXISTS interview_practice (
    id TEXT PRIMARY KEY,
    resume_id TEXT NOT NULL,
    application_id TEXT,
    version_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS interview_practice_resume ON interview_practice(resume_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS practice_review (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    finding_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','mastered')),
    note TEXT NOT NULL DEFAULT '',
    UNIQUE(session_id, finding_index),
    FOREIGN KEY(session_id) REFERENCES interview_practice(id) ON DELETE CASCADE
);
