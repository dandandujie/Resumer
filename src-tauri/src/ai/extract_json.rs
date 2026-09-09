use serde_json::Value;
use std::collections::HashMap;

fn strip_think_blocks(text: &str) -> String {
    let mut s = text.to_string();
    // Remove complete <think>...</think> pairs
    let re1 = regex::Regex::new(r"(?is)<think>.*?</think>").unwrap();
    s = re1.replace_all(&s, "").into_owned();
    // Remove dangling unclosed <think>... at start
    let re2 = regex::Regex::new(r"(?is)^.*?</think>").unwrap();
    s = re2.replace(&s, "").into_owned();
    // <|thinking|>...<|/thinking|>
    let re3 = regex::Regex::new(r"(?is)<\|?thinking\|?>.*?<\|?/?thinking\|?>").unwrap();
    s = re3.replace_all(&s, "").into_owned();
    s.trim().to_string()
}

fn strip_fences(text: &str) -> String {
    let re = regex::Regex::new(r"(?s)```(?:json)?\s*\n?(.*?)\n?\s*```").unwrap();
    if let Some(cap) = re.captures(text) {
        cap.get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_else(|| text.to_string())
    } else {
        text.to_string()
    }
}

fn repair_unescaped_quotes(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len() + 16);
    let mut in_string = false;
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if in_string && ch == '\\' {
            out.push(ch);
            if i + 1 < chars.len() {
                out.push(chars[i + 1]);
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }

        if ch == '"' {
            if !in_string {
                in_string = true;
                out.push(ch);
            } else {
                // Look ahead
                let mut j = i + 1;
                while j < chars.len()
                    && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\n' || chars[j] == '\r')
                {
                    j += 1;
                }
                let next = if j < chars.len() { chars[j] } else { '\0' };
                if next == '\0' || next == ',' || next == '}' || next == ']' || next == ':' {
                    in_string = false;
                    out.push(ch);
                } else {
                    out.push('\\');
                    out.push('"');
                }
            }
        } else {
            out.push(ch);
        }
        i += 1;
    }

    out
}

fn key_aliases() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("comprehensiveScore", "overallScore");
    m.insert("totalScore", "overallScore");
    m.insert("finalScore", "overallScore");
    m.insert("direction", "description");
    m
}

fn normalize_keys(value: Value) -> Value {
    let aliases = key_aliases();
    match value {
        Value::Array(arr) => Value::Array(arr.into_iter().map(normalize_keys).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                let nk = aliases.get(k.as_str()).map(|s| s.to_string()).unwrap_or(k);
                out.insert(nk, normalize_keys(v));
            }
            Value::Object(out)
        }
        other => other,
    }
}

/// Best-effort JSON repair — attempts to balance braces/brackets and escape unclosed strings.
fn simple_repair(text: &str) -> String {
    let mut s = text.to_string();
    // Quick hack: pad with closing braces/brackets if unbalanced
    let open_braces = s.matches('{').count();
    let close_braces = s.matches('}').count();
    if open_braces > close_braces {
        s.push_str(&"}".repeat(open_braces - close_braces));
    }
    let open_brackets = s.matches('[').count();
    let close_brackets = s.matches(']').count();
    if open_brackets > close_brackets {
        s.push_str(&"]".repeat(open_brackets - close_brackets));
    }
    s
}

/// Extract JSON from AI text output.
pub fn extract_json(text: &str) -> Result<Value, String> {
    let trimmed = text.trim();
    let no_think = strip_think_blocks(trimmed);
    let cleaned = strip_fences(&no_think);

    // Try direct
    if let Ok(v) = serde_json::from_str::<Value>(&cleaned) {
        return Ok(normalize_keys(v));
    }

    // Repair quotes
    let repaired = repair_unescaped_quotes(&cleaned);
    if let Ok(v) = serde_json::from_str::<Value>(&repaired) {
        return Ok(normalize_keys(v));
    }

    // Simple brace/bracket balance repair
    let simple = simple_repair(&repaired);
    if let Ok(v) = serde_json::from_str::<Value>(&simple) {
        return Ok(normalize_keys(v));
    }

    // Brute-force first { to last }
    if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}'))
        && end > start
    {
        let slice = &cleaned[start..=end];
        let repaired_slice = repair_unescaped_quotes(slice);
        if let Ok(v) = serde_json::from_str::<Value>(&repaired_slice) {
            return Ok(normalize_keys(v));
        }
        let s2 = simple_repair(&repaired_slice);
        if let Ok(v) = serde_json::from_str::<Value>(&s2) {
            return Ok(normalize_keys(v));
        }
    }

    // Try array unwrap
    if let (Some(start), Some(end)) = (cleaned.find('['), cleaned.rfind(']'))
        && end > start
    {
        let slice = &cleaned[start..=end];
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(slice)
            && arr.len() == 1
        {
            return Ok(normalize_keys(arr.into_iter().next().unwrap()));
        }
    }

    Err(format!(
        "Failed to extract JSON from AI response (length={})",
        text.len()
    ))
}
