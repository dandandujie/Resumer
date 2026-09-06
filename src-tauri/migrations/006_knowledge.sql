CREATE TABLE IF NOT EXISTS knowledge_pages (
  path TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  path UNINDEXED, title, tags, body, tokenize='trigram'
);
