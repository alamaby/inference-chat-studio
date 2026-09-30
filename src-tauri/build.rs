fn main() {
    // Build metadata for the About dialog. Every value has a fallback so the
    // build never panics without git, without network, or with no env set
    // (e.g. building from a source archive).
    println!("cargo:rerun-if-env-changed=ICS_BUILD_NUMBER");
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs/heads/");

    // Build number: explicit env wins, then the commit count, then "0".
    let build_number = match std::env::var("ICS_BUILD_NUMBER") {
        Ok(raw) if is_numeric(&raw) => raw,
        _ => git(&["rev-list", "--count", "HEAD"])
            .filter(|v| is_numeric(v))
            .unwrap_or_else(|| "0".to_string()),
    };
    let git_sha = git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".to_string());
    // Epoch seconds, not RFC3339: build-dependencies carry no date crate.
    let build_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    println!("cargo:rustc-env=ICS_BUILD_NUMBER={build_number}");
    println!("cargo:rustc-env=ICS_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=ICS_BUILD_TIME={build_time}");

    tauri_build::build()
}

fn git(args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn is_numeric(raw: &str) -> bool {
    !raw.is_empty() && raw.chars().all(|c| c.is_ascii_digit())
}
