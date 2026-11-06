//! 一次审阅对应一次提交：版本比较、批次写入和重试回执共享同一事务。
use super::journal::{self, Application};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub before: Option<Application>,
    pub after: Application,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub entries: Vec<Entry>,
}
fn content(app: &Application) -> Result<serde_json::Value, String> {
    let mut value = serde_json::to_value(app).map_err(|e| e.to_string())?;
    // 数据库管理时间，前端的延迟保存可能跨秒；比较全部实际内容避免秒级版本碰撞。
    value.as_object_mut().unwrap().remove("createdAt");
    value.as_object_mut().unwrap().remove("updatedAt");
    Ok(value)
}
pub fn commit(conn: &mut Connection, plan: &Plan) -> Result<Vec<Application>, String> {
    if plan.id.trim().is_empty()
        || plan.id.len() > 128
        || plan.entries.is_empty()
        || plan.entries.len() > 100
    {
        return Err("投递提案无效".into());
    }
    let request = serde_json::to_string(plan).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if let Some((previous, result)) = tx
        .query_row(
            "SELECT request,result FROM journal_plan_receipts WHERE id=?1",
            [&plan.id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        if previous != request {
            return Err("提案标识已用于其他变更，请重新整理".into());
        }
        return serde_json::from_str(&result).map_err(|e| e.to_string());
    }
    let mut ids = HashSet::new();
    // 先检查所有目标；后续保存失败也由事务回滚全部记录。
    for entry in &plan.entries {
        let id = &entry.after.id;
        if id.trim().is_empty()
            || !ids.insert(id)
            || entry.before.as_ref().is_some_and(|b| b.id != *id)
        {
            return Err("投递提案包含重复或不匹配的目标".into());
        }
        let current = journal::find_application(&tx, id).map_err(|e| e.to_string())?;
        let unchanged = match (&entry.before, &current) {
            (None, None) => true,
            (Some(before), Some(current)) => content(before)? == content(current)?,
            _ => false,
        };
        if !unchanged {
            return Err("生成提案后内容已有变化，请重新整理；未写入任何投递记录".into());
        }
    }
    let mut saved = Vec::new();
    for entry in &plan.entries {
        saved.push(journal::save_application(&tx, &entry.after).map_err(|e| e.to_string())?);
    }
    let result = serde_json::to_string(&saved).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO journal_plan_receipts(id,request,result) VALUES (?1,?2,?3)",
        params![plan.id, request, result],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn connection() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&c).unwrap();
        c
    }
    fn app(id: &str) -> Application {
        serde_json::from_value(serde_json::json!({"id":id,"company":id})).unwrap()
    }
    fn new_plan() -> Plan {
        Plan {
            id: "review-1".into(),
            entries: vec![
                Entry {
                    before: None,
                    after: app("a"),
                },
                Entry {
                    before: None,
                    after: app("b"),
                },
            ],
        }
    }
    #[test]
    fn failure_rolls_back_and_retry_receipt_prevents_duplicate_creation() {
        let mut c = connection();
        let p = new_plan();
        c.execute_batch("CREATE TRIGGER fail_second BEFORE INSERT ON applications WHEN NEW.id='b' BEGIN SELECT RAISE(ABORT,'injected write failure'); END;").unwrap();
        assert!(commit(&mut c, &p).unwrap_err().contains("injected"));
        assert!(journal::list_applications(&c).unwrap().is_empty());
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM journal_plan_receipts", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        c.execute_batch("DROP TRIGGER fail_second").unwrap();
        let first = commit(&mut c, &p).unwrap();
        assert_eq!(
            serde_json::to_value(&first).unwrap(),
            serde_json::to_value(commit(&mut c, &p).unwrap()).unwrap()
        );
        assert_eq!(journal::list_applications(&c).unwrap().len(), 2);
        // 已提交之后的手动编辑不能被回执重试改回去。
        let mut changed = first[0].clone();
        changed.notes = "之后的新编辑".into();
        journal::save_application(&c, &changed).unwrap();
        commit(&mut c, &p).unwrap();
        assert_eq!(
            journal::find_application(&c, "a").unwrap().unwrap().notes,
            "之后的新编辑"
        );
        let mut collision = p.clone();
        collision.entries[0].after.company = "不同请求".into();
        assert!(commit(&mut c, &collision).is_err());
    }
    #[test]
    fn checks_entire_snapshot_even_when_edits_share_the_same_second() {
        let mut c = connection();
        let original = journal::save_application(&c, &app("existing")).unwrap();
        let mut after = original.clone();
        after.role = "AI岗位".into();
        let p = Plan {
            id: "review-2".into(),
            entries: vec![
                Entry {
                    before: None,
                    after: app("new"),
                },
                Entry {
                    before: Some(original.clone()),
                    after,
                },
            ],
        };
        let mut changed = original;
        changed.notes = "用户编辑".into();
        journal::save_application(&c, &changed).unwrap();
        assert!(commit(&mut c, &p).unwrap_err().contains("已有变化"));
        assert!(journal::find_application(&c, "new").unwrap().is_none());
        assert_eq!(
            journal::find_application(&c, "existing")
                .unwrap()
                .unwrap()
                .notes,
            "用户编辑"
        );
    }
}
