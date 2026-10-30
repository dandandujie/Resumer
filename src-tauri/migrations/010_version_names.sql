-- 用户名称与导出格式、投递目标等事件信息分开保存，重命名不能篡改事件。
ALTER TABLE resume_versions ADD COLUMN name TEXT NOT NULL DEFAULT '';
