# AI Dubbing Studio PRO 🎬

AI Dubbing Studio is a production-quality Windows desktop application built with Electron, Node.js, and Python. It automates video speech transcription (Faster-Whisper / Gemini AI), translation into Khmer and other languages (Gemini AI), voice synthesis per character (Microsoft Edge-TTS), and audio mixing/exporting (FFmpeg).

---

## ⚙️ Modern Sidebar Settings Dialog

The settings interface has been redesigned from horizontal tabs into a sidebar modal (~900x600, min 720x480) with a glassmorphism theme, bilingual Khmer/English support, and comprehensive configuration options.

### Structure & Sections
1. **⚙️ General (ការកំណត់ទូទៅ)**
   - UI Language switcher (`km` Khmer / `en` English) with instant reactive update.
   - Default target language selector (Khmer, English, Thai, Vietnamese, Chinese, Japanese).
   - Default project folder picker with native folder selection dialog.
   - TTS audio cache size calculation and one-click "Clear Cache" button.
   - Autosave interval (15s, 30s, 60s, 120s, disabled).
   - Confirm before delete toggle.

2. **🎨 Theme & Appearance (រូបរាង & បែបផែន)**
   - Color Mode: Dark, Light, or follow System appearance.
   - Accent Color Presets: Emerald Teal (`#10b981`), Electric Purple (`#8b5cf6`), Cyan Blue (`#06b6d4`), Royal Blue (`#3b82f6`), Amber Orange (`#f59e0b`), Rose Pink (`#ec4899`).
   - Glass Blur Intensity slider (0–24px) with real-time backdrop blur preview.
   - Reduce Motion toggle with instant animation disabling.

3. **🔑 Gemini API Keys Pool**
   - Single key entry with eye show/hide toggle.
   - Batch multi-key import (paste multiple keys, one per line).
   - SafeStorage encryption: keys are encrypted via Electron `safeStorage` in `keys.dat` and never sent to renderer unmasked.
   - Masked keys table showing active/cooling-down status, last-used timestamp, error count, test validation button, and deletion.
   - Model selection for transcription and translation (`gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`).
   - Concurrency limit (1–8) and batch size (5–100) controls.

4. **🎙 Speech Recognition (ASR)**
   - Engine selection: Local Faster-Whisper, Gemini Cloud, Hybrid, or Mock.
   - Whisper model size: `tiny`, `base` (recommended), `small`, `medium`, `large-v3`.
   - Hardware device selection: Auto, CPU (int8), CUDA GPU (float16).
   - Beam size configuration (1–10).
   - Hardware detection card displaying CUDA status, GPU name, CPU threads, and recommended compute type.
   - Model download status with download progress bar and delete model button.

5. **🗣 Voice Presets (កម្រងសម្លេងតួអង្គ A1–A5)**
   - Available Edge-TTS voices list for target language (`km-KH-PisethNeural`, `km-KH-SreymomNeural`, etc.).
   - Character presets A1–A5 with custom name, male/female badge (`♂ M` / `♀ F`), base voice, and fine-tuning sliders:
     - Speed/Rate (-50% to +50%)
     - Pitch (-20Hz to +20Hz)
     - Volume (-50% to +50%)
   - Live sample audio preview button per preset.
   - Reset to default per preset.

6. **📖 Pronunciation Dictionary (វចនានុក្រមបញ្ចេញសម្លេង)**
   - Fixes Khmer or foreign words mispronounced by Edge-TTS.
   - Maps Written text ➔ Spoken phonetic text before dispatching to the TTS engine.
   - Add, filter, and delete phonetic rules.
   - Live audio test button on each rule.
   - Import & export dictionary as JSON or CSV.
   - Deterministic dictionary hash included in audio cache keys: editing a rule automatically invalidates outdated audio clips!

7. **⌨️ Keyboard Shortcuts (ផ្លូវកាត់ក្តារចុច)**
   - Interactive rebindable shortcuts:
     - Play / Pause (`Space`)
     - Split at Playhead (`S`)
     - Save Project (`Ctrl+S`)
     - Undo (`Ctrl+Z`)
     - Redo (`Ctrl+Y`)
     - Find & Replace (`Ctrl+F`)
     - Delete Subtitle Row (`Delete`)
     - Previous / Next Subtitle (`ArrowUp` / `ArrowDown`)
   - Click any shortcut button to record a new key combination.
   - Automatic conflict and duplicate key combination detection with warning banner.
   - Reset to defaults button.

8. **💻 System & Diagnostics (ប្រព័ន្ធ & កំណត់ហេតុ)**
   - Hardware and environment diagnostic grid (OS, CPU cores, RAM, GPU, Electron, Node, Chromium, FFmpeg, Faster-Whisper).
   - "Developer Mode" toggle: Reveals `[MOCK]` providers across ASR, TTS, Translation, and Audio Separation for testing without credentials or heavy models. Normal users see only real production providers.
   - Separation engine selector: Demucs (default) or Mock (under Developer Mode).
   - FFmpeg CPU threads setting: Controls `-threads N` across all FFmpeg operations.
   - "Copy Diagnostics" button to copy diagnostic JSON to clipboard.
   - Application log directory path with "Open Logs Folder" action.
   - Export logs archive button.

9. **ℹ️ About (អំពីកម្មវិធី)**
   - App version, description, and open-source licenses (FFmpeg, Faster-Whisper, Edge-TTS, Electron).
   - Up to date status indicator (disabled stub update checks cleanly hidden).

---

## 🛠️ Video Preview & Tools

- **Clean Preview Toolbar**: Non-functional stub buttons (previous frame, snapshot, crop, aspect ratio, filters, grid, advanced tools) are hidden behind a safe feature flag (`ENABLE_PREVIEW_STUBS`).
- **Active Overlay Tools**:
  - **Blur Region**: Define and preview rectangular blur overlays to mask hardcoded burned-in subtitles.
  - **Watermark**: Overlay custom PNG/image watermarks with adjustable position and opacity.
- **Timeline Volume & Pitch Controls**:
  - Live preview volume adjustment via Web Audio GainNode.
  - Pitch shift clearly labeled as applied during FFmpeg export rendering.

---

## 🧪 Testing & Verification

The test suite runs with zero leaks, cleans up all timers and handles, and includes comprehensive verification across all three phases:

```bash
# Run complete test suite (Lint + Phase 1 + Phase 2 + Phase 3)
npm test

# Run code linter
npm run lint

# Run individual phase suites
node tests/run-phase1-tests.js
node tests/run-phase2-tests.js
node tests/run-phase3-tests.js

# Capture Phase 3 UI screenshots
npm run screenshot:phase3
```

### Automated Verifications Include:
- **Phase 1**: `TOTAL_DURATION` safety helper (`getProjectDuration()`), BGM isolation IPC contract and mock separation waveform, DOM element selector static integrity (0 dangling IDs), and export duration matching source length (10.000s fixture verified with ffprobe and speech window energy measurement).
- **Phase 2**: Startup theme/glass-blur/reduce-motion injection before paint, autosave interval timer reconfiguration, default project folder resolution and collision avoidance, confirm-before-delete dialog preference, central FFmpeg `-threads` builder, live timeline volume gain, and 100% settings.json key utilization.
- **Phase 3**: Preview toolbar stub removal, Developer Mode toggle and `[MOCK]` visibility protection, Pronunciation "Add example rules", and safety validation on real profile copies.
