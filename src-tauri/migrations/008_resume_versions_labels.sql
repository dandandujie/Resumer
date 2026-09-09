-- 008：版本历史扩展。
-- 去掉 event 的 CHECK 约束（新增 export / apply / restore 事件），增加 label（人可读的事件说明，
-- 如"投递：字节跳动 · 后端"）与 content_hash（同内容去重 / 会话内合并）。
-- SQLite 不能修改 CHECK，只能重建表并搬数据。
CREATE TABLE resume_versions_next (
    id TEXT PRIMARY KEY,
    resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    resume_title TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO resume_versions_next (id, resume_id, user_id, event, resume_title, snapshot, created_at)
    SELECT id, resume_id, user_id, event, resume_title, snapshot, created_at FROM resume_versions;
DROP TABLE resume_versions;
ALTER TABLE resume_versions_next RENAME TO resume_versions;
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_created
    ON resume_versions(resume_id, created_at DESC);

-- 投递记录关联"投出去的那一版"。
ALTER TABLE applications ADD COLUMN resume_version_id TEXT;
