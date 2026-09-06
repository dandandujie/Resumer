pub mod resume;
pub mod user;
pub mod ai;
pub mod chat;
pub mod export;
pub mod interview;
pub mod journal;
pub mod knowledge;

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
}

impl From<rusqlite::Error> for CommandError {
    fn from(e: rusqlite::Error) -> Self {
        CommandError {
            message: e.to_string(),
        }
    }
}

impl From<String> for CommandError {
    fn from(s: String) -> Self {
        CommandError { message: s }
    }
}
