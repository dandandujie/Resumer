//! 派生是独立工作稿；来源冻结在自身记录里，不依赖可删除的历史版本。
use super::{document, resume, version};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Clone, Default, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub job_description: String,
}

impl Context {
    fn validate(&self) -> Result<(), String> {
        if self.goal.trim().is_empty() || self.goal.chars().count() > 4000 {
            return Err("使用目标须为 1–4000 个字符".into());
        }
        if self.company.chars().count() > 200 || self.role.chars().count() > 200 {
            return Err("公司和岗位分别不能超过 200 个字符".into());
        }
        if self.job_description.chars().count() > 40000 {
            return Err("岗位描述不能超过 40000 个字符".into());
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveRequest {
    pub request_id: String,
    pub source_resume_id: String,
    pub title: String,
    #[serde(flatten)]
    pub context: Context,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub resume_id: String,
    pub base_resume_id: String,
    pub base_title: String,
    pub source_resume_id: Option<String>,
    pub source_title: Option<String>,
    pub context: Option<Context>,
    pub created_at: Option<i64>,
    pub source_changed: bool,
    pub source_missing: bool,
    pub base_missing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    #[serde(flatten)]
    pub metadata: Metadata,
    pub source_snapshot: Option<Value>,
}

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn frozen(
    conn: &Connection,
    source: &resume::ResumeWithSections,
) -> Result<(Value, String), String> {
    let mut snapshot = serde_json::to_value(source).map_err(err)?;
    let mut hash = version::content_hash(source);
    if let Some(doc) = document::reference(conn, &source.resume.id).map_err(err)? {
        hash = format!(
            "{:x}",
            Sha256::digest(format!(
                "{hash}:{}:{}:{}",
                doc.filename, doc.original_hash, doc.current_hash
            ))
        );
        snapshot["originalDocument"] = serde_json::to_value(doc).map_err(err)?;
    }
    Ok((snapshot, hash))
}

pub fn get(conn: &Connection, user_id: &str, resume_id: &str) -> Result<Detail, String> {
    let current = resume::find_by_id(conn, resume_id, user_id)
        .map_err(err)?
        .ok_or("简历不存在")?;
    let stored = conn.query_row(
        "SELECT base_resume_id,base_title,source_resume_id,source_title,context,created_at,source_snapshot,source_hash FROM resume_workspace WHERE resume_id=?1 AND user_id=?2",
        params![resume_id,user_id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,i64>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?))
    ).optional().map_err(err)?;
    if let Some((
        base_id,
        base_title,
        source_id,
        source_title,
        context,
        created_at,
        snapshot,
        hash,
    )) = stored
    {
        let source = resume::find_by_id(conn, &source_id, user_id).map_err(err)?;
        let source_changed = source
            .as_ref()
            .map(|s| frozen(conn, s).map(|(_, h)| h != hash))
            .transpose()?
            .unwrap_or(false);
        let base = resume::find_by_id(conn, &base_id, user_id).map_err(err)?;
        Ok(Detail {
            metadata: Metadata {
                resume_id: resume_id.into(),
                base_resume_id: base_id,
                base_title: base
                    .as_ref()
                    .map(|b| b.resume.title.clone())
                    .unwrap_or(base_title),
                source_resume_id: Some(source_id),
                source_title: Some(source_title),
                context: Some(serde_json::from_str(&context).map_err(err)?),
                created_at: Some(created_at),
                source_changed,
                source_missing: source.is_none(),
                base_missing: base.is_none(),
            },
            source_snapshot: Some(serde_json::from_str(&snapshot).map_err(err)?),
        })
    } else {
        Ok(Detail {
            metadata: Metadata {
                resume_id: resume_id.into(),
                base_resume_id: resume_id.into(),
                base_title: current.resume.title,
                source_resume_id: None,
                source_title: None,
                context: None,
                created_at: None,
                source_changed: false,
                source_missing: false,
                base_missing: false,
            },
            source_snapshot: None,
        })
    }
}

pub fn list(conn: &Connection, user_id: &str) -> Result<Vec<Metadata>, String> {
    resume::find_all_by_user_id(conn, user_id)
        .map_err(err)?
        .into_iter()
        .map(|r| get(conn, user_id, &r.id).map(|d| d.metadata))
        .collect()
}

pub fn derive(
    conn: &mut Connection,
    user_id: &str,
    request: &DeriveRequest,
) -> Result<String, String> {
    uuid::Uuid::parse_str(&request.request_id).map_err(|_| "派生请求 ID 无效")?;
    if request.title.trim().is_empty() || request.title.chars().count() > 200 {
        return Err("简历名称须为 1–200 个字符".into());
    }
    request.context.validate()?;
    let payload = serde_json::to_string(request).map_err(err)?;
    let tx = conn.transaction().map_err(err)?;
    let existing: Option<(String,String)> = tx.query_row("SELECT resume_id,request_payload FROM resume_workspace WHERE user_id=?1 AND request_id=?2",params![user_id,request.request_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(err)?;
    if let Some((id, previous)) = existing {
        return if previous == payload {
            Ok(id)
        } else {
            Err("同一请求 ID 不能用于不同的派生需求".into())
        };
    }
    let source = resume::find_by_id(&tx, &request.source_resume_id, user_id)
        .map_err(err)?
        .ok_or("来源简历不存在")?;
    let lineage = get(&tx, user_id, &request.source_resume_id)?;
    let (snapshot, hash) = frozen(&tx, &source)?;
    let id = resume::duplicate(&tx, &request.source_resume_id, user_id).map_err(err)?;
    resume::update(&tx, &id, user_id, request.title.trim(), None, None).map_err(err)?;
    tx.execute("INSERT INTO resume_workspace(resume_id,user_id,base_resume_id,base_title,source_resume_id,source_title,source_snapshot,source_hash,context,request_id,request_payload) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![id,user_id,lineage.metadata.base_resume_id,lineage.metadata.base_title,request.source_resume_id,source.resume.title,snapshot.to_string(),hash,serde_json::to_string(&request.context).map_err(err)?,request.request_id,payload]).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(id)
}

pub fn update(
    conn: &Connection,
    user_id: &str,
    resume_id: &str,
    context: &Context,
) -> Result<(), String> {
    context.validate()?;
    get(conn, user_id, resume_id)?;
    let changed = conn
        .execute(
            "UPDATE resume_workspace SET context=?1 WHERE resume_id=?2 AND user_id=?3",
            params![
                serde_json::to_string(context).map_err(err)?,
                resume_id,
                user_id
            ],
        )
        .map_err(err)?;
    if changed == 0 {
        return Err("基础简历没有派生需求，请先创建派生简历".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO users(id,fingerprint,settings) VALUES('u','u','{}'),('v','v','{}');",
        )
        .unwrap();
        let source =
            resume::create(&conn, "u", "基础", "modern", "en", &json!({"font":"test"})).unwrap();
        resume::create_section(
            &conn,
            &source,
            "summary",
            "简介",
            7,
            false,
            &json!({"text":"真实成果"}),
        )
        .unwrap();
        (conn, source)
    }
    fn request(source: &str) -> DeriveRequest {
        DeriveRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            source_resume_id: source.into(),
            title: "后端岗位".into(),
            context: Context {
                goal: "中文精简".into(),
                company: "Acme".into(),
                role: "后端".into(),
                job_description: "Rust".into(),
            },
        }
    }
    #[test]
    fn legacy_resumes_are_independent_and_full_copy_has_stable_lineage() {
        let (mut conn, source) = setup();
        let independent = resume::duplicate(&conn, &source, "u").unwrap();
        let old = list(&conn, "u").unwrap();
        assert_eq!(old.len(), 2);
        assert!(
            old.iter()
                .all(|m| m.source_resume_id.is_none() && m.base_resume_id == m.resume_id)
        );
        let req = request(&source);
        let target = derive(&mut conn, "u", &req).unwrap();
        let copied = resume::find_by_id(&conn, &target, "u").unwrap().unwrap();
        assert_eq!(copied.resume.title, req.title);
        assert_eq!(copied.resume.template, "modern");
        assert_eq!(copied.resume.language, "en");
        assert_eq!(copied.resume.theme_config, json!({"font":"test"}));
        assert_eq!(copied.sections[0].sort_order, 7);
        assert!(!copied.sections[0].visible);
        assert_eq!(copied.sections[0].content, json!({"text":"真实成果"}));
        let third = derive(&mut conn, "u", &request(&target)).unwrap();
        let detail = get(&conn, "u", &third).unwrap();
        assert_eq!(detail.metadata.base_resume_id, source);
        assert_eq!(detail.metadata.source_resume_id, Some(target));
        assert_eq!(detail.metadata.context, Some(req.context));
        assert_eq!(
            get(&conn, "u", &independent)
                .unwrap()
                .metadata
                .base_resume_id,
            independent
        );
    }
    #[test]
    fn retries_are_idempotent_and_reusing_request_for_other_payload_is_rejected() {
        let (mut conn, source) = setup();
        let mut req = request(&source);
        let target = derive(&mut conn, "u", &req).unwrap();
        resume::delete(&conn, &source, "u").unwrap();
        assert_eq!(
            derive(&mut conn, "u", &req).unwrap(),
            target,
            "retry succeeds even after source deletion"
        );
        req.context.role = "另一个岗位".into();
        assert!(
            derive(&mut conn, "u", &req)
                .unwrap_err()
                .contains("同一请求")
        );
        assert_eq!(list(&conn, "u").unwrap().len(), 1);
    }
    #[test]
    fn failures_after_copy_roll_back_everything_and_allow_retry() {
        let (mut conn, source) = setup();
        let req = request(&source);
        conn.execute_batch("CREATE TRIGGER fail_lineage BEFORE INSERT ON resume_workspace BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        assert!(
            derive(&mut conn, "u", &req)
                .unwrap_err()
                .contains("injected failure")
        );
        assert_eq!(list(&conn, "u").unwrap().len(), 1);
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM resume_sections", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        conn.execute_batch("DROP TRIGGER fail_lineage;").unwrap();
        derive(&mut conn, "u", &req).unwrap();
        assert_eq!(list(&conn, "u").unwrap().len(), 2);
    }
    #[test]
    fn source_changes_and_deletions_keep_frozen_facts_and_independent_targets() {
        let (mut conn, source) = setup();
        let target = derive(&mut conn, "u", &request(&source)).unwrap();
        let initial = get(&conn, "u", &target).unwrap().source_snapshot.unwrap();
        conn.execute(
            "UPDATE resumes SET updated_at=updated_at+1000 WHERE id=?1",
            [&source],
        )
        .unwrap();
        assert!(!get(&conn, "u", &target).unwrap().metadata.source_changed);
        let section = resume::find_sections_by_resume_id(&conn, &source)
            .unwrap()
            .remove(0);
        resume::update_section(
            &conn,
            &section.id,
            "简介",
            7,
            false,
            &json!({"text":"新事实"}),
        )
        .unwrap();
        assert!(get(&conn, "u", &target).unwrap().metadata.source_changed);
        assert_eq!(
            resume::find_sections_by_resume_id(&conn, &target).unwrap()[0].content,
            json!({"text":"真实成果"})
        );
        let context = Context {
            goal: "继续针对目标优化".into(),
            role: "修改目标".into(),
            ..Context::default()
        };
        update(&conn, "u", &target, &context).unwrap();
        assert_eq!(
            get(&conn, "u", &target).unwrap().metadata.context,
            Some(context)
        );
        assert!(get(&conn, "u", &source).unwrap().metadata.context.is_none());
        resume::delete(&conn, &source, "u").unwrap();
        let missing = get(&conn, "u", &target).unwrap();
        assert!(missing.metadata.source_missing && missing.metadata.base_missing);
        assert_eq!(missing.metadata.source_title.as_deref(), Some("基础"));
        assert_eq!(missing.source_snapshot, Some(initial));
        resume::delete(&conn, &target, "u").unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM resume_workspace", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn request_id_and_title_bounds_are_rejected_before_writes() {
        let (mut conn, source) = setup();
        for (id, title) in [
            ("invalid".into(), "岗位".into()),
            (uuid::Uuid::new_v4().to_string(), " \n ".into()),
            (uuid::Uuid::new_v4().to_string(), "中".repeat(201)),
        ] {
            let mut invalid = request(&source);
            invalid.request_id = id;
            invalid.title = title;
            assert!(derive(&mut conn, "u", &invalid).is_err());
            assert_eq!(list(&conn, "u").unwrap().len(), 1);
        }
        let mut valid = request(&source);
        valid.title = "中".repeat(200);
        let target = derive(&mut conn, "u", &valid).unwrap();
        assert_eq!(
            resume::find_by_id(&conn, &target, "u")
                .unwrap()
                .unwrap()
                .resume
                .title,
            valid.title
        );
    }

    #[test]
    fn invalid_context_never_creates_target_or_overwrites_saved_requirements() {
        let (mut conn, source) = setup();
        let valid = request(&source);
        let target = derive(&mut conn, "u", &valid).unwrap();
        let invalid_contexts = [
            Context {
                goal: "  \n ".into(),
                ..valid.context.clone()
            },
            Context {
                goal: "中".repeat(4001),
                ..valid.context.clone()
            },
            Context {
                company: "中".repeat(201),
                ..valid.context.clone()
            },
            Context {
                role: "中".repeat(201),
                ..valid.context.clone()
            },
            Context {
                job_description: "中".repeat(40001),
                ..valid.context.clone()
            },
        ];
        for context in invalid_contexts {
            let mut invalid = request(&source);
            invalid.context = context.clone();
            assert!(derive(&mut conn, "u", &invalid).is_err());
            assert!(update(&conn, "u", &target, &context).is_err());
            assert_eq!(
                get(&conn, "u", &target).unwrap().metadata.context,
                Some(valid.context.clone())
            );
            assert_eq!(list(&conn, "u").unwrap().len(), 2);
        }
        let boundary = Context {
            goal: "中".repeat(4000),
            company: "中".repeat(200),
            role: "中".repeat(200),
            job_description: "中".repeat(40000),
        };
        update(&conn, "u", &target, &boundary).unwrap();
        assert_eq!(
            get(&conn, "u", &target).unwrap().metadata.context,
            Some(boundary)
        );
    }

    #[test]
    fn every_entry_point_is_user_scoped() {
        let (mut conn, source) = setup();
        let req = request(&source);
        assert!(derive(&mut conn, "v", &req).is_err());
        let target = derive(&mut conn, "u", &req).unwrap();
        assert!(get(&conn, "v", &target).is_err());
        assert!(get(&conn, "v", &source).is_err());
        assert!(update(&conn, "v", &target, &Context::default()).is_err());
        assert!(list(&conn, "v").unwrap().is_empty());
        assert_eq!(
            get(&conn, "u", &target).unwrap().metadata.context,
            Some(req.context)
        );
    }
    #[test]
    fn frozen_docx_blobs_survive_source_deletion_and_target_document_changes() {
        let (mut conn, _) = setup();
        let fixture = include_bytes!("../../../../scripts/fixtures/original-document.docx");
        let source = document::import(&mut conn, "u", "source.docx", fixture, None).unwrap();
        let original = document::reference(&conn, &source).unwrap().unwrap();
        let target = derive(&mut conn, "u", &request(&source)).unwrap();
        assert_eq!(document::get(&conn, &target, "u").unwrap().bytes, fixture);
        // Simulate replacement with another already validated blob; frozen source still pins old bytes.
        conn.execute(
            "INSERT INTO document_blobs(hash,bytes) VALUES('replacement',X'01')",
            [],
        )
        .unwrap();
        conn.execute("UPDATE resume_documents SET original_hash='replacement',current_hash='replacement' WHERE resume_id=?1",[&target]).unwrap();
        resume::delete(&conn, &source, "u").unwrap();
        let frozen = get(&conn, "u", &target).unwrap().source_snapshot.unwrap();
        assert_eq!(
            frozen["originalDocument"]["currentHash"],
            original.current_hash
        );
        assert_eq!(
            conn.query_row(
                "SELECT bytes FROM document_blobs WHERE hash=?1",
                [&original.current_hash],
                |r| r.get::<_, Vec<u8>>(0)
            )
            .unwrap(),
            fixture
        );
        resume::delete(&conn, &target, "u").unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM document_blobs", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
