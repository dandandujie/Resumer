-- 原始录音与可校对的转写分开保存；挂在投递下，轮次可稍后选择。
CREATE TABLE interview_recordings (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    round_id TEXT,
    library_asset_id TEXT REFERENCES knowledge_assets(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    extension TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    transcription_parts TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(application_id,sha256)
);
CREATE INDEX interview_recordings_application ON interview_recordings(application_id);
