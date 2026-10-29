//! 只嵌入随 App 分发且允许编辑嵌入的开源字体；不读取或复制用户的商业系统字体。
use std::collections::BTreeSet;
use std::io::{Cursor, Read, Write};
use std::path::Path;

use quick_xml::{Reader, events::Event};
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::FileOptions};

const FONT_FAMILIES: &[(&str, &str, Option<&str>)] = &[
    (
        "Noto Sans SC",
        "NotoSansSC-Regular.ttf",
        Some("NotoSansSC-Bold.ttf"),
    ),
    (
        "Noto Serif CJK SC",
        "NotoSerifSC-Regular.ttf",
        Some("NotoSerifSC-Bold.ttf"),
    ),
    ("LXGW WenKai Lite", "LXGWWenKai-Regular.ttf", None),
];

fn used_fonts(xml: &str) -> Result<BTreeSet<String>, String> {
    let mut reader = Reader::from_str(xml);
    let mut names = BTreeSet::new();
    loop {
        match reader.read_event().map_err(|e| e.to_string())? {
            Event::Start(e) | Event::Empty(e) if e.local_name().as_ref() == b"rFonts" => {
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| e.to_string())?;
                    if matches!(
                        attr.key.local_name().as_ref(),
                        b"ascii" | b"hAnsi" | b"eastAsia" | b"cs"
                    ) {
                        names.insert(
                            attr.decode_and_unescape_value(reader.decoder())
                                .map_err(|e| e.to_string())?
                                .into_owned(),
                        );
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(names)
}

fn read_part(archive: &mut ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<String, String> {
    let mut text = String::new();
    archive
        .by_name(name)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    Ok(text)
}

// ECMA-376：GUID 去掉标点后按逆序作为 16 字节异或键，仅混淆前 32 字节。
fn obfuscate(bytes: &mut [u8], key: &Uuid) {
    for (i, byte) in bytes.iter_mut().take(32).enumerate() {
        *byte ^= key.as_bytes()[15 - i % 16];
    }
}

pub(super) fn embed_fonts(bytes: Vec<u8>, font_dir: Option<&Path>) -> Result<Vec<u8>, String> {
    let mut source = ZipArchive::new(Cursor::new(bytes.as_slice())).map_err(|e| e.to_string())?;
    let mut used = used_fonts(&read_part(&mut source, "word/document.xml")?)?;
    used.extend(used_fonts(&read_part(&mut source, "word/styles.xml")?)?);
    let families: Vec<_> = FONT_FAMILIES
        .iter()
        .filter(|(family, _, _)| used.contains(*family))
        .collect();
    if families.is_empty() {
        return Ok(bytes);
    }
    let path = font_dir
        .ok_or("找不到内置 Office 字体目录")?
        .join("office-fonts.zip");
    let file = std::fs::File::open(&path).map_err(|e| format!("无法读取内置 Office 字体：{e}"))?;
    let mut fonts = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut table = read_part(&mut source, "word/fontTable.xml")?;
    let mut types = read_part(&mut source, "[Content_Types].xml")?;
    let mut settings = read_part(&mut source, "word/settings.xml")?;
    let mut entries = Vec::new();
    let mut declarations = String::new();
    let mut rels = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
    );
    for (family, regular, bold) in families {
        declarations.push_str(&format!("<w:font w:name=\"{family}\">"));
        for (tag, filename) in [("embedRegular", Some(*regular)), ("embedBold", *bold)] {
            let Some(filename) = filename else { continue };
            let mut font = Vec::new();
            fonts
                .by_name(filename)
                .map_err(|e| e.to_string())?
                .read_to_end(&mut font)
                .map_err(|e| e.to_string())?;
            let key = Uuid::new_v4();
            obfuscate(&mut font, &key);
            let id = entries.len() + 1;
            declarations.push_str(&format!(
                "<w:{tag} r:id=\"rIdFont{id}\" w:fontKey=\"{{{}}}\" w:subsetted=\"false\"/>",
                key.to_string().to_uppercase()
            ));
            rels.push_str(&format!("<Relationship Id=\"rIdFont{id}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/font\" Target=\"fonts/font{id}.odttf\"/>"));
            entries.push((format!("word/fonts/font{id}.odttf"), font));
        }
        declarations.push_str("</w:font>");
    }
    table = table.replace("</w:fonts>", &(declarations + "</w:fonts>"));
    types = types.replace("</Types>", "<Default Extension=\"odttf\" ContentType=\"application/vnd.openxmlformats-officedocument.obfuscatedFont\"/></Types>");
    settings = settings.replace(
        "</w:settings>",
        "<w:embedTrueTypeFonts/><w:saveSubsetFonts w:val=\"false\"/></w:settings>",
    );
    rels.push_str("</Relationships>");
    let mut output = ZipWriter::new(Cursor::new(Vec::new()));
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for i in 0..source.len() {
        let mut entry = source.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_owned();
        output
            .start_file(&name, options)
            .map_err(|e| e.to_string())?;
        let replacement = match name.as_str() {
            "word/fontTable.xml" => Some(&table),
            "word/settings.xml" => Some(&settings),
            "[Content_Types].xml" => Some(&types),
            _ => None,
        };
        if let Some(text) = replacement {
            output
                .write_all(text.as_bytes())
                .map_err(|e| e.to_string())?;
        } else {
            std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
        }
    }
    entries.push(("word/_rels/fontTable.xml.rels".into(), rels.into_bytes()));
    for (name, data) in entries {
        output
            .start_file(name, options)
            .map_err(|e| e.to_string())?;
        output.write_all(&data).map_err(|e| e.to_string())?;
    }
    output
        .finish()
        .map(|c| c.into_inner())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obfuscation_uses_reversed_guid_and_preserves_font_body() {
        let key = Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();
        let mut bytes = vec![0; 40];
        obfuscate(&mut bytes, &key);
        assert_eq!(&bytes[..4], &[0xff, 0xee, 0xdd, 0xcc]);
        assert_eq!(&bytes[16..20], &[0xff, 0xee, 0xdd, 0xcc]);
        assert_eq!(&bytes[32..], &[0; 8]);
        obfuscate(&mut bytes, &key);
        assert_eq!(bytes, vec![0; 40]);
    }

    #[test]
    fn embedded_fonts_recover_complete_same_source_files() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
        let doc =
            docx_rs::Docx::new().default_fonts(docx_rs::RunFonts::new().east_asia("Noto Sans SC"));
        let mut raw = Cursor::new(Vec::new());
        doc.build().pack(&mut raw).unwrap();
        let result = embed_fonts(raw.into_inner(), Some(&dir)).unwrap();
        let mut archive = ZipArchive::new(Cursor::new(result.as_slice())).unwrap();
        let table = read_part(&mut archive, "word/fontTable.xml").unwrap();
        assert!(table.contains("w:embedRegular"));
        assert!(table.contains("w:embedBold"));
        assert!(!table.contains("LXGW"));
        let mut original =
            ZipArchive::new(std::fs::File::open(dir.join("office-fonts.zip")).unwrap()).unwrap();
        let pattern = regex::Regex::new(r#"w:fontKey="\{([^}]+)\}""#).unwrap();
        for (i, (matched, name)) in pattern
            .captures_iter(&table)
            .zip(["NotoSansSC-Regular.ttf", "NotoSansSC-Bold.ttf"])
            .enumerate()
        {
            let key = Uuid::parse_str(&matched[1]).unwrap();
            let mut actual = Vec::new();
            archive
                .by_name(&format!("word/fonts/font{}.odttf", i + 1))
                .unwrap()
                .read_to_end(&mut actual)
                .unwrap();
            obfuscate(&mut actual, &key);
            let mut expected = Vec::new();
            original
                .by_name(name)
                .unwrap()
                .read_to_end(&mut expected)
                .unwrap();
            assert_eq!(actual, expected);
        }
    }
}
