-- 已确认提案的提交回执与数据在同一事务落盘；请求重试不会重复创建投递。
CREATE TABLE journal_plan_receipts (
  id TEXT PRIMARY KEY,
  request TEXT NOT NULL,
  result TEXT NOT NULL,
  committed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
