#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateStyle { Dot, Dash, Cn }

pub fn normalize_month(input: &str) -> String {
    let value = input.trim();
    let (year, month): (&str, &str) = if value.len() == 6 && value.chars().all(|c| c.is_ascii_digit()) {
        (&value[..4], &value[4..])
    } else if let Some(pos) = value.find('年') {
        (&value[..pos], value[pos + '年'.len_utf8()..].trim_end_matches('月'))
    } else if let Some((year, month)) = value.split_once('.') {
        (year, month)
    } else if let Some((year, month)) = value.split_once('-') {
        (year, month)
    } else if let Some((year, month)) = value.split_once('/') {
        (year, month)
    } else { return String::new(); };
    if year.len() != 4 || !year.chars().all(|c| c.is_ascii_digit()) { return String::new(); }
    let Ok(month) = month.parse::<u32>() else { return String::new(); };
    if !(1..=12).contains(&month) { return String::new(); }
    format!("{}-{:02}", year, month)
}

pub fn format_month(input: &str, style: DateStyle, lang: &str) -> String {
    let value = normalize_month(input);
    if value.is_empty() { return value; }
    let year = &value[..4];
    let month = &value[5..];
    match style {
        DateStyle::Cn if lang == "zh" => format!("{}年{}月", year, month.trim_start_matches('0')),
        DateStyle::Dash => format!("{}-{}", year, month),
        _ => format!("{}.{}", year, month),
    }
}

pub fn format_range(start: &str, end: &str, current: bool, style: DateStyle, lang: &str) -> String {
    let from = format_month(start, style, lang);
    let present = if lang == "zh" { "至今" } else { "Present" };
    let to = if current || end.trim().is_empty() { present.to_string() } else { format_month(end, style, lang) };
    if from.is_empty() { return if to == present { String::new() } else { to }; }
    format!("{} - {}", from, to)
}

pub fn normalize_value_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if matches!(key.as_str(), "startDate" | "endDate" | "date") {
                    if let Some(raw) = child.as_str() {
                        let normalized = normalize_month(raw);
                        *child = serde_json::Value::String(normalized);
                    }
                } else { normalize_value_fields(child); }
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(normalize_value_fields),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn normalizes_supported_inputs() {
        for (input, expected) in [("2022.7", "2022-07"), ("2022-07", "2022-07"), ("2022/07", "2022-07"), ("2022年7月", "2022-07"), ("202207", "2022-07")] { assert_eq!(normalize_month(input), expected); }
        assert_eq!(normalize_month("2022.13"), "");
        assert_eq!(format_range("2022.07", "2024.06", false, DateStyle::Dot, "zh"), "2022.07 - 2024.06");
    }
}
