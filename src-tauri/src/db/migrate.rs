use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/001_initial.sql"),
    include_str!("../../migrations/002_resume_versions.sql"),
    include_str!("../../migrations/003_agent_memory.sql"),
    include_str!("../../migrations/004_session_archive.sql"),
    include_str!("../../migrations/005_applications.sql"),
    include_str!("../../migrations/006_knowledge.sql"),
    include_str!("../../migrations/007_knowledge_raw_sha256.sql"),
    include_str!("../../migrations/008_resume_versions_labels.sql"),
];

pub fn run(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > current {
            conn.execute_batch(sql)?;
            conn.execute("INSERT INTO _migrations (version) VALUES (?1)", [version])?;
            log::info!("Applied migration {}", version);
        }
    }

    Ok(())
}
