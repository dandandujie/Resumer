use chrono::{DateTime, Datelike, Local, Timelike};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub enabled: bool,
    pub time: String,
    /// ISO weekday: Monday=1, Sunday=7.
    pub weekdays: Vec<u32>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            time: "18:00".into(),
            weekdays: vec![1, 2, 3, 4, 5],
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.time.len() != 5
            || chrono::NaiveTime::parse_from_str(&self.time, "%H:%M").is_err()
            || self.weekdays.is_empty()
            || self.weekdays.len() > 7
            || self.weekdays.iter().any(|d| !(1..=7).contains(d))
        {
            return Err("请选择有效时间和至少一个提醒日".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Receipt {
    pub last_day: Option<String>,
    pub snooze_until: Option<i64>,
    pub last_error: Option<String>,
}

pub fn load(c: &Connection) -> Result<(Config, Receipt), String> {
    let (config, state): (String, String) = c
        .query_row(
            "SELECT config,state FROM work_note_reminder WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok((
        serde_json::from_str(&config).map_err(|e| format!("提醒设置读取失败：{e}"))?,
        serde_json::from_str(&state).map_err(|e| format!("提醒状态读取失败：{e}"))?,
    ))
}
pub fn save_receipt(c: &Connection, receipt: &Receipt) -> Result<(), String> {
    c.execute(
        "UPDATE work_note_reminder SET state=?1 WHERE id=1",
        [serde_json::to_string(receipt).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn configure(c: &Connection, config: &Config) -> Result<(), String> {
    config.validate()?;
    let (before, mut receipt) = load(c)?;
    if before != *config {
        receipt.snooze_until = None;
    }
    receipt.last_error = None;
    c.execute(
        "UPDATE work_note_reminder SET config=?1,state=?2 WHERE id=1",
        params![
            serde_json::to_string(config).map_err(|e| e.to_string())?,
            serde_json::to_string(&receipt).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// No backlog after long sleep; a 15-minute grace tolerates short wakeups / busy foreground.
/// The persisted local date prevents duplicate delivery after restart, clock rollback and DST folds.
pub fn due(config: &Config, receipt: &Receipt, now: DateTime<Local>) -> bool {
    if !config.enabled {
        return false;
    }
    if let Some(at) = receipt.snooze_until {
        return (0..900).contains(&(now.timestamp() - at));
    }
    if receipt.last_day.as_deref() == Some(&now.format("%Y-%m-%d").to_string())
        || !config
            .weekdays
            .contains(&now.weekday().number_from_monday())
    {
        return false;
    }
    let Ok(time) = chrono::NaiveTime::parse_from_str(&config.time, "%H:%M") else {
        return false;
    };
    let elapsed =
        i64::from(now.num_seconds_from_midnight()) - i64::from(time.num_seconds_from_midnight());
    (0..900).contains(&elapsed)
}
pub fn claim(c: &Connection, now: DateTime<Local>) -> Result<bool, String> {
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let (config, mut receipt) = load(&tx)?;
    if !due(&config, &receipt, now) {
        // Expired snoozes must not block all future scheduled reminders.
        if receipt
            .snooze_until
            .is_some_and(|at| now.timestamp() >= at + 900)
        {
            receipt.snooze_until = None;
            save_receipt(&tx, &receipt)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(false);
    }
    receipt.last_day = Some(now.format("%Y-%m-%d").to_string());
    receipt.snooze_until = None;
    receipt.last_error = None;
    save_receipt(&tx, &receipt)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, TimeZone};
    fn time(day: u32, hour: u32, minute: u32) -> DateTime<Local> {
        Local
            .from_local_datetime(
                &NaiveDate::from_ymd_opt(2026, 11, day)
                    .unwrap()
                    .and_hms_opt(hour, minute, 0)
                    .unwrap(),
            )
            .earliest()
            .unwrap()
    }
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&c).unwrap();
        c
    }
    #[test]
    fn schedule_respects_opt_in_weekdays_and_wake_grace() {
        let mut config = Config::default();
        let receipt = Receipt::default();
        assert!(!due(&config, &receipt, time(2, 18, 0)));
        config.enabled = true;
        assert!(!due(&config, &receipt, time(2, 17, 59)));
        assert!(due(&config, &receipt, time(2, 18, 0)));
        assert!(due(&config, &receipt, time(2, 18, 14)));
        assert!(!due(&config, &receipt, time(2, 18, 15)));
        assert!(!due(&config, &receipt, time(7, 18, 0)));
    }
    #[test]
    fn durable_claim_prevents_restart_and_clock_rollback_duplicates() {
        let c = db();
        let config = Config {
            enabled: true,
            ..Config::default()
        };
        configure(&c, &config).unwrap();
        assert!(claim(&c, time(2, 18, 1)).unwrap());
        assert!(!claim(&c, time(2, 18, 0)).unwrap());
        // Re-reading persisted settings is what a restarted scheduler does.
        assert!(!due(
            &load(&c).unwrap().0,
            &load(&c).unwrap().1,
            time(2, 18, 2)
        ));
        assert!(claim(&c, time(3, 18, 0)).unwrap());
    }
    #[test]
    fn snooze_survives_restart_expires_and_disable_cancels_it() {
        let c = db();
        let mut config = Config {
            enabled: true,
            ..Config::default()
        };
        configure(&c, &config).unwrap();
        claim(&c, time(2, 18, 0)).unwrap();
        let mut receipt = load(&c).unwrap().1;
        receipt.snooze_until = Some(time(2, 18, 15).timestamp());
        save_receipt(&c, &receipt).unwrap();
        assert!(!claim(&c, time(2, 18, 14)).unwrap());
        assert!(claim(&c, time(2, 18, 15)).unwrap());
        receipt.snooze_until = Some(time(2, 18, 30).timestamp());
        save_receipt(&c, &receipt).unwrap();
        assert!(!claim(&c, time(2, 19, 0)).unwrap());
        assert!(load(&c).unwrap().1.snooze_until.is_none());
        assert!(claim(&c, time(3, 18, 0)).unwrap());
        receipt.snooze_until = Some(time(3, 18, 15).timestamp());
        save_receipt(&c, &receipt).unwrap();
        config.enabled = false;
        configure(&c, &config).unwrap();
        assert!(load(&c).unwrap().1.snooze_until.is_none());
        assert!(!claim(&c, time(3, 18, 15)).unwrap());
    }
    #[test]
    fn invalid_config_does_not_replace_existing_preferences() {
        let c = db();
        let before = load(&c).unwrap().0;
        let invalid = Config {
            enabled: true,
            time: "25:00".into(),
            weekdays: vec![],
        };
        assert!(configure(&c, &invalid).is_err());
        assert_eq!(load(&c).unwrap().0, before);
        let invalid = Config {
            weekdays: vec![0, 8],
            ..before.clone()
        };
        assert!(configure(&c, &invalid).is_err());
    }

    #[test]
    fn failed_claim_does_not_consume_the_reminder() {
        let c = db();
        configure(
            &c,
            &Config {
                enabled: true,
                ..Config::default()
            },
        )
        .unwrap();
        c.execute_batch("CREATE TRIGGER fail_reminder BEFORE UPDATE ON work_note_reminder BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        assert!(claim(&c, time(2, 18, 0)).is_err());
        assert!(load(&c).unwrap().1.last_day.is_none());
        c.execute_batch("DROP TRIGGER fail_reminder;").unwrap();
        assert!(claim(&c, time(2, 18, 1)).unwrap());
        assert!(!claim(&c, time(2, 18, 1)).unwrap());
    }
}
