pub mod ai;
pub mod chat;
pub mod export;
pub mod interview;
pub mod journal;
pub mod knowledge;
pub mod resume;
pub mod user;

use serde::Serialize;
use serde_json::Value;

use crate::ai::provider::AIConfig;

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

/// 前端传来的 AI 配置：解析失败要报出来，而不是默认成空 Key 让用户去猜 401 的原因。
pub(crate) fn cfg_from(config: Value) -> Result<AIConfig, CommandError> {
    serde_json::from_value(config).map_err(|error| CommandError {
        message: format!("AI 配置无效: {error}"),
    })
}
