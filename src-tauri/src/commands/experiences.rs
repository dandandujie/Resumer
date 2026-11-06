use super::{CommandError, knowledge_ai::err};
use crate::db::AppDb;
use serde_json::{Value, json};
use tauri::State;

#[tauri::command]
pub fn experiences_list(db: State<AppDb>) -> Result<Vec<Value>, CommandError> {
    let c = db.conn.lock().map_err(err)?;
    let mut stmt=c.prepare("SELECT e.id,e.company,e.position,e.kind,e.started_on,e.current,(SELECT count(*) FROM work_notes n WHERE n.experience_id=e.id) FROM work_experiences e ORDER BY e.current DESC,e.started_on DESC,e.created_at DESC")?;
    Ok(stmt.query_map([],|r| Ok(json!({"id":r.get::<_,String>(0)?,"company":r.get::<_,String>(1)?,"position":r.get::<_,String>(2)?,"kind":r.get::<_,String>(3)?,"startedOn":r.get::<_,String>(4)?,"current":r.get::<_,bool>(5)?,"noteCount":r.get::<_,i64>(6)?})))?.collect::<Result<Vec<_>,_>>()?)
}
#[tauri::command]
pub fn experiences_save(db: State<AppDb>, experience: Value) -> Result<(), CommandError> {
    let text = |key: &str| experience[key].as_str().unwrap_or("");
    if uuid::Uuid::parse_str(text("id")).is_err()
        || text("company").trim().is_empty()
        || text("position").trim().is_empty()
        || text("company").chars().count() > 120
        || text("position").chars().count() > 120
        || !matches!(text("kind"), "work" | "internship")
        || text("startedOn").len() != 10
        || chrono::NaiveDate::parse_from_str(text("startedOn"), "%Y-%m-%d").is_err()
    {
        return Err(err("请填写公司、职位和有效的开始日期"));
    }
    let c = db.conn.lock().map_err(err)?;
    c.execute("INSERT INTO work_experiences(id,company,position,kind,started_on,current) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET company=excluded.company,position=excluded.position,kind=excluded.kind,started_on=excluded.started_on,current=excluded.current",rusqlite::params![text("id"),text("company").trim(),text("position").trim(),text("kind"),text("startedOn"),experience["current"].as_bool().unwrap_or(true)])?;
    Ok(())
}
#[tauri::command]
pub fn experiences_assign(
    db: State<AppDb>,
    ids: Vec<String>,
    experience_id: String,
) -> Result<(), CommandError> {
    let mut c = db.conn.lock().map_err(err)?;
    assign(&mut c, &ids, &experience_id).map_err(err)
}
pub(crate) fn assign(
    c: &mut rusqlite::Connection,
    ids: &[String],
    experience_id: &str,
) -> Result<(), String> {
    if ids.is_empty() || ids.len() > 100 {
        return Err("请选择1至100条旧记录".into());
    }
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        if tx.execute("UPDATE work_notes SET experience_id=?1,revision=revision+1,analysis=NULL WHERE id=?2 AND experience_id IS NULL",rusqlite::params![experience_id,id]).map_err(|e|e.to_string())?!=1 {return Err("记录归属已变化，请刷新后再归组".into());}
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn same_display_label_never_crosses_experience_boundaries() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&c).unwrap();
        for id in ["first", "second"] {
            c.execute("INSERT INTO work_experiences(id,company,position,kind,started_on) VALUES(?1,'同名公司','同名职位','work','2026-01-01')",[id]).unwrap();
            crate::db::repo::work_notes::save(&c,&json!({"id":id,"experienceId":id,"context":"同名公司 · 同名职位","body":format!("只属于{id}的原话"),"occurredOn":"2026-11-01"}),None).unwrap();
        }
        let notes =
            crate::db::repo::work_notes::list_for_experience(&c, "", None, 0, Some("first"))
                .unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0]["experienceId"], "first");
        assert!(
            crate::db::repo::work_notes::list_for_experience(&c, "second", None, 0, Some("first"))
                .unwrap()
                .is_empty()
        );
        assert!(crate::db::repo::work_notes::save(&c,&json!({"id":"early","experienceId":"first","context":"同名公司","body":"尚未开始的工作","occurredOn":"2025-12-01"}),None).is_err());
    }
    #[test]
    fn legacy_grouping_is_explicit_atomic_and_invalidates_old_proposals() {
        let mut c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&c).unwrap();
        c.execute("INSERT INTO work_experiences(id,company,position,kind,started_on) VALUES('e','相同公司','产品','internship','2026-01-01')",[]).unwrap();
        let n = json!({"id":"n","body":"原话不能丢","context":"旧标签","occurredOn":"2026-02-01"});
        let old = crate::db::repo::work_notes::save(&c, &n, None).unwrap();
        assert!(old["experienceId"].is_null());
        assert!(assign(&mut c, &["n".into(), "missing".into()], "e").is_err());
        assert!(crate::db::repo::work_notes::get(&c, "n").unwrap()["experienceId"].is_null());
        assign(&mut c, &["n".into()], "e").unwrap();
        let saved = crate::db::repo::work_notes::get(&c, "n").unwrap();
        assert_eq!(saved["body"], old["body"]);
        assert_eq!(saved["context"], old["context"]);
        assert_eq!(saved["experienceId"], "e");
        assert!(!crate::db::repo::work_notes::sources_current(&c, &[old]));
        assert!(assign(&mut c, &["n".into()], "e").is_err());
    }
}
