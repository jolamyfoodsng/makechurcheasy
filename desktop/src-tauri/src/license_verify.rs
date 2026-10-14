//! Native licence verification.
//!
//! The server signs the device licence with an Ed25519 key (see
//! `api/src/lib/signedLicense.ts`). The public half of that key is compiled into
//! this binary, and the check runs here instead of in the web view, because
//! compiled code is much harder to patch than the JavaScript bundle.
//!
//! What this module enforces:
//!   * the signature is valid for the exact signed string,
//!   * the licence was issued for THIS device (a copied licence file fails),
//!   * the licence carries a server timestamp (`signedAt`), which gives the app
//!     a clock floor that cannot be forged by rewinding the system clock,
//!   * a small tamper-evident "latest time seen" file survives a localStorage wipe.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use std::fs;
use std::path::PathBuf;

/// DER prefix of an Ed25519 SubjectPublicKeyInfo (the format the API exports).
const SPKI_PREFIX: [u8; 12] = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
const LICENSE_FORMAT_VERSION: i64 = 1;

/// Set at build time (CI already exports it for the Vite build).
const EMBEDDED_PUBLIC_KEY: Option<&str> = option_env!("VITE_SUBSCRIPTION_PUBLIC_KEY");

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct LicenseVerdict {
    pub valid: bool,
    /// "ok", "dev_unverified", or the reason it was rejected.
    pub reason: String,
    /// The parsed licence, only present when `valid`.
    pub license: Option<serde_json::Value>,
    /// Server time the licence was signed at (ms since epoch).
    pub signed_at_ms: Option<i64>,
}

fn reject(reason: &str) -> LicenseVerdict {
    LicenseVerdict { valid: false, reason: reason.to_string(), license: None, signed_at_ms: None }
}

fn parse_public_key(b64: &str) -> Result<VerifyingKey, &'static str> {
    let der = STANDARD.decode(b64.trim()).map_err(|_| "bad_public_key")?;
    if der.len() != SPKI_PREFIX.len() + 32 || der[..SPKI_PREFIX.len()] != SPKI_PREFIX {
        return Err("bad_public_key");
    }
    let mut raw = [0u8; 32];
    raw.copy_from_slice(&der[SPKI_PREFIX.len()..]);
    VerifyingKey::from_bytes(&raw).map_err(|_| "bad_public_key")
}

/// Pure verification, so it can be unit-tested with any key.
/// `public_key_b64 == None` means this build has no key: debug builds accept
/// the licence (so local development works), release builds reject it.
pub fn verify_license_with(
    public_key_b64: Option<&str>,
    signed: &str,
    signature_b64: &str,
    expected_device_id: &str,
    allow_unverified: bool,
) -> LicenseVerdict {
    let parsed: serde_json::Value = match serde_json::from_str(signed) {
        Ok(v) => v,
        Err(_) => return reject("malformed"),
    };

    let key = match public_key_b64.filter(|k| !k.trim().is_empty()) {
        Some(k) => match parse_public_key(k) {
            Ok(key) => key,
            Err(r) => return reject(r),
        },
        None => {
            if allow_unverified {
                return LicenseVerdict { valid: true, reason: "dev_unverified".into(), signed_at_ms: signed_at(&parsed), license: Some(parsed) };
            }
            return reject("no_public_key");
        }
    };

    let sig_bytes = match STANDARD.decode(signature_b64.trim()) {
        Ok(b) => b,
        Err(_) => return reject("bad_signature"),
    };
    let sig = match Signature::from_slice(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return reject("bad_signature"),
    };
    if key.verify(signed.as_bytes(), &sig).is_err() {
        return reject("bad_signature");
    }

    if parsed.get("v").and_then(|v| v.as_i64()) != Some(LICENSE_FORMAT_VERSION) {
        return reject("unsupported_version");
    }
    if parsed.get("deviceId").and_then(|v| v.as_str()) != Some(expected_device_id) || expected_device_id.is_empty() {
        return reject("wrong_device");
    }
    let signed_at_ms = match signed_at(&parsed) {
        Some(ms) => ms,
        None => return reject("missing_timestamp"),
    };

    LicenseVerdict { valid: true, reason: "ok".into(), signed_at_ms: Some(signed_at_ms), license: Some(parsed) }
}

fn signed_at(v: &serde_json::Value) -> Option<i64> {
    let s = v.get("signedAt")?.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis())
}

// ── Tamper-evident "latest time seen" ────────────────────────────────────────

type HmacSha256 = Hmac<Sha256>;

fn clock_path() -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("MakeChurchEasy");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("license_clock.dat"))
}

fn clock_mac(ms: i64) -> String {
    let host = hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or_default();
    let mut mac = HmacSha256::new_from_slice(format!("mce-clock-v1|{host}").as_bytes()).expect("hmac key");
    mac.update(ms.to_string().as_bytes());
    mac.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn read_clock_at(path: &PathBuf) -> i64 {
    let Ok(raw) = fs::read_to_string(path) else { return 0 };
    let mut parts = raw.trim().splitn(2, ':');
    let (Some(ms), Some(mac)) = (parts.next(), parts.next()) else { return 0 };
    match ms.parse::<i64>() {
        Ok(v) if v > 0 && clock_mac(v) == mac => v,
        _ => 0, // edited or corrupt: ignore it
    }
}

pub fn note_clock_at(path: &PathBuf, ms: i64) -> i64 {
    let current = read_clock_at(path);
    if ms <= current {
        return current;
    }
    let _ = fs::write(path, format!("{ms}:{}", clock_mac(ms)));
    ms
}

// ── Tauri commands ───────────────────────────────────────────────────────────


#[tauri::command]
pub fn verify_license(signed: String, signature: String, expected_device_id: String) -> LicenseVerdict {
    verify_license_with(
        EMBEDDED_PUBLIC_KEY,
        &signed,
        &signature,
        &expected_device_id,
        cfg!(debug_assertions),
    )
}

/// Records the latest server-confirmed time and returns the greatest time seen.

#[tauri::command]
pub fn license_clock_note(server_ms: i64) -> i64 {
    clock_path().map(|p| note_clock_at(&p, server_ms)).unwrap_or(server_ms)
}

/// The greatest server-confirmed time seen on this computer (0 if none).

#[tauri::command]
pub fn license_clock_read() -> i64 {
    clock_path().map(|p| read_clock_at(&p)).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn keypair() -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let mut der = SPKI_PREFIX.to_vec();
        der.extend_from_slice(sk.verifying_key().as_bytes());
        (sk, STANDARD.encode(der))
    }

    fn signed_json(device: &str) -> String {
        format!(r#"{{"plan":"growth","v":1,"deviceId":"{device}","userId":"u1","signedAt":"2026-10-13T10:00:00.000Z"}}"#)
    }

    fn sign(sk: &SigningKey, s: &str) -> String {
        STANDARD.encode(sk.sign(s.as_bytes()).to_bytes())
    }

    #[test]
    fn accepts_a_valid_licence_for_this_device() {
        let (sk, pk) = keypair();
        let s = signed_json("dev-1");
        let v = verify_license_with(Some(&pk), &s, &sign(&sk, &s), "dev-1", false);
        assert!(v.valid, "{:?}", v);
        assert_eq!(v.signed_at_ms, Some(1_791_885_600_000));
        assert_eq!(v.license.unwrap()["plan"], "growth");
    }

    #[test]
    fn rejects_an_edited_plan() {
        let (sk, pk) = keypair();
        let s = signed_json("dev-1");
        let sig = sign(&sk, &s);
        let forged = s.replace("growth", "basic");
        assert_eq!(verify_license_with(Some(&pk), &forged, &sig, "dev-1", false).reason, "bad_signature");
    }

    #[test]
    fn rejects_a_licence_copied_to_another_device() {
        let (sk, pk) = keypair();
        let s = signed_json("dev-1");
        assert_eq!(verify_license_with(Some(&pk), &s, &sign(&sk, &s), "dev-2", false).reason, "wrong_device");
    }

    #[test]
    fn rejects_a_signature_from_a_different_key() {
        let (_, pk) = keypair();
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let s = signed_json("dev-1");
        assert!(!verify_license_with(Some(&pk), &s, &sign(&other, &s), "dev-1", false).valid);
    }

    #[test]
    fn rejects_garbage_input() {
        let (_, pk) = keypair();
        assert_eq!(verify_license_with(Some(&pk), "not json", "x", "d", false).reason, "malformed");
        assert_eq!(verify_license_with(Some(&pk), "{}", "!!!", "d", false).reason, "bad_signature");
        assert_eq!(verify_license_with(Some("AAAA"), "{}", "x", "d", false).reason, "bad_public_key");
    }

    #[test]
    fn missing_key_is_allowed_only_for_dev_builds() {
        let s = signed_json("dev-1");
        assert!(verify_license_with(None, &s, "", "dev-1", true).valid);
        assert_eq!(verify_license_with(None, &s, "", "dev-1", false).reason, "no_public_key");
    }

    #[test]
    fn clock_survives_and_ignores_edits() {
        let dir = std::env::temp_dir().join(format!("mce-clock-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("c.dat");
        assert_eq!(read_clock_at(&p), 0);
        assert_eq!(note_clock_at(&p, 5_000), 5_000);
        assert_eq!(note_clock_at(&p, 3_000), 5_000, "never goes backwards");
        assert_eq!(read_clock_at(&p), 5_000);
        let raw = fs::read_to_string(&p).unwrap().replace("5000", "9999999");
        fs::write(&p, raw).unwrap();
        assert_eq!(read_clock_at(&p), 0, "an edited file is ignored");
        let _ = fs::remove_dir_all(&dir);
    }
}
