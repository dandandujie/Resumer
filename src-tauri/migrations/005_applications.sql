-- 求职动态入库：投递记录与模拟面试存档从 localStorage 迁到 SQLite，
-- 与简历同库同备份。resume_id 可空且 ON DELETE SET NULL——删掉一份简历
-- 不应抹掉"我投过这家公司"的事实。
CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    applied_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    hr_name TEXT NOT NULL DEFAULT '',
    hr_contact TEXT NOT NULL DEFAULT '',
    jd TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    next_follow_up TEXT NOT NULL DEFAULT '',
    -- 面试轮次数组与结果对象直接存 JSON：它们只随所属投递整体读写，不需要单独查询。
    interviews TEXT NOT NULL DEFAULT '[]',
    outcome TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_applications_resume ON applications(resume_id);
CREATE INDEX IF NOT EXISTS idx_applications_updated ON applications(updated_at DESC);

CREATE TABLE IF NOT EXISTS mock_interviews (
    id TEXT PRIMARY KEY,
    resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
    application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    feedback TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mock_interviews_resume ON mock_interviews(resume_id);

-- 全局 Agent 的会话归档已随功能移除。
DROP TABLE IF EXISTS session_archives;
