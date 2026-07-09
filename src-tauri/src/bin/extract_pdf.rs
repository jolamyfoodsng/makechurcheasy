use std::env;
use std::fs;
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PdfTextElement {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    font_size: f64,
    is_bold: bool,
    page: u32,
}

fn fix_winansi_twi(text: String) -> String {
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut result = String::with_capacity(text.len());
    for i in 0..len {
        let ch = chars[i];
        if ch == '4' || ch == '1' {
            let prev_lower = i > 0 && chars[i - 1].is_ascii_lowercase();
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            if prev_lower || next_lower {
                result.push(if ch == '4' { 'ɔ' } else { 'ɛ' });
                continue;
            }
        } else if ch == '$' {
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            let prev_not_letter = i == 0 || !chars[i - 1].is_ascii_alphabetic();
            if next_lower && prev_not_letter {
                result.push('ɛ');
                continue;
            }
        } else if ch == '!' {
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            let prev_not_letter = i == 0 || !chars[i - 1].is_ascii_alphabetic();
            if next_lower && prev_not_letter {
                result.push('\u{0186}');
                continue;
            }
        }
        result.push(ch);
    }
    result
}

fn decode_pdf_string(obj: &lopdf::Object) -> Option<String> {
    if let lopdf::Object::String(bytes, _format) = obj {
        if let Ok(s) = String::from_utf8(bytes.clone()) {
            return Some(s);
        }
        Some(bytes.iter().map(|&b| b as char).collect())
    } else {
        None
    }
}

fn build_page_font_map(
    doc: &lopdf::Document,
    page_id: lopdf::ObjectId,
) -> std::collections::HashMap<String, bool> {
    let mut font_map = std::collections::HashMap::new();
    let Ok(page) = doc.get_object(page_id) else { return font_map };
    let Ok(page_dict) = page.as_dict() else { return font_map };
    let Ok(resources) = page_dict.get(b"Resources") else { return font_map };
    let Ok(resources_dict) = resources.as_dict() else { return font_map };
    let Ok(fonts) = resources_dict.get(b"Font") else { return font_map };
    let Ok(font_dict) = fonts.as_dict() else { return font_map };
    for (name, font_ref) in font_dict.iter() {
        let name_str = String::from_utf8_lossy(name).to_string();
        let font_obj_result = match font_ref {
            lopdf::Object::Reference(id) => doc.get_object(*id),
            other => Ok(other),
        };
        if let Ok(font_obj) = font_obj_result {
            if let Ok(font) = font_obj.as_dict() {
                let is_bold = font
                    .get(b"BaseFont")
                    .and_then(|bf| bf.as_name())
                    .map(|n| {
                        let lower = String::from_utf8_lossy(n).to_lowercase();
                        lower.contains("bold")
                    })
                    .unwrap_or(false);
                font_map.insert(name_str, is_bold);
            }
        }
    }
    font_map
}

fn parse_content_stream(raw: &[u8]) -> Vec<lopdf::content::Operation> {
    let mut ops = Vec::new();
    let mut operands: Vec<lopdf::Object> = Vec::new();
    let bytes = raw;
    let len = bytes.len();
    let mut i = 0;
    while i < len {
        let b = bytes[i];
        match b {
            b' ' | b'\t' | b'\r' | b'\n' | b'\x0C' => { i += 1; }
            b'%' => {
                while i < len && bytes[i] != b'\n' { i += 1; }
            }
            b'0'..=b'9' | b'-' | b'+' | b'.' => {
                let start = i;
                i += 1;
                while i < len && matches!(bytes[i], b'0'..=b'9' | b'.' | b'-' | b'+') { i += 1; }
                let s = std::str::from_utf8(&bytes[start..i]).unwrap_or("0");
                if s.contains('.') {
                    if let Ok(v) = s.parse::<f64>() {
                        operands.push(lopdf::Object::Real(v as f32));
                    }
                } else if let Ok(v) = s.parse::<i64>() {
                    operands.push(lopdf::Object::Integer(v));
                }
            }
            b'/' => {
                i += 1;
                let start = i;
                while i < len {
                    match bytes[i] {
                        b' ' | b'\t' | b'\r' | b'\n' | b'/' | b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' => break,
                        _ => { i += 1; }
                    }
                }
                let name = bytes[start..i].to_vec();
                operands.push(lopdf::Object::Name(name));
            }
            b'(' => {
                i += 1;
                let mut s = Vec::new();
                let mut depth = 0i32;
                while i < len {
                    match bytes[i] {
                        b'(' => { depth += 1; s.push(b'('); i += 1; }
                        b')' => {
                            if depth > 0 { depth -= 1; s.push(b')'); i += 1; }
                            else { i += 1; break; }
                        }
                        b'\\' => {
                            i += 1;
                            if i < len {
                                match bytes[i] {
                                    b'n' => s.push(b'\n'),
                                    b'r' => s.push(b'\r'),
                                    b't' => s.push(b'\t'),
                                    b'\\' => s.push(b'\\'),
                                    b'(' => s.push(b'('),
                                    b')' => s.push(b')'),
                                    other => s.push(other),
                                }
                                i += 1;
                            }
                        }
                        other => { s.push(other); i += 1; }
                    }
                }
                let s_out = fix_winansi_twi(String::from_utf8_lossy(&s).to_string());
                let bytes_out = s_out.into_bytes();
                operands.push(lopdf::Object::String(bytes_out, lopdf::StringFormat::Literal));
            }
            b'<' => {
                i += 1;
                let mut hex = Vec::new();
                while i < len && bytes[i] != b'>' {
                    if !bytes[i].is_ascii_whitespace() {
                        hex.push(bytes[i]);
                    }
                    i += 1;
                }
                if i < len { i += 1; } // skip '>'
                // Convert hex pairs to bytes
                let mut bytes_out = Vec::new();
                let mut j = 0;
                while j + 1 < hex.len() {
                    let hi = hex[j];
                    let lo = hex[j + 1];
                    let nibble = |c: u8| -> u8 {
                        match c {
                            b'0'..=b'9' => c - b'0',
                            b'a'..=b'f' => c - b'a' + 10,
                            b'A'..=b'F' => c - b'A' + 10,
                            _ => 0,
                        }
                    };
                    bytes_out.push(nibble(hi) * 16 + nibble(lo));
                    j += 2;
                }
                let s_out = fix_winansi_twi(String::from_utf8_lossy(&bytes_out).to_string());
                let bytes_final = s_out.into_bytes();
                operands.push(lopdf::Object::String(bytes_final, lopdf::StringFormat::Hexadecimal));
            }
            b'[' => {
                i += 1;
                let mut arr: Vec<lopdf::Object> = Vec::new();
                while i < len && bytes[i] != b']' {
                    match bytes[i] {
                        b' ' | b'\t' | b'\r' | b'\n' => { i += 1; }
                        b'(' => {
                            i += 1;
                            let mut s = Vec::new();
                            while i < len && bytes[i] != b')' {
                                if bytes[i] == b'\\' {
                                    i += 1;
                                    if i < len {
                                        match bytes[i] {
                                            b'n' => s.push(b'\n'),
                                            b'r' => s.push(b'\r'),
                                            b't' => s.push(b'\t'),
                                            b'\\' => s.push(b'\\'),
                                            b'(' => s.push(b'('),
                                            b')' => s.push(b')'),
                                            other => s.push(other),
                                        }
                                        i += 1;
                                    }
                                } else {
                                    s.push(bytes[i]);
                                    i += 1;
                                }
                            }
                            if i < len { i += 1; }
                            let s_out = fix_winansi_twi(String::from_utf8_lossy(&s).to_string());
                            arr.push(lopdf::Object::String(s_out.into_bytes(), lopdf::StringFormat::Literal));
                        }
                        b'0'..=b'9' | b'-' | b'+' | b'.' => {
                            let start = i;
                            i += 1;
                            while i < len && matches!(bytes[i], b'0'..=b'9' | b'.' | b'-' | b'+') { i += 1; }
                            let s = std::str::from_utf8(&bytes[start..i]).unwrap_or("0");
                            if s.contains('.') {
                                if let Ok(v) = s.parse::<f64>() {
                                    arr.push(lopdf::Object::Real(v as f32));
                                }
                            } else if let Ok(v) = s.parse::<i64>() {
                                arr.push(lopdf::Object::Integer(v));
                            }
                        }
                        _ => { i += 1; }
                    }
                }
                if i < len { i += 1; }
                operands.push(lopdf::Object::Array(arr));
            }
            b't' if i + 3 < len && &bytes[i..i+4] == b"true" => {
                operands.push(lopdf::Object::Boolean(true));
                i += 4;
            }
            b'f' if i + 4 < len && &bytes[i..i+5] == b"false" => {
                operands.push(lopdf::Object::Boolean(false));
                i += 5;
            }
            b'A'..=b'Z' | b'a'..=b'z' => {
                let start = i;
                while i < len && matches!(bytes[i], b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*') { i += 1; }
                let op = std::str::from_utf8(&bytes[start..i]).unwrap_or("");
                ops.push(lopdf::content::Operation {
                    operator: op.to_string(),
                    operands: operands.drain(..).collect(),
                });
            }
            _ => { i += 1; }
        }
    }
    ops
}

fn extract_page_text_elements(
    operations: &[lopdf::content::Operation],
    font_map: &std::collections::HashMap<String, bool>,
    page_num: u32,
    page_height: f64,
) -> Vec<PdfTextElement> {
    let mut elements = Vec::new();
    let mut tm = [1.0f64, 0.0, 0.0, 1.0, 0.0, 0.0];
    let mut font_size = 12.0f64;
    let mut is_bold = false;
    let mut buf = String::new();
    let mut line_x = 0.0f64;
    let mut line_y = 0.0f64;

    let flush = |buf: &mut String, elements: &mut Vec<PdfTextElement>,
                 line_x: f64, line_y: f64, font_size: f64, is_bold: bool, page_num: u32, page_height: f64| {
        if !buf.is_empty() {
            let text = fix_winansi_twi(buf.clone());
            let char_count = text.chars().count() as f64;
            elements.push(PdfTextElement {
                text,
                x: line_x,
                y: page_height - line_y,
                width: char_count * font_size * 0.6,
                height: font_size * 1.2,
                font_size,
                is_bold,
                page: page_num,
            });
            buf.clear();
        }
    };

    for op in operations {
        match op.operator.as_str() {
            "BT" => {
                flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
                line_x = 0.0;
                line_y = 0.0;
            }
            "ET" => {
                flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
            }
            "Tf" => {
                if let Some(lopdf::Object::Name(name)) = op.operands.first() {
                    let name_str = String::from_utf8_lossy(name).to_string();
                    if let Some(&bold) = font_map.get(&name_str) {
                        is_bold = bold;
                    }
                }
                if let Some(size_obj) = op.operands.get(1) {
                    font_size = match size_obj {
                        lopdf::Object::Integer(i) => *i as f64,
                        lopdf::Object::Real(r) => *r as f64,
                        _ => font_size,
                    };
                }
            }
            "Tm" => {
                if op.operands.len() >= 6 {
                    for i in 0..6 {
                        if let Some(obj) = op.operands.get(i) {
                            tm[i] = match obj {
                                lopdf::Object::Integer(v) => *v as f64,
                                lopdf::Object::Real(v) => *v as f64,
                                _ => tm[i],
                            };
                        }
                    }
                    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                    line_x = tm[4];
                    line_y = tm[5];
                }
            }
            "Td" | "TD" => {
                if op.operands.len() >= 2 {
                    let tx = match &op.operands[0] {
                        lopdf::Object::Integer(v) => *v as f64,
                        lopdf::Object::Real(v) => *v as f64,
                        _ => 0.0,
                    };
                    let ty = match &op.operands[1] {
                        lopdf::Object::Integer(v) => *v as f64,
                        lopdf::Object::Real(v) => *v as f64,
                        _ => 0.0,
                    };
                    line_x += tx * tm[0] + ty * tm[2];
                    line_y += tx * tm[1] + ty * tm[3];
                    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                }
            }
            "Tj" => {
                if let Some(text_obj) = op.operands.first() {
                    if let Some(text) = decode_pdf_string(text_obj) {
                        if buf.is_empty() {
                            line_x = tm[4];
                            line_y = tm[5];
                        }
                        buf.push_str(&text);
                    }
                }
            }
            "TJ" => {
                if let Some(lopdf::Object::Array(items)) = op.operands.first() {
                    for item in items {
                        match item {
                            lopdf::Object::String(..) => {
                                if let Some(text) = decode_pdf_string(item) {
                                    if buf.is_empty() {
                                        line_x = tm[4];
                                        line_y = tm[5];
                                    }
                                    buf.push_str(&text);
                                }
                            }
                            lopdf::Object::Integer(offset) => {
                                if *offset < -100 && !buf.is_empty() {
                                    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                                }
                            }
                            lopdf::Object::Real(offset) => {
                                if (*offset as f64) < -100.0 && !buf.is_empty() {
                                    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            "T*" => {
                if !buf.is_empty() {
                    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
                }
                line_y -= font_size;
            }
            _ => {}
        }
    }
    flush(&mut buf, &mut elements, line_x, line_y, font_size, is_bold, page_num, page_height);
    elements
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <pdf-file>", args[0]);
        std::process::exit(1);
    }
    let path = &args[1];
    let file_data = fs::read(path).expect("Failed to read PDF file");
    let doc = lopdf::Document::load_mem(&file_data)
        .expect("Failed to parse PDF with lopdf");
    let pages = doc.get_pages();
    let mut all_elements = Vec::new();

    for (&page_num, &page_id) in pages.iter() {
        let page_height = {
            let mut h = 792.0;
            if let Ok(page) = doc.get_object(page_id) {
                if let Ok(dict) = page.as_dict() {
                    if let Ok(mb) = dict.get(b"MediaBox") {
                        if let Ok(arr) = mb.as_array() {
                            if arr.len() >= 4 {
                                h = match &arr[3] {
                                    lopdf::Object::Integer(v) => *v as f64,
                                    lopdf::Object::Real(v) => *v as f64,
                                    _ => h,
                                };
                            }
                        }
                    }
                }
            }
            h
        };
        let font_map = build_page_font_map(&doc, page_id);
        let raw_content = match doc.get_page_content(page_id) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let operations = parse_content_stream(&raw_content);
        let elements = extract_page_text_elements(&operations, &font_map, page_num, page_height);
        all_elements.extend(elements);
    }

    // Output as JSON
    let json = serde_json::to_string(&all_elements).expect("Failed to serialize elements");
    println!("{}", json);
    eprintln!("Extracted {} text elements from {} pages", all_elements.len(), pages.len());
}
