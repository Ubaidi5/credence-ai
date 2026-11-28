//! The Python that runs Colibri's launcher (`coli` is a Python 3.10+ script that only
//! needs the standard library).
//!
//! A Python on PATH is used when there is one. On Windows, where a fresh PC usually has
//! none, Credence downloads python.org's official "embeddable package" (a small zip with
//! python.exe and the standard library, no installer, no admin rights, nothing added to
//! PATH) into `<app data>/python/<version>/`, checked against a pinned SHA-256.
//!
//! The embeddable Python reads its search path from `python313._pth` only (it ignores
//! PYTHONPATH and the script's folder), so the Colibri folder and its `tools/` folder are
//! written there before each run.

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use tokio::io::AsyncWriteExt;

/// python.org's Windows embeddable package (64-bit). Update the three together.
pub const EMBED_VERSION: &str = "3.13.17";
const EMBED_URL: &str = "https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip";
const EMBED_SHA256: &str = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38";
const PTH_FILE: &str = "python313._pth";
const STDLIB_ZIP: &str = "python313.zip";

/// The Python Credence will run `coli` with.
#[derive(Clone, Debug, PartialEq)]
pub enum Python {
    /// A Python on PATH, as the command words that start it (e.g. `py -3`).
    System { argv: Vec<String>, version: String },
    /// The embeddable Python Credence downloaded.
    Bundled { exe: PathBuf, version: String },
}

impl Python {
    pub fn version(&self) -> &str {
        match self {
            Python::System { version, .. } | Python::Bundled { version, .. } => version,
        }
    }
}

pub fn no_window(c: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    c
}

/// "3.12.3" -> true when it is 3.10 or newer.
fn new_enough(v: &str) -> bool {
    let mut parts = v.trim().split('.').filter_map(|p| p.parse::<u32>().ok());
    matches!((parts.next(), parts.next()), (Some(3), Some(minor)) if minor >= 10)
}

/// Python 3.10+ on PATH, if any. On Windows the Microsoft Store "python" alias
/// exits with an error without a real Python behind it, so it is skipped too.
pub fn system() -> Option<Python> {
    let candidates: &[&[&str]] = if cfg!(windows) { &[&["py", "-3"], &["python"], &["python3"]] } else { &[&["python3"], &["python"]] };
    for c in candidates {
        let mut cmd = Command::new(c[0]);
        cmd.args(&c[1..]).args(["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]);
        let Ok(out) = no_window(&mut cmd).output() else { continue };
        if !out.status.success() {
            continue;
        }
        let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if new_enough(&version) {
            return Some(Python::System { argv: c.iter().map(|s| s.to_string()).collect(), version });
        }
    }
    None
}

fn root(app_data: &Path) -> PathBuf {
    app_data.join("python")
}

fn bundled_dir(app_data: &Path) -> PathBuf {
    root(app_data).join(EMBED_VERSION)
}

/// The embeddable Python, when it is downloaded and complete.
pub fn bundled(app_data: &Path) -> Option<Python> {
    let dir = bundled_dir(app_data);
    let exe = dir.join("python.exe");
    (exe.is_file() && dir.join(STDLIB_ZIP).is_file()).then(|| Python::Bundled { exe, version: EMBED_VERSION.into() })
}

/// The Python to use: one on PATH first, else the one Credence downloaded.
pub fn find(app_data: &Path) -> Option<Python> {
    system().or_else(|| bundled(app_data))
}

/// Only Windows gets a downloaded Python. Linux packages depend on python3, and
/// macOS and Linux desktops ship one.
pub fn can_bundle() -> bool {
    cfg!(all(windows, target_arch = "x86_64"))
}

/// What the `._pth` file must say so `coli` can import its own modules.
fn pth_text(colibri_dir: &Path) -> String {
    let mut lines = vec![STDLIB_ZIP.to_string(), ".".to_string()];
    for d in [colibri_dir.to_path_buf(), colibri_dir.join("tools")] {
        lines.push(d.to_string_lossy().into_owned());
    }
    lines.join("\r\n") + "\r\n"
}

/// Points the embeddable Python at the Colibri folder that holds `coli`.
pub fn prepare_bundled(exe: &Path, colibri_dir: &Path) -> Result<(), String> {
    let pth = exe.with_file_name(PTH_FILE);
    let want = pth_text(colibri_dir);
    if std::fs::read_to_string(&pth).is_ok_and(|s| s == want) {
        return Ok(());
    }
    std::fs::write(&pth, want).map_err(|e| format!("Could not set up Python for Colibri: {e}"))
}

/// Downloads the embeddable Python when this PC has no Python 3.10+.
/// `progress(done, total)` reports the download.
pub async fn ensure(
    app_data: &Path,
    client: &reqwest::Client,
    progress: &(dyn Fn(u64, u64) + Send + Sync),
) -> Result<Option<Python>, String> {
    let app = app_data.to_path_buf();
    let found = tokio::task::spawn_blocking(move || find(&app)).await.map_err(|e| e.to_string())?;
    if found.is_some() || !can_bundle() {
        return Ok(found);
    }
    let root = root(app_data);
    tokio::fs::create_dir_all(&root).await.map_err(|e| e.to_string())?;
    let zip = root.join(format!("python-{EMBED_VERSION}-embed-amd64.zip"));
    let res = client
        .get(EMBED_URL)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Can't download Python for the engine. Check your internet connection. ({e})"))?;
    let total = res.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&zip).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut done = 0u64;
    let mut last = std::time::Instant::now();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Python download stopped: {e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if last.elapsed().as_millis() > 200 {
            last = std::time::Instant::now();
            progress(done, total);
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != EMBED_SHA256 {
        let _ = std::fs::remove_file(&zip);
        return Err("The Python download was damaged (checksum mismatch). Try again.".into());
    }

    let (z, r) = (zip.clone(), root.clone());
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let staging = r.join(format!("{EMBED_VERSION}.partial"));
        let dest = r.join(EMBED_VERSION);
        let _ = std::fs::remove_dir_all(&staging);
        crate::colibri_setup::extract(&z, &staging)?;
        let _ = std::fs::remove_dir_all(&dest);
        std::fs::rename(&staging, &dest).map_err(|e| e.to_string())?;
        // Older downloaded versions.
        if let Ok(rd) = std::fs::read_dir(&r) {
            for e in rd.flatten() {
                if e.path().is_dir() && e.path() != dest {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&zip);
    Ok(bundled(app_data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_the_version() {
        assert!(new_enough("3.10.0"));
        assert!(new_enough("3.13.17\n"));
        assert!(!new_enough("3.9.18"));
        assert!(!new_enough("2.7.18"));
        assert!(!new_enough(""));
    }

    #[test]
    fn pth_lists_stdlib_and_colibri_folders() {
        let t = pth_text(Path::new("C:/data/colibri/v2.1.0"));
        let lines: Vec<&str> = t.lines().collect();
        assert_eq!(lines[0], STDLIB_ZIP);
        assert!(lines.contains(&"."));
        assert!(lines.iter().any(|l| l.ends_with("v2.1.0")));
        assert!(lines.iter().any(|l| l.ends_with("tools")));
        // No `import site`: nothing outside the standard library is needed.
        assert!(!t.contains("import site"));
    }

    #[test]
    fn bundled_needs_exe_and_stdlib() {
        let app = std::env::temp_dir().join(format!("credence-py-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app);
        assert!(bundled(&app).is_none());
        let dir = bundled_dir(&app);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("python.exe"), "").unwrap();
        assert!(bundled(&app).is_none());
        std::fs::write(dir.join(STDLIB_ZIP), "").unwrap();
        assert_eq!(bundled(&app).unwrap().version(), EMBED_VERSION);
        prepare_bundled(&dir.join("python.exe"), Path::new("/c")).unwrap();
        assert!(std::fs::read_to_string(dir.join(PTH_FILE)).unwrap().contains("tools"));
        std::fs::remove_dir_all(&app).unwrap();
    }

    #[test]
    fn pinned_hash_is_hex() {
        assert_eq!(EMBED_SHA256.len(), 64);
        assert!(EMBED_SHA256.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(EMBED_URL.contains(EMBED_VERSION));
    }
}
