ALTER TABLE knowledge_pages ADD COLUMN raw_sha256 TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_pages_raw_sha256
  ON knowledge_pages(raw_sha256) WHERE raw_sha256 IS NOT NULL;
