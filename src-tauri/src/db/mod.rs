pub mod repo;
pub(crate) mod migrate;

use std::path::Path;
use std::sync::Mutex;
use rusqlite::Connection;

pub struct AppDb {
    pub conn: Mutex<Connection>,
}

impl AppDb {
    pub fn new(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        migrate::run(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
