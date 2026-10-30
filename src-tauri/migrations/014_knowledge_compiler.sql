-- 原文、人工校对稿与可复用知识分层；AI提案先持久化，采纳时校验来源/页面版本。
CREATE TABLE knowledge_asset_notes (
 asset_id TEXT PRIMARY KEY REFERENCES knowledge_assets(id) ON DELETE CASCADE,
 transcript TEXT NOT NULL DEFAULT '',
 distillation TEXT NOT NULL DEFAULT '',
 transcription_parts TEXT NOT NULL DEFAULT '{}',
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE knowledge_ai_chunks (
 source_key TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 model_key TEXT NOT NULL,
 chunk_index INTEGER NOT NULL,
 asset_id TEXT REFERENCES knowledge_assets(id) ON DELETE CASCADE,
 recording_id TEXT REFERENCES interview_recordings(id) ON DELETE CASCADE,
 content TEXT NOT NULL,
 PRIMARY KEY(source_key,source_hash,model_key,chunk_index),
 CHECK ((asset_id IS NULL) != (recording_id IS NULL))
);
CREATE TABLE knowledge_drafts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('distill','wiki','answer','maintenance')),
 collection_id TEXT REFERENCES knowledge_collections(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL DEFAULT '',
 source_hash TEXT NOT NULL DEFAULT '',
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','discarded')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 applied_at INTEGER
);
CREATE INDEX knowledge_drafts_status ON knowledge_drafts(status,created_at DESC);
