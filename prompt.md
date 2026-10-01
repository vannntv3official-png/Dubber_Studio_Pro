# ROLE
You are a senior Electron + Node.js + Python engineer. Build a complete, production-quality Windows desktop app called **"AI Dubbing Studio"**: it takes a video, transcribes the speech (Faster-Whisper and/or Gemini API), translates it to Khmer and other languages (Gemini API), synthesizes dubbed voices per speaker (Microsoft edge-tts), and mixes the result back into the video. Work autonomously in milestones, run the app after each milestone, fix errors, and only ask me questions when truly blocked.

# STARTING POINT
The attached folder `glass-app/` contains a working UI prototype (`main.js`, `package.json`, `index.html`) with a glassmorphism design, plus a screenshot of the reference app "DAI Dubber". Keep the existing visual style and layout: top bar; left panel (preview + workspace tools); right side (subtitle table + timeline editor); bottom status bar. Do NOT redesign it. Split the single `index.html` into proper modules (ui, state, table, timeline, player, i18n, ipc client) and replace all demo data and fake toasts with real functionality.

# TECH STACK
- Electron (latest stable), plain HTML/CSS/JS in the renderer (Vite + vanilla JS/TypeScript allowed; no heavy UI framework).
- The main process does all file access, FFmpeg, network and API calls. The renderer talks to it ONLY through `preload.js` (contextBridge + ipcMain.handle). Set contextIsolation: true, nodeIntegration: false, sandbox where possible, and a strict CSP.
- FFmpeg + ffprobe bundled (ffmpeg-static / ffprobe-static or extraResources). The user must never need to install FFmpeg.
- **Python sidecar** for Faster-Whisper and edge-tts. Package it as a standalone executable (PyInstaller or an embedded Python runtime) in Electron `extraResources`, so the user never installs Python. The main process spawns it as a child process and talks to it via JSON lines over stdin/stdout (or a random localhost-only port). Handle crashes, restarts, cancellation, and clean shutdown.
- Whisper models are downloaded on first use into the app data folder (NOT bundled in the installer). Show a download dialog with size and progress; let the user choose the model size (small / medium / large-v3) in Settings. Auto-detect CUDA; fall back to CPU (int8) and warn about speed.
- Package with electron-builder (Windows NSIS installer; macOS optional).
- UI language: Khmer by default (keep the Khmer labels from the prototype) with an EN/KM switch via a JSON i18n dictionary. Font stack: "Khmer UI", "Noto Sans Khmer", system-ui. Bundle Noto Sans Khmer locally so Khmer renders correctly on every machine.

# PROVIDERS (define interfaces, implement exactly these)
- `AsrProvider`: FasterWhisper, Gemini, Hybrid (plus Mock for tests)
- `TranslationProvider`: Gemini (plus Mock)
- `TtsProvider`: EdgeTts (plus Mock producing sine-wave audio)
- `SeparationProvider` (BGM isolation): local Demucs-style option, or "load my own BGM file". If the local model is missing, guide the user to download it.
Keep model names, voice names and endpoints in config, never hard-coded.

# CORE PIPELINE (each stage cancellable, resumable, with progress events to the UI)
1. **Import**: load video (mp4/mov/mkv/webm) or audio. Use ffprobe for duration and streams. Extract audio to 16 kHz mono WAV for ASR and keep the original stereo track.
2. **Isolate BGM** ("Isolate BGM" button): separate vocals from background music via `SeparationProvider`, or use the BGM file the user loads ("Load BGM").
3. **Transcribe** ("Transcribe" button). The user chooses the engine in Settings:
   a) **Faster-Whisper** (local, default): VAD filter, word-level timestamps, language auto-detect or manual, configurable beam size. Merge words into subtitle segments (max duration, max characters, split on punctuation and pauses). Stream progress to the UI.
   b) **Gemini API** (cloud): upload audio through the Gemini Files API, chunk long audio into overlapping pieces (e.g. 10 minutes), request strict JSON segments `{start, end, text, speaker, gender}`, validate and retry on malformed output, then stitch the chunks.
   c) **Hybrid**: Faster-Whisper provides accurate timestamps; Gemini labels speakers/gender and corrects obvious recognition errors using the audio plus the segment list, WITHOUT changing timestamps.
   Output segments: `{id, start, end, text, speaker, gender}`. Faster-Whisper has no diarization, so speaker/gender come from Gemini (hybrid) or stay "unknown" for the user to assign.
4. **Translate**: Gemini API only. Batch segments (30–50 per request) with context (previous/next lines, speaker, gender, series glossary and character names) and ask for natural, concise, speakable translations that fit the original segment duration (give a characters-per-second budget). Use JSON output with a response schema; validate segment count and ids, retry only the failed items. Target languages: Khmer (default), English, Thai, Vietnamese, Chinese, etc. Let the user pick a fast or a higher-quality Gemini model.
5. **Voice assignment**: each segment has a voice profile (A1–A5, M/F). Support "Cast" (character list with assigned voice, editable name/gender) and "Set voice to" bulk actions exactly as in the prototype. Auto-suggest the voice from speaker/gender.
6. **Synthesize** ("Generate Selected Audio"): Microsoft Edge TTS through the Python `edge-tts` package in the sidecar (no API key).
   - Khmer voices: `km-KH-PisethNeural` (male) and `km-KH-SreymomNeural` (female). Only 2 exist, so voice profiles A1–A5 are **presets** `{baseVoice, rate, pitch, volume}` (e.g. A1 = Piseth normal, A2 = Piseth lower pitch, A4 = Piseth slightly faster, A3 = Sreymom normal, A5 = Sreymom higher pitch). Presets are editable and previewable in Settings.
   - For other languages, list voices with edge-tts `list_voices()` (cached) and let the user map any voice to a profile.
   - Map the segment Speed setting to edge-tts `rate` first; use FFmpeg `atempo` only for the remaining fine-fit. Cache clips by hash(text + voice + rate + pitch + volume).
   - Limit concurrency (4–8 parallel), retry with backoff on network errors, show per-segment status.
   - Document in Settings/README: edge-tts uses an unofficial online service, needs internet, and may change or stop working; keep it behind `TtsProvider` so another provider can be added later.
7. **Fit timing**: compare each clip's duration to its slot (end − start). Auto-Fit modes Off/Low/Med/High adjust speed within a max range per mode (chain `atempo` filters when outside 0.5–2.0), with per-segment override. "Sync End" ON: shift/trim so clips end at the segment end without overlapping the next one. Show a warning status in the table when a clip still overflows.
8. **Mix**: build the final audio with FFmpeg (adelay per clip, amix). Options: original audio muted/attenuated, BGM track with **Ducking** (sidechaincompress) under the dub voice, "Crowd" ambience toggle, global Volume, Pitch, Reverb.
9. **Export**: render MP4 with the new audio (copy the video stream when possible), with progress and cancel. Also export SRT/VTT and import SRT/VTT.

# UI FEATURES TO WIRE UP (all exist visually in index.html)
- **Top bar**: project name, open/save project, Undo/Redo (command history covering every edit), theme toggle (persisted), language switch, Settings, Export.
- **Left panel**: real `<video>` preview with subtitle overlay synced to the current time; play/stop/volume; seek by clicking the bar; icon toolbar (Crop, Blur/mask original hard-subs, Watermark, Effects) implemented as an overlay-effects module applied at export via FFmpeg filters (start with blur-region and watermark; show the rest as clearly disabled "coming soon").
- **Workspace tools**: Load Video, Load BGM, Load A1 Audio, Isolate BGM, Audio Muted toggle, Export SRT, Import SRT/VTT, Intro & Outro (prepend/append a clip or image with a duration).
- **Subtitle table**: virtualized rows (smooth with 2,000+ segments); inline Khmer text editing; time editing; multi-select; Add Text, Edit, Delete; Find & Replace (match count, case option, apply to selection); Series (group/sort by voice); all-voices filter; Cast dropdown; per-row voice select with M/F badge; per-row speed slider; per-row audio status (not generated / generating / ready / overflow) with a preview-play button; clicking a row seeks the video and highlights the clip on the timeline.
- **Timeline**: real waveforms for ORIG, A1 (dub) and A2 (BGM) tracks (peaks precomputed in the main process); video thumbnails on V1; T1 subtitle clips that can be dragged to move and resized at the edges (updates start/end); Split at playhead; zoom slider + mouse-wheel zoom; draggable playhead; snapping; per-selection Speed / Vol / Pitch / Reverb controls that actually apply.
- **Status bar**: current project, "Keys n/m" (Gemini key pool status), memory usage from process.memoryUsage / os.

# SETTINGS & GEMINI KEY POOL
- Only Gemini needs API keys (edge-tts and Faster-Whisper need none). Settings: add/remove multiple Gemini keys, test each key, choose models for transcription and translation, temperature, batch size, max concurrent requests.
- Key pool: round-robin across keys; on 429 / quota / 503, mark that key as cooling down (with a timer) and retry with the next key; the status bar shows "Keys available/total".
- Store keys encrypted with Electron `safeStorage`; never log them or send them back to the renderer (masked values only).
- Other settings: ASR engine (Faster-Whisper / Gemini / Hybrid), Whisper model size + device (auto/CPU/CUDA), edge-tts voice presets A1–A5, default target language, cache folder, FFmpeg threads.
- Concurrency limiter + exponential backoff for all network calls.

# PROJECT FORMAT
A project is a folder with `project.json` (segments, cast, settings, track states, schema version for migrations), `media/` (extracted audio, BGM, peaks), `tts-cache/`, and `exports/`. Autosave every 30 s and on change (debounced); recover after a crash. Recent-projects list on the start screen.

# QUALITY REQUIREMENTS
- Every long task shows progress, ETA and a Cancel button; errors show a clear Khmer message with a "details" expander and a retry action. No silent failures.
- Never block the UI thread; heavy work runs in child processes / worker threads.
- Accessibility: keyboard navigation, visible focus, ARIA labels, prefers-reduced-motion respected.
- Shortcuts: Space play/pause, Ctrl+Z / Ctrl+Y, Ctrl+S, Ctrl+F (find & replace), Delete, S (split), arrow keys to move between rows.
- Rotating log file, plus an "Open logs folder" action in Settings.
- Unit tests for: timing/auto-fit math, atempo chain builder, SRT/VTT parse/serialize, key-pool rotation, project migration, Gemini JSON validation. One end-to-end smoke test on a 10-second sample video using the Mock providers, so the whole pipeline runs offline.

# MILESTONES (finish, run and verify each before moving on; summarize what you verified)
- **M1**: Project structure, security-hardened Electron shell, prototype UI split into modules, i18n, theme, bundled Khmer font.
- **M2**: Import video, ffprobe, real preview player, waveform peaks, timeline rendering, project save/load/autosave, undo/redo.
- **M3**: Subtitle table fully functional (edit, filter, cast, find & replace, SRT/VTT import/export) + timeline drag/resize/split.
- **M4**: Python sidecar (spawn, IPC, cancel, packaging), Faster-Whisper transcription with model download, Gemini key pool + settings, Gemini transcription and Hybrid mode.
- **M5**: Gemini translation with batching, context, JSON validation and retries; voice assignment and Cast.
- **M6**: edge-tts synthesis with voice presets, caching, auto-fit / sync-end, per-clip preview, overflow warnings.
- **M7**: Mixing (ducking, BGM, volume, pitch, reverb), overlay effects (blur/watermark), intro/outro, MP4 export with progress and cancel.
- **M8**: Tests, error-handling polish, performance pass on 2,000 segments, electron-builder installer (including the Python sidecar), README with setup and provider instructions.

# DEFINITION OF DONE
I can open a real 10–20 minute video, click Transcribe → Translate → assign voices → Generate → Export, and get an MP4 dubbed in Khmer with the BGM preserved, subtitles editable at every step, and the app never freezing. Show me the final file tree, how to run it (`npm install && npm start`), how to build the installer, and a list of known limitations.

# RULES
- Do not invent API endpoints, SDK names, or model names: read the current official documentation for Gemini (Files API, JSON schema mode, limits), faster-whisper, and edge-tts before implementing. Pin dependency versions in `package.json` and `requirements.txt`.
- Keep code modular and commented where non-obvious; no dead code. No placeholder buttons in the final build: anything not implemented must be visibly disabled with a tooltip.
- Ask me before adding any paid service or large model download.

# UPDATE: REDESIGNED SETTINGS DIALOG (SIDEBAR MODAL)
The Settings dialog has been completely redesigned from horizontal tabs into a modern sidebar modal (900x600, min 720x480 glass panel):
- **Layout**: Centered glass panel, gear header, responsive sidebar (collapses to icon-only under 720px), search bar (`Ctrl+F` cross-section filter), independent content scroll, footer with [Cancel] + [Save Settings] (disabled until dirty, shows "✓ Saved", restart badge).
- **Modular Renderer Architecture**: Split into individual modules under `src/renderer/js/settings/`:
  - `section-general.js`: UI language (KM/EN), target language, project folder picker, cache size & clear cache, autosave interval, confirm delete.
  - `section-theme.js`: Dark/light/system mode, 6 accent color presets, glass blur slider (0-24px), reduce-motion toggle (all preview live).
  - `section-keys.js`: safeStorage encrypted keys, eye toggle, multi-key paste textarea, masked list with last-used/error metrics, test/delete, Gemini model selector, concurrency & batch size.
  - `section-asr.js`: ASR engines, Whisper models, device auto/CPU/CUDA, beam size, hardware info card, download/delete model with progress bar.
  - `section-voices.js`: Voice list for target language, character presets A1-A5 with name, gender badge (M/F), base voice, sliders, preview playback, reset default.
  - `section-pronunciation.js`: Phonetic dictionary table (Written -> Spoken), CRUD, search filter, TTS test button, JSON/CSV import & export. Applied before synthesis and hashed into TTS cache key.
  - `section-shortcuts.js`: Rebindable keyboard shortcuts with interactive key recording, duplicate conflict detection, and reset to defaults.
  - `section-system.js`: System diagnostics grid, Developer mode toggle, Separation engine selector, Copy Diagnostics button, Open Logs folder, Export logs archive, FFmpeg threads.
  - `section-about.js`: Version, credits, update status tooltip.

# UPDATE: AUDIT BUG FIXES & ARCHITECTURE POLISH (PHASES 1 - 3)
Following an in-depth audit of functionality across UI and backend services, the application underwent targeted fixes organized into three verified phases:

1. **Phase 1: Critical Bug Fixes & Stability**
   - Safe Duration Helper: Replaced all unhandled `TOTAL_DURATION` references with `getProjectDuration()`, preventing runtime ReferenceErrors when no video is loaded. "+ Add Text" works safely with an empty project, while playback controls gracefully disable with clear tooltips.
   - IPC Contract Alignment: Fixed BGM separation field name mismatches (`bgmPath` / `vocalsPath`) and unified response handling.
   - Static DOM Verification: Corrected empty-state button IDs (`importSrtBtn`) and instituted static checking against dangling DOM IDs.
   - Full-Length Video Export: Resolved export truncation defects where outputs were cut to TTS duration. FFmpeg now guarantees exported videos preserve 100% of source duration with correct speech delay offsets (`adelay`), audio-video synchronization, and speech window energy containment.

2. **Phase 2: Reactive & Fully Applied Settings**
   - Pre-paint Theme Injection: Accent color, glass blur (0-24px), and reduced motion settings are injected directly into document attributes before first paint, eliminating style flashes.
   - Dynamic Autosave: Settings change dynamically updates or clears the autosave interval timer.
   - Project Path Resolution: Default project folder picker is integrated with sanitize checks, directory creation, and non-destructive numerical collision suffixes.
   - Configurable Confirmations: Delete operations respect `confirmDelete` preference, backed by non-destructive Undo toast.
   - Centralized FFmpeg Threading: Centralized `-threads N` CLI builder applied across all FFmpeg operations.
   - Interactive Audio Gain: Timeline Volume slider controls live preview gain via Web Audio API, and Pitch shift is explicitly badged as applied upon export.
   - 100% Settings Key Coverage: Automated static analysis ensures every key in `DEFAULT_SETTINGS` is actively read and consumed.

3. **Phase 3: Clean UI, Developer Mode & Profile Protection**
   - Preview Toolbar Cleanup: Hidden 7 non-functional stub icon buttons (previous frame, snapshot, crop, aspect ratio, filters, grid, advanced tools) behind `ENABLE_PREVIEW_STUBS = false`, leaving active Blur and Watermark tools prominent. Hidden disabled updater button in About.
   - Developer Mode Guard: Added Developer Mode toggle in Settings > System. Mock providers for ASR, Translation, TTS, and Audio Separation are hidden from normal users and clearly flagged with `[MOCK]` badges when developer mode is enabled.
   - Explicit Pronunciation Dictionary Seeding: Replaced silent auto-seeding with an on-demand "Add example rules" button.
   - Profile Copy Testing: Rigorous automated verification ensures real user profiles are never overwritten or populated with demo/sample projects during testing.

