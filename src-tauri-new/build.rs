fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        // Find the macOS SDK so the compiler can resolve Cocoa/AppKit headers.
        let sdk_path = std::process::Command::new("xcrun")
            .args(["--show-sdk-path"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| {
                "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk".into()
            });

        cc::Build::new()
            .file("macos_icon.m")
            .flag("-ObjC")
            .flag("-isysroot")
            .flag(&sdk_path)
            .compile("macos_icon");

        // Link Cocoa framework at the linker stage (cc only compiles, not links).
        println!("cargo:rustc-link-lib=framework=Cocoa");
    }
}
