-- 原话独立于简历：离职、删除简历不会丢掉积累的工作片段。
CREATE TABLE IF NOT EXISTS work_notes (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    occurred_on TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    analysis TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS work_notes_context_date ON work_notes(context, occurred_on DESC);
CREATE TABLE IF NOT EXISTS work_note_drafts (
    slot TEXT PRIMARY KEY,
    data TEXT NOT NULL
);
