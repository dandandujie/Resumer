-- 未登记的旧简历自然作为独立基础；来源 ID 不设外键，删除来源不删除派生。
CREATE TABLE resume_workspace (
    resume_id TEXT PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    base_resume_id TEXT NOT NULL,
    base_title TEXT NOT NULL,
    source_resume_id TEXT NOT NULL,
    source_title TEXT NOT NULL,
    source_snapshot TEXT NOT NULL CHECK(json_valid(source_snapshot)),
    source_hash TEXT NOT NULL,
    context TEXT NOT NULL CHECK(json_valid(context)),
    request_id TEXT NOT NULL,
    request_payload TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, request_id)
);
CREATE INDEX resume_workspace_base ON resume_workspace(user_id, base_resume_id);
