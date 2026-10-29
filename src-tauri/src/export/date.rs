//! 日期内核（Rust 侧）：与 `src/lib/resume-date.ts` 同规格、同用例。
//! 不变量：存储优先 YYYY-MM；无法归一化的值原样保留、原样显示，绝不清空。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateStyle {
    Dot,
    Dash,
    Cn,
}

impl DateStyle {
    /// 主题里 `dateStyle` 字段的唯一解析入口；未知值按默认 `dot` 处理。
    pub fn parse(value: Option<&str>) -> Self {
        match value {
            Some("dash") => DateStyle::Dash,
            Some("cn") => DateStyle::Cn,
            _ => DateStyle::Dot,
        }
    }
}

const MONTH_NAMES: [(&str, u32); 13] = [
    ("jan", 1),
    ("feb", 2),
    ("mar", 3),
    ("apr", 4),
    ("may", 5),
    ("jun", 6),
    ("jul", 7),
    ("aug", 8),
    ("sept", 9),
    ("sep", 9),
    ("oct", 10),
    ("nov", 11),
    ("dec", 12),
];

fn present_label(lang: &str) -> &'static str {
    if lang == "en" { "Present" } else { "至今" }
}

fn is_year(value: &str) -> bool {
    value.len() == 4 && value.chars().all(|c| c.is_ascii_digit())
}

fn year_month(year: &str, month: u32) -> String {
    if is_year(year) && (1..=12).contains(&month) {
        format!("{}-{:02}", year, month)
    } else {
        String::new()
    }
}

fn parse_month_number(value: &str) -> Option<u32> {
    let digits = value.trim();
    if digits.is_empty() || digits.len() > 2 || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

/// 把各种月份写法归一化为 `YYYY-MM`；识别不了返回空串（调用方决定是否保留原值）。
pub fn normalize_month(input: &str) -> String {
    let plain = super::inline::strip(input);
    let value = plain.trim();
    if value.is_empty() {
        return String::new();
    }
    // YYYYMM
    if value.len() == 6 && value.chars().all(|c| c.is_ascii_digit()) {
        return parse_month_number(&value[4..])
            .map(|month| year_month(&value[..4], month))
            .unwrap_or_default();
    }
    // YYYY<sep>M[<sep>D]，sep ∈ . - / 年；允许尾随日与中文单位
    if value.len() >= 6 && value.is_char_boundary(4) && is_year(&value[..4]) {
        let rest = &value[4..];
        let mut chars = rest.chars();
        let sep = chars.next().unwrap_or(' ');
        if matches!(sep, '.' | '-' | '/' | '年') {
            let after = chars.as_str().trim_start();
            let month_len = after.chars().take_while(|c| c.is_ascii_digit()).count();
            let month_digits = &after[..month_len];
            let tail = after[month_len..]
                .trim_start_matches('月')
                .trim_start_matches(['.', '-', '/', ' '])
                .trim_end_matches('日')
                .trim();
            let tail_is_day =
                tail.is_empty() || (tail.len() <= 2 && tail.chars().all(|c| c.is_ascii_digit()));
            if tail_is_day {
                return parse_month_number(month_digits)
                    .map(|month| year_month(&value[..4], month))
                    .unwrap_or_default();
            }
        }
        return String::new();
    }
    // MM/YYYY 或 MM.YYYY
    if let Some((month, year)) = value.split_once(['/', '.'])
        && is_year(year)
    {
        return parse_month_number(month)
            .map(|month| year_month(year, month))
            .unwrap_or_default();
    }
    // Jul 2022 / July 2022 / Sept. 2022 / Jul, 2022
    if let Some((name, year)) = value.rsplit_once(' ') {
        let name = name.trim_end_matches([',', '.']).to_ascii_lowercase();
        let year = year.trim();
        if is_year(year) && name.chars().all(|c| c.is_ascii_alphabetic()) {
            let month = MONTH_NAMES
                .iter()
                .find(|(prefix, _)| name.starts_with(prefix))
                .map(|(_, month)| *month);
            return month
                .map(|month| year_month(year, month))
                .unwrap_or_default();
        }
    }
    String::new()
}

/// 显示用：能归一化的按 style 输出，否则原样返回（例如 `2023`、`至今`）。
pub fn format_month(input: &str, style: DateStyle, lang: &str) -> String {
    let raw = input.trim();
    let plain = super::inline::strip(raw);
    if plain != raw {
        return restyle_date(raw, &format_month(&plain, style, lang));
    }
    let value = normalize_month(raw);
    if value.is_empty() {
        return raw.to_string();
    }
    let year = &value[..4];
    let month = &value[5..];
    match style {
        DateStyle::Cn if lang == "zh" => {
            format!("{}年{}月", year, month.trim_start_matches('0'))
        }
        DateStyle::Dash => format!("{}-{}", year, month),
        _ => format!("{}.{}", year, month),
    }
}

pub fn format_range(start: &str, end: &str, current: bool, style: DateStyle, lang: &str) -> String {
    let present = present_label(lang);
    let from = format_month(start, style, lang);
    let to = if current || end.trim().is_empty() {
        present.to_string()
    } else {
        format_month(end, style, lang)
    };
    if from.is_empty() {
        return if to == present { String::new() } else { to };
    }
    format!("{} - {}", from, to)
}

/// 递归归一化 startDate / endDate / date 字段；归一化失败保留原值（去首尾空白）。
pub fn normalize_value_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if matches!(key.as_str(), "startDate" | "endDate" | "date") {
                    if let Some(raw) = child.as_str() {
                        let normalized = if super::inline::strip(raw) != raw {
                            raw.to_string()
                        } else {
                            normalize_month(raw)
                        };
                        let kept = if normalized.is_empty() {
                            raw.trim().to_string()
                        } else {
                            normalized
                        };
                        *child = serde_json::Value::String(kept);
                    }
                } else {
                    normalize_value_fields(child);
                }
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(normalize_value_fields),
        _ => {}
    }
}

/// 按年份/月分量映射字符样式，与前端 restyleDate 一致。
fn restyle_date(source: &str, rendered: &str) -> String {
    let chars: Vec<_> = super::inline::parse(source)
        .into_iter()
        .flat_map(|span| {
            span.text
                .chars()
                .map(|ch| {
                    let mut next = span.clone();
                    next.text = ch.to_string();
                    next
                })
                .collect::<Vec<_>>()
        })
        .collect();
    let plain: String = chars.iter().map(|s| s.text.as_str()).collect();
    if plain == rendered {
        return source.to_string();
    }
    let year = |text: &str| {
        text.as_bytes()
            .windows(4)
            .position(|w| w.iter().all(u8::is_ascii_digit))
    };
    let (Some(sy), Some(ty)) = (year(&plain), year(rendered)) else {
        let mut span = chars.first().cloned().unwrap_or_default();
        span.text = rendered.to_string();
        return super::inline::serialize(&[span]);
    };
    // 这里的索引使用字符单位；中文月份分隔符不能按 UTF-8 字节偏移套样式。
    let sy = plain[..sy].chars().count();
    let ty = rendered[..ty].chars().count();
    let source_chars: Vec<_> = plain.chars().collect();
    let target_chars: Vec<_> = rendered.chars().collect();
    let month = |cs: &[char], y: usize| {
        cs.iter()
            .enumerate()
            .skip(y + 4)
            .find(|(_, c)| c.is_ascii_alphanumeric())
            .or_else(|| {
                cs.iter()
                    .enumerate()
                    .find(|(_, c)| c.is_ascii_alphanumeric())
            })
            .map(|(i, _)| i)
            .unwrap_or(0)
    };
    let sm = month(&source_chars, sy);
    let tm = month(&target_chars, ty);
    let digits = source_chars
        .iter()
        .skip(sm)
        .take_while(|c| c.is_ascii_digit())
        .count()
        .max(1);
    let spans: Vec<_> = target_chars
        .into_iter()
        .enumerate()
        .map(|(i, ch)| {
            let at = if i >= tm && !(ty..ty + 4).contains(&i) {
                sm + (i - tm).min(digits - 1)
            } else {
                sy + i.saturating_sub(ty).min(3)
            };
            let mut span = chars
                .get(at.min(chars.len().saturating_sub(1)))
                .cloned()
                .unwrap_or_default();
            span.text = ch.to_string();
            span
        })
        .collect();
    super::inline::serialize(&spans)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rich_dates_keep_semantics_and_local_styles() {
        let input = "**2026**-{{color=#c00}}09{{/color}}";
        assert_eq!(normalize_month(input), "2026-09");
        for (style, expected) in [
            (DateStyle::Dot, "2026.09"),
            (DateStyle::Dash, "2026-09"),
            (DateStyle::Cn, "2026年9月"),
        ] {
            let value = format_month(input, style, "zh");
            assert_eq!(super::super::inline::strip(&value), expected);
            let runs = super::super::inline::parse(&value);
            assert!(runs[0].bold);
            assert_eq!(runs.last().unwrap().color.as_deref(), Some("#c00"));
        }
        let mut value = serde_json::json!({"date":input});
        normalize_value_fields(&mut value);
        assert_eq!(value["date"], input);
        assert_eq!(
            super::super::inline::strip(&format_month("**July** 2026", DateStyle::Cn, "zh")),
            "2026年7月"
        );
    }

    use serde_json::json;

    // 与 scripts/test-resume-date.ts 的 NORMALIZE_CASES 逐条相同。
    const NORMALIZE_CASES: [(&str, &str); 16] = [
        ("2022.7", "2022-07"),
        ("2022-07", "2022-07"),
        ("2022/07", "2022-07"),
        ("2022年7月", "2022-07"),
        ("202207", "2022-07"),
        ("2022-07-15", "2022-07"),
        ("2022.07.15", "2022-07"),
        ("2022年7月15日", "2022-07"),
        ("Jul 2022", "2022-07"),
        ("July 2022", "2022-07"),
        ("Sept. 2022", "2022-09"),
        ("07/2022", "2022-07"),
        ("2022.13", ""),
        ("2023", ""),
        ("至今", ""),
        ("", ""),
    ];

    #[test]
    fn normalizes_supported_inputs() {
        for (input, expected) in NORMALIZE_CASES {
            assert_eq!(normalize_month(input), expected, "normalize_month({input})");
        }
    }

    #[test]
    fn formats_and_keeps_unparseable_values() {
        assert_eq!(format_month("2022-07", DateStyle::Dot, "zh"), "2022.07");
        assert_eq!(format_month("2022-07", DateStyle::Dash, "zh"), "2022-07");
        assert_eq!(format_month("2022-07", DateStyle::Cn, "zh"), "2022年7月");
        assert_eq!(format_month("2022-07", DateStyle::Cn, "en"), "2022.07");
        assert_eq!(format_month("2023", DateStyle::Dot, "zh"), "2023");
        assert_eq!(
            format_month(" Summer 2022 ", DateStyle::Dot, "zh"),
            "Summer 2022"
        );
        assert_eq!(
            format_range("2022.07", "2024.06", false, DateStyle::Dot, "zh"),
            "2022.07 - 2024.06"
        );
        assert_eq!(
            format_range("2022-07", "", true, DateStyle::Dot, "zh"),
            "2022.07 - 至今"
        );
        assert_eq!(
            format_range("2022-07", "", false, DateStyle::Dot, "en"),
            "2022.07 - Present"
        );
        assert_eq!(format_range("", "", false, DateStyle::Dot, "zh"), "");
        assert_eq!(
            format_range("2023", "", true, DateStyle::Dot, "zh"),
            "2023 - 至今"
        );
        assert_eq!(
            format_range("2022-07", "2024-06", false, DateStyle::Cn, "zh"),
            "2022年7月 - 2024年6月"
        );
    }

    #[test]
    fn normalize_value_fields_keeps_unparseable_dates() {
        let mut value =
            json!({"items":[{"startDate":"2022.7","endDate":null,"date":"2023","title":"x"}]});
        normalize_value_fields(&mut value);
        assert_eq!(
            value,
            json!({"items":[{"startDate":"2022-07","endDate":null,"date":"2023","title":"x"}]})
        );
    }

    #[test]
    fn parses_date_style() {
        assert_eq!(DateStyle::parse(Some("dash")), DateStyle::Dash);
        assert_eq!(DateStyle::parse(Some("cn")), DateStyle::Cn);
        assert_eq!(DateStyle::parse(Some("dot")), DateStyle::Dot);
        assert_eq!(DateStyle::parse(None), DateStyle::Dot);
    }
}
