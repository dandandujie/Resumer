CREATE TABLE IF NOT EXISTS knowledge_collections (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL CHECK(kind IN ('document','skill')), enabled INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS knowledge_assets (
 id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, extension TEXT NOT NULL, storage_path TEXT NOT NULL,
 sha256 TEXT NOT NULL, status TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(collection_id,sha256)
);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
 asset_id UNINDEXED, position UNINDEXED, title, body, tokenize='trigram'
);
