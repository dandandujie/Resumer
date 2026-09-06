#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Span {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub code: bool,
}

impl Span {
    fn new(text: String, bold: bool, italic: bool, underline: bool, code: bool) -> Self {
        Self {
            text,
            bold,
            italic,
            underline,
            code,
        }
    }
}

pub fn parse(input: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut text = String::new();
    let mut bold = false;
    let mut italic = false;
    let mut underline = false;
    let mut code = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        let marker = match ch {
            '`' => Some("`"),
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                Some("**")
            }
            '*' => Some("*"),
            '_' if chars.peek() == Some(&'_') => {
                chars.next();
                Some("__")
            }
            _ => None,
        };

        let Some(marker) = marker else {
            text.push(ch);
            continue;
        };

        let active = match marker {
            "**" => bold,
            "*" => italic,
            "__" => underline,
            "`" => code,
            _ => false,
        };
        if !active && !input_has_closing_marker(&chars, marker) {
            text.push_str(marker);
            continue;
        }
        if !text.is_empty() {
            spans.push(Span::new(text, bold, italic, underline, code));
            text = String::new();
        }
        match marker {
            "**" => bold = !bold,
            "*" => italic = !italic,
            "__" => underline = !underline,
            "`" => code = !code,
            _ => {}
        }
    }
    if !text.is_empty() {
        spans.push(Span::new(text, bold, italic, underline, code));
    }
    spans
}

fn input_has_closing_marker(
    chars: &std::iter::Peekable<std::str::Chars<'_>>,
    marker: &str,
) -> bool {
    let rest: String = chars.clone().collect();
    rest.contains(marker)
}

pub fn strip(input: &str) -> String {
    parse(input).into_iter().map(|span| span.text).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_markers() {
        assert_eq!(
            parse("**粗体** *斜体* __下划线__ `代码`"),
            vec![
                Span::new("粗体".into(), true, false, false, false),
                Span::new(" ".into(), false, false, false, false),
                Span::new("斜体".into(), false, true, false, false),
                Span::new(" ".into(), false, false, false, false),
                Span::new("下划线".into(), false, false, true, false),
                Span::new(" ".into(), false, false, false, false),
                Span::new("代码".into(), false, false, false, true),
            ]
        );
        assert_eq!(strip("**保留文本**"), "保留文本");
        assert_eq!(strip("未闭合 **标记"), "未闭合 **标记");
    }
}
