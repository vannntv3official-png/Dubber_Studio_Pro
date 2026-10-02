# Changelog — AI Dubbing Studio

All notable changes to AI Dubbing Studio are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-02

### Added
- **Production Release Foundation:** Full pipeline support for automated speech recognition (Faster-Whisper), contextual translation to Khmer (Gemini AI), voice synthesis per character (Microsoft Edge-TTS), and audio-video mixing with ducking (FFmpeg).
- **First-Run Welcome Experience:** Interactive Welcome Guide modal (`#welcomeModal`) explaining core workflows, providing direct model selection (tiny/base/small/medium), free Gemini key registration link, and key connection tester.
- **Sample 10-Second Project:** Bundled 10-second reference project (`test-assets/sample_10s_project/project.json`) accessible via empty-state and welcome modal without loading external video files.
- **Enhanced Error Diagnostics:** Human-readable bilingual (Khmer/English) error messages with immediate remediation advice and a one-click **"📋 Copy details"** clipboard action.
- **Sanitized System Diagnostics:** Export diagnostic log bundle feature (`system:export-logs`) incorporating OS/Chromium/Node/Electron versions, memory statistics, FFmpeg paths, and automatic regex redaction of all Gemini API keys (`AIzaSy...`).
- **Schema Migration Engine:** Robust schema versioning (`schemaVersion: 1`) with automated v0-to-v1 forward migration, metadata normalization, and invalid schema rejection.
- **Dual-Theme WCAG AA Contrast:** Enhanced color tokens for both Dark and Light themes achieving 15.4:1 (Dark) and 13.9:1 (Light) contrast ratios for body text.

### Fixed
- **DEF-01 (External Links in Electron Shell):** Fixed external HTTP/HTTPS links opening inside internal Electron webContents; external URLs now strictly route to system default web browser via `shell.openExternal`.
- **DEF-02 (Settings Atomic Save & Recovery):** Fixed crash vulnerability during settings persistence by writing to atomic `.tmp` files, renaming, maintaining `.bak` backups, and auto-recovering on corrupted JSON.
- **DEF-03 (Project Atomic Save & Recovery):** Fixed project state corruption on sudden termination or power failure using atomic `.tmp` swap and automatic `.bak` recovery.
- **DEF-07 (Schema Version Normalization):** Fixed missing schema version header in legacy project files causing inconsistent migrations.
- **Audio/Video Truncation Bug:** Resolved FFmpeg `adelay` and `amix` stream duration mismatch that truncated 7.6s+ videos to 3.1s; exports now accurately preserve 100% of source container duration within 0.05s.
- **ReferenceError on Empty State Controls:** Resolved `ReferenceError: TOTAL_DURATION is not defined` when interacting with empty timeline, play scrubber, and "+ Add Text" before video import.
- **Property Mismatch in BGM Isolation:** Corrected IPC field mismatch (`accompanimentPath` vs `bgmPath`) and unified contract in shared definitions.
- **Dangling DOM Reference:** Fixed `openSrt` vs `importSrtBtn` selector mismatch in empty state.

### Security
- **safeStorage Key Encryption:** Gemini API keys are encrypted at rest using OS-level DPAPI / Keychain encryption via Electron `safeStorage`.
- **Content Security Policy (CSP):** Strict CSP enforced forbidding external script/style injections.
- **Zero Telemetry:** Verified application transmits zero analytics, background pings, or telemetry.

### Reliability
- **Python Sidecar Auto-Restart:** Sidecar crash detection automatically restarts the Python background worker up to 3 times with exponential backoff.
- **Resumable Whisper Downloads:** Enabled `resume_download=True` on Hugging Face snapshot downloads for local Whisper models.
