//! 模型负责判断，程序负责核对引用；没有证据不能显示为已匹配。
use serde_json::{Value, json};

pub fn text_values(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(items) => items.iter().map(text_values).collect::<Vec<_>>().join("\n"),
        Value::Object(items) => items
            .values()
            .map(text_values)
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

pub fn ground_jd(mut result: Value, resume: &Value, jd: &str) -> Value {
    if !result.is_object() {
        result = json!({});
    }
    let resume = text_values(resume);
    let mut verified = false;
    let mut uncertain = false;
    let checks = result["checks"].as_array().cloned().unwrap_or_default();
    result["checks"] = Value::Array(
        checks
            .into_iter()
            .take(30)
            .filter(Value::is_object)
            .map(|mut check| {
                for key in [
                    "requirement",
                    "status",
                    "jobQuote",
                    "resumeQuote",
                    "note",
                    "nextAction",
                ] {
                    check[key] = json!(
                        check[key]
                            .as_str()
                            .unwrap_or("")
                            .chars()
                            .take(6000)
                            .collect::<String>()
                    );
                }
                let job = check["jobQuote"].as_str().unwrap_or("").trim().to_string();
                let source = check["resumeQuote"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let status = check["status"].as_str().unwrap_or("unknown").to_string();
                let job_valid = !job.is_empty() && jd.contains(&job);
                let source_valid = !source.is_empty() && resume.contains(&source);
                let valid = job_valid
                    && match status.as_str() {
                        "supported" | "conflict" => source_valid,
                        "missing" | "unknown" => source.is_empty() || source_valid,
                        _ => false,
                    };
                if !job_valid {
                    check["jobQuote"] = json!("");
                }
                if !source_valid {
                    check["resumeQuote"] = json!("");
                }
                if !valid {
                    check["status"] = json!("unknown");
                    check["note"] = json!("原文依据不足，请核对；未将此项计为已匹配");
                }
                check["verified"] = json!(valid && status != "unknown");
                verified |= valid && status == "supported";
                uncertain |= !valid || status != "supported";
                check
            })
            .collect(),
    );
    result["verdict"] = json!(if verified && !uncertain {
        "match"
    } else {
        "review"
    });
    for key in ["overallScore", "atsScore"] {
        result[key] = json!(result[key].as_i64().unwrap_or(0).clamp(0, 100));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fabricated_quotes_and_legacy_results_require_review() {
        let input = json!({"overallScore":999,"checks":[{"status":"supported","jobQuote":"Redis","resumeQuote":"精通 Redis"}]});
        let grounded = ground_jd(
            input,
            &json!({"description":"使用 Redis 缓存"}),
            "要求 Redis",
        );
        assert_eq!(grounded["checks"][0]["status"], "unknown");
        assert_eq!(grounded["checks"][0]["resumeQuote"], "");
        assert_eq!(grounded["verdict"], "review");
        assert_eq!(grounded["overallScore"], 100);
        assert_eq!(ground_jd(json!({}), &json!([]), "JD")["verdict"], "review");
    }
    #[test]
    fn requires_both_sources_and_keeps_missing_distinct_from_conflict() {
        let result = ground_jd(
            json!({"checks":[{"status":"supported","jobQuote":"缓存","resumeQuote":"开发缓存"},{"status":"missing","jobQuote":"英语","resumeQuote":""}]}),
            &json!([{"description":"开发缓存"}]),
            "缓存与英语",
        );
        assert_eq!(result["checks"][0]["verified"], true);
        assert_eq!(result["checks"][1]["status"], "missing");
        assert_eq!(result["verdict"], "review");
    }
}
