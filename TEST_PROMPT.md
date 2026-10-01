# AI Dubbing Studio — Test Suite & Verification Guide

This document describes the testing architecture, automated verification suites, and guidelines for testing AI Dubbing Studio across all feature phases.

---

## 🏃 Running Tests

All tests are designed to execute cleanly and exit automatically without dangling timers, open sockets, or unhandled file handles.

```bash
# Run the complete test suite (Linter + Phase 1 + Phase 2 + Phase 3)
npm test

# Run code linter
npm run lint

# Run individual phase test runners
node tests/run-phase1-tests.js
node tests/run-phase2-tests.js
node tests/run-phase3-tests.js

# Capture UI verification screenshots for Phase 3
npm run screenshot:phase3
```

---

## 🏗️ Test Suite Architecture

### 1. Code Quality & Linting (`npm run lint`)
- **Engine**: ESLint 9+ (`eslint.config.mjs`)
- **Rules**: Enforces `no-undef`, strict JS syntax, and variable scoping across both `src/main` and `src/renderer`.

---

### 2. Phase 1: Critical Bug Verification (`tests/run-phase1-tests.js`)
- **Item 1 (`test-item1-total-duration.js`)**:
  - Validates that `TOTAL_DURATION` is replaced everywhere by `getProjectDuration()`.
  - Verifies "+ Add Text" functions safely without a loaded video (creates 0–3s segment without throwing).
  - Verifies Play button and progress scrubber are safely disabled with informative tooltips when no video is loaded.
- **Item 2 (`test-item2-separation-mock.js`)**:
  - Validates the IPC contract for BGM isolation: checks response shape `{ success, vocalsPath, bgmPath }`.
  - Tests mock separation provider integration, waveform peaks generation, and error message propagation.
- **Item 3 (`test-item3-dom-selectors.js`)**:
  - Statically analyzes all JavaScript files for `document.getElementById` and `querySelector('#id')`.
  - Verifies that all 300+ referenced IDs exist within `src/renderer/index.html` (zero dangling DOM references).
- **Item 3b (`test-item3b-export-duration.js`)**:
  - Performs an end-to-end export on a 10.000s synthetic audio/video fixture via the IPC export service.
  - Verifies using `ffprobe`:
    - Output duration matches source duration within 0.1s (observed: 10.000s, diff = 0.0000s).
    - Audio/video drift is within sync tolerance (observed: 0.00ms).
    - Speech audio energy is localized within subtitle segment windows (observed: -15.0dB) and silent outside (observed: -99.0dB).
    - BGM ducking attenuates background music during speech segments (observed: -28.4dB).

---

### 3. Phase 2: Reactive Settings Verification (`tests/run-phase2-tests.js`)
- **Item 4 (`test-item4-theme-startup.js`)**:
  - Verifies pre-paint startup injection of accent color, glass blur, and reduce-motion CSS attributes.
- **Item 5 (`test-item5-autosave.js`)**:
  - Verifies `settings.general.autosaveIntervalSec` dynamically adjusts the autosave timer and shuts it down when set to 0.
- **Item 6 (`test-item6-project-folder.js`)**:
  - Tests default project directory creation, path sanitization, and automatic incrementing numeric suffixes (`(1)`, `(2)`) to avoid overwriting existing projects.
- **Item 7 (`test-item7-confirm-delete.js`)**:
  - Verifies that `confirmDelete` settings control interactive deletion confirmation dialogs while preserving the Undo toast.
- **Item 8 (`test-item8-ffmpeg-threads.js`)**:
  - Verifies that `settings.system.ffmpegThreads` centrally appends `-threads N` to all FFmpeg commands ("Auto" omits flag).
- **Item 9 (`test-item9-timeline-sliders.js`)**:
  - Verifies timeline Volume slider connects to live Web Audio `GainNode` and Pitch slider displays export notice.
- **Item 10 (`test-item10-settings-keys.js`)**:
  - Statically scans codebase to verify 100% of keys in `DEFAULT_SETTINGS` are actively consumed.

---

### 4. Phase 3: Cleanup, Developer Mode & Profile Protection (`tests/run-phase3-tests.js`)
- **Item 11 & 12 (`test-item11-item12-cleanup-mock-devmode.js`)**:
  - Verifies the 7 stub preview toolbar buttons (previous frame, snapshot, crop, aspect ratio, filters, grid, advanced tools) are removed from the UI and guarded by `ENABLE_PREVIEW_STUBS = false`.
  - Verifies the "Check updates" stub button in About is hidden.
  - Verifies Developer Mode toggle in Settings > System controls the visibility of `[MOCK]` providers across ASR, Translation, Voices/TTS, and Separation.
  - Verifies Pronunciation Dictionary no longer auto-seeds default rules silently and provides an explicit "Add example rules" button.
- **Item 13 (`test-item13-real-profile-copy.js`)**:
  - Copies the real user profile (`%APPDATA%\glass-app`) to an isolated temporary sandbox.
  - Validates that real user projects (`重活一世谁还要追她啊_EP138`, `逆江湖之苍生为局第四季_EP110`) are preserved.
  - Validates that no demo strings (`E02`, `Story Dubbing`, sample Khmer lines) are seeded into the user's project storage.
  - Confirms the original user profile on disk was left 100% untouched.

---

## 📸 Capturing Visual Screenshots

To capture automated visual snapshots of the Settings dialog and main workspace:
```bash
npm run screenshot:phase3
```
Output screenshots are saved in `audit/screenshots/`:
- `phase3_preview_toolbar.png`: Validates preview toolbar has only Blur and Watermark buttons visible.
- `phase3_settings_system.png`: Validates Developer Mode toggle and Separation engine selector.
- `phase3_settings_pronunciation.png`: Validates "Add example rules" button in pronunciation dictionary.
- `phase3_settings_voices.png`: Validates character voice presets and TTS engine selection.
- `phase3_settings_about.png`: Validates clean About dialog with disabled updater hidden.

---

## 🛡️ Testing Safety Rules
1. **Never write to real user profile during automated tests**: All tests must use `--user-data-dir` pointing to `os.tmpdir()` or copy the profile to a temporary directory.
2. **Clean process exit**: Always clear intervals (`clearInterval`), event listeners, and child processes so tests do not hang.
3. **No hard-coded credentials**: API keys must never be committed to test files or logged in plaintext.
