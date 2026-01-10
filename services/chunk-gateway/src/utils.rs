use axum::http::{HeaderMap, header};
use chrono::{DateTime, Utc};

pub fn extract_content_checksum(headers: &HeaderMap) -> Option<(String, String)> {
    let checksum_header = headers.get("content-checksum")?.to_str().ok()?;
    
    let parts: Vec<&str> = checksum_header.split('=').collect();
    if parts.len() != 2 {
        return None;
    }
    
    Some((parts[0].to_lowercase(), parts[1].to_string()))
}

pub fn parse_range_header(range_header: &str, total_size: u64) -> Result<(u64, u64), String> {
    if !range_header.starts_with("bytes=") {
        return Err("Invalid range header format".to_string());
    }

    let range_part = &range_header[6..]; // Remove "bytes="
    
    if range_part.starts_with('-') {
        // Suffix range: bytes=-500 (last 500 bytes)
        let suffix = range_part[1..].parse::<u64>()
            .map_err(|_| "Invalid suffix range".to_string())?;
        
        if suffix > total_size {
            return Err("Suffix range exceeds file size".to_string());
        }
        
        let start = total_size - suffix;
        Ok((start, total_size))
    } else {
        // Regular range: bytes=0-499 or bytes=500-
        let parts: Vec<&str> = range_part.split('-').collect();
        if parts.len() != 2 {
            return Err("Invalid range header format".to_string());
        }

        let start = if parts[0].is_empty() {
            0
        } else {
            parts[0].parse::<u64>()
                .map_err(|_| "Invalid start range".to_string())?
        };

        let end = if parts[1].is_empty() {
            total_size
        } else {
            parts[1].parse::<u64>()
                .map_err(|_| "Invalid end range".to_string())?
        };

        if start > total_size || end > total_size || start > end {
            return Err("Invalid range values".to_string());
        }

        Ok((start, end))
    }
}

pub fn format_http_date(dt: &DateTime<Utc>) -> String {
    dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

pub fn validate_content_length(headers: &HeaderMap, max_size: Option<usize>) -> Result<Option<usize>, String> {
    if let Some(content_length) = headers.get(header::CONTENT_LENGTH) {
        let length = content_length.to_str()
            .map_err(|_| "Invalid Content-Length header".to_string())?
            .parse::<usize>()
            .map_err(|_| "Invalid Content-Length value".to_string())?;

        if let Some(max) = max_size {
            if length > max {
                return Err(format!("Content too large. Maximum size: {} bytes", max));
            }
        }

        Ok(Some(length))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_content_checksum() {
        let mut headers = HeaderMap::new();
        headers.insert("content-checksum", "sha256=abc123".parse().unwrap());
        
        let (algorithm, checksum) = extract_content_checksum(&headers).unwrap();
        assert_eq!(algorithm, "sha256");
        assert_eq!(checksum, "abc123");
    }

    #[test]
    fn test_parse_range_header() {
        // Regular range
        let (start, end) = parse_range_header("bytes=0-499", 1000).unwrap();
        assert_eq!(start, 0);
        assert_eq!(end, 499);

        // Suffix range
        let (start, end) = parse_range_header("bytes=-500", 1000).unwrap();
        assert_eq!(start, 500);
        assert_eq!(end, 1000);

        // Open-ended range
        let (start, end) = parse_range_header("bytes=500-", 1000).unwrap();
        assert_eq!(start, 500);
        assert_eq!(end, 1000);
    }

    #[test]
    fn test_format_http_date() {
        let dt = Utc::now();
        let formatted = format_http_date(&dt);
        assert!(formatted.contains("GMT"));
    }
}
