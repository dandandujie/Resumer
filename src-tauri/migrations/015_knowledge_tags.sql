-- 旧分类作为一个完整标签迁移，不按逗号等字符猜测拆分，避免改变原有含义；仅去除作为标签语法的前置 #。
CREATE TABLE IF NOT EXISTS knowledge_collection_tags (
 collection_id TEXT NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
 tag TEXT NOT NULL COLLATE NOCASE CHECK(length(tag)>0 AND length(tag)<=80),
 PRIMARY KEY(collection_id,tag)
);
CREATE INDEX IF NOT EXISTS knowledge_tags_lookup ON knowledge_collection_tags(tag,collection_id);
INSERT OR IGNORE INTO knowledge_collection_tags(collection_id,tag)
 SELECT id,trim(ltrim(trim(category),'#')) FROM knowledge_collections WHERE trim(ltrim(trim(category),'#'))<>'';
