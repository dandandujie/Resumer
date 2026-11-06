-- 导入身份是持久事实，不再寄存在可整体清空的检索投影中。
CREATE TABLE knowledge_imports (
  digest TEXT PRIMARY KEY,
  source_path TEXT NOT NULL
);
CREATE INDEX idx_knowledge_imports_source ON knowledge_imports(source_path);
INSERT INTO knowledge_imports(digest, source_path)
SELECT raw_sha256, path FROM knowledge_pages WHERE raw_sha256 IS NOT NULL;
