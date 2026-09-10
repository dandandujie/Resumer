//! 简历文本字段的内联标记解析（与 `src/lib/resume-text.ts` 同规格，见 docs/plans/.../标记语法.md）。
//! `**粗体**` `*斜体*` `__下划线__` `` `代码` ``，以及选区级属性
//! `{{color=#c00}}…{{/color}}` `{{size=12}}…{{/size}}`（pt）`{{font=songti}}…{{/font}}`（中文字体 id）。

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Span {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub code: bool,
    pub color: Option<String>,
    pub size_pt: Option<f64>,
    pub font: Option<String>,
}

const MIN_SIZE_PT: f64 = 6.0;
const MAX_SIZE_PT: f64 = 40.0;

#[derive(Default, Clone)]
struct State {
    bold: bool,
    italic: bool,
    underline: bool,
    code: bool,
    colors: Vec<String>,
    sizes: Vec<f64>,
    fonts: Vec<String>,
}

impl State {
    fn span(&self, text: String) -> Span {
        Span {
            text,
            bold: self.bold,
            italic: self.italic,
            underline: self.underline,
            code: self.code,
            color: self.colors.last().cloned(),
            size_pt: self.sizes.last().copied(),
            font: self.fonts.last().cloned(),
        }
    }
}

fn valid_color(value: &str) -> Option<String> {
    let hex = value.strip_prefix('#')?;
    let ok = matches!(hex.len(), 3 | 6) && hex.chars().all(|c| c.is_ascii_hexdigit());
    ok.then(|| format!("#{}", hex.to_ascii_lowercase()))
}

/// `{{key=value}}` / `{{/key}}` 识别；返回 (是否关闭, key, value, 消耗的字节数)。
fn parse_attr_token(rest: &str) -> Option<(bool, &str, &str, usize)> {
    let inner = rest.strip_prefix("{{")?;
    let end = inner.find("}}")?;
    let body = &inner[..end];
    let consumed = 2 + end + 2;
    if let Some(key) = body.strip_prefix('/') {
        return matches!(key, "color" | "size" | "font").then_some((true, key, "", consumed));
    }
    let (key, value) = body.split_once('=')?;
    matches!(key, "color" | "size" | "font").then_some((false, key, value, consumed))
}

pub fn parse(input: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut text = String::new();
    let mut state = State::default();
    let mut index = 0;

    let flush = |spans: &mut Vec<Span>, text: &mut String, state: &State| {
        if !text.is_empty() {
            spans.push(state.span(std::mem::take(text)));
        }
    };

    while index < input.len() {
        let rest = &input[index..];

        if rest.starts_with("{{")
            && let Some((closing, key, value, consumed)) = parse_attr_token(rest)
        {
            if closing {
                // 先把标记内的文本按当前属性输出，再出栈；没有对应开标记的关闭标记按文本保留
                let stack_len = match key {
                    "color" => state.colors.len(),
                    "size" => state.sizes.len(),
                    _ => state.fonts.len(),
                };
                if stack_len == 0 {
                    text.push_str(&rest[..consumed]);
                } else {
                    flush(&mut spans, &mut text, &state);
                    match key {
                        "color" => {
                            state.colors.pop();
                        }
                        "size" => {
                            state.sizes.pop();
                        }
                        _ => {
                            state.fonts.pop();
                        }
                    }
                }
                index += consumed;
                continue;
            }
            // 开标记：值合法且后面有对应关闭标记才生效，否则整个标记当普通文本
            let has_close = rest[consumed..].contains(&format!("{{{{/{key}}}}}"));
            let parsed_size = value
                .parse::<f64>()
                .ok()
                .filter(|pt| (MIN_SIZE_PT..=MAX_SIZE_PT).contains(pt));
            let applies = has_close
                && match key {
                    "color" => valid_color(value).is_some(),
                    "size" => parsed_size.is_some(),
                    _ => !value.trim().is_empty(),
                };
            if !applies {
                text.push_str(&rest[..consumed]);
                index += consumed;
                continue;
            }
            flush(&mut spans, &mut text, &state);
            match key {
                "color" => state.colors.push(valid_color(value).unwrap_or_default()),
                "size" => state.sizes.push(parsed_size.unwrap_or(0.0)),
                _ => state.fonts.push(value.trim().to_string()),
            }
            index += consumed;
            continue;
        }

        let ch = rest.chars().next().unwrap_or('\0');
        let marker: Option<&str> = match ch {
            '`' => Some("`"),
            '*' if rest.starts_with("**") => Some("**"),
            '*' => Some("*"),
            '_' if rest.starts_with("__") => Some("__"),
            _ => None,
        };
        let Some(marker) = marker else {
            let len = ch.len_utf8();
            text.push_str(&rest[..len]);
            index += len;
            continue;
        };
        let active = match marker {
            "**" => state.bold,
            "*" => state.italic,
            "__" => state.underline,
            _ => state.code,
        };
        if !active && !rest[marker.len()..].contains(marker) {
            text.push_str(marker);
            index += marker.len();
            continue;
        }
        flush(&mut spans, &mut text, &state);
        match marker {
            "**" => state.bold = !state.bold,
            "*" => state.italic = !state.italic,
            "__" => state.underline = !state.underline,
            _ => state.code = !state.code,
        }
        index += marker.len();
    }
    flush(&mut spans, &mut text, &state);
    spans
}

/// 纯文本：去掉全部标记。
pub fn strip(input: &str) -> String {
    parse(input).into_iter().map(|span| span.text).collect()
}

/// 只去掉属性标记，保留 `**`/`*`/`__`/`` ` ``（Markdown 导出用：颜色字号不是 Markdown 能表达的）。
pub fn strip_attr_markers(input: &str) -> String {
    let mut out = String::new();
    let mut index = 0;
    while index < input.len() {
        let rest = &input[index..];
        if rest.starts_with("{{")
            && let Some((_, _, _, consumed)) = parse_attr_token(rest)
        {
            index += consumed;
            continue;
        }
        let ch = rest.chars().next().unwrap_or('\0');
        out.push(ch);
        index += ch.len_utf8();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(text: &str) -> Span {
        Span {
            text: text.into(),
            ..Span::default()
        }
    }

    #[test]
    fn parses_supported_markers() {
        let spans = parse("**粗体** *斜体* __下划线__ `代码`");
        assert_eq!(spans.len(), 7);
        assert!(spans[0].bold && spans[0].text == "粗体");
        assert!(spans[2].italic && spans[2].text == "斜体");
        assert!(spans[4].underline && spans[4].text == "下划线");
        assert!(spans[6].code && spans[6].text == "代码");
        assert_eq!(strip("**保留文本**"), "保留文本");
        assert_eq!(strip("未闭合 **标记"), "未闭合 **标记");
    }

    #[test]
    fn parses_attribute_spans_with_nesting() {
        let spans = parse("{{color=#C00}}{{size=14}}**重点**{{/size}}{{/color}}尾");
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].text, "重点");
        assert!(spans[0].bold);
        assert_eq!(spans[0].color.as_deref(), Some("#c00"));
        assert_eq!(spans[0].size_pt, Some(14.0));
        assert_eq!(spans[1], plain("尾"));
        let font = parse("{{font=songti}}宋{{/font}}");
        assert_eq!(font[0].font.as_deref(), Some("songti"));
        assert_eq!(strip("{{color=#c00}}红{{/color}} **粗**"), "红 粗");
    }

    #[test]
    fn invalid_or_unclosed_attribute_markers_stay_as_text() {
        assert_eq!(
            strip("{{color=red}}x{{/color}}"),
            "{{color=red}}x{{/color}}"
        );
        assert_eq!(strip("{{size=99}}x{{/size}}"), "{{size=99}}x{{/size}}");
        assert_eq!(strip("{{color=#c00}}未闭合"), "{{color=#c00}}未闭合");
        assert_eq!(strip("孤立{{/size}}"), "孤立{{/size}}");
    }

    #[test]
    fn strip_attr_markers_keeps_markdown_markers() {
        assert_eq!(
            strip_attr_markers("{{size=12}}**a**{{/size}} *b*"),
            "**a** *b*"
        );
    }
}
