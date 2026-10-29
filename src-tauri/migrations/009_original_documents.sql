-- 文档内容不可变，版本只引用哈希；同一文件的复制和投递快照不重复存储大块二进制。
CREATE TABLE document_blobs (
    hash TEXT PRIMARY KEY,
    bytes BLOB NOT NULL
);
CREATE TABLE resume_documents (
    resume_id TEXT PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_hash TEXT NOT NULL REFERENCES document_blobs(hash),
    current_hash TEXT NOT NULL REFERENCES document_blobs(hash),
    revision INTEGER NOT NULL DEFAULT 1
);
