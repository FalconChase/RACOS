import pkg from "../../package.json";

// Single source of truth: package.json. Keep src-tauri/Cargo.toml and
// src-tauri/tauri.conf.json's "version" fields in sync with this by hand when
// bumping — semver from here on: PATCH for fixes, MINOR for new
// backward-compatible features, MAJOR for breaking changes or the first
// production-ready release.
export const APP_VERSION = pkg.version;
