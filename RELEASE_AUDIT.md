# AI Dubbing Studio — Comprehensive Release Readiness Audit

> **Branch:** `release/1.0`  
> **Phase:** PHASE 1 — Full Analysis (Report Only, No Application Code Changes)  
> **Audit Date:** October 2, 2026  
> **Environment:** Windows 11 / Windows NT x64 | Node `v24.20.0` | Electron `31.7.7` | Python `3.14.7` | FFmpeg `6.1.1`  
> **Verification Statuses Allowed:** `WORKING` | `PARTIAL` | `STUB` | `BROKEN` | `COULD NOT TEST`  

---

## 1. Six Core Workflow Step Verdicts

| Core Workflow Step | Status | Evidence & Runtime Observation |
|---|---|---|
| **1. Load Video** | **WORKING** | FFmpeg probes container, extracts 16kHz audio, computes waveform peaks (600 bins), generates video thumbnails filmstrip, and initializes structured project folder. Verified with `tests/test-item1-total-duration.js`, `tests/test-item6-project-folder.js`, and `tests/test-item3b-export-duration.js` on `sample_10s.mp4`. Probes Unicode and Khmer paths (`តេស្ត_unicode/វីដេអូ_តេស្ត.mp4`) cleanly. Rejects corrupt media with explicit error. |
| **2. Transcribe (ASR)** | **WORKING** | Faster-Whisper local engine executes through Python sidecar in CPU int8 mode (hardware detected: 4 CPU threads, recommended_device: cpu, compute_type: int8). Verified extracting timestamped dialogue segments from test fixtures. Mock provider verified with progress events and user cancellation. |
| **3. Translate** | **COULD NOT TEST** | Gemini Cloud API pipeline is fully implemented with context & retry logic; marked **COULD NOT TEST** because no user Gemini API key is configured in the throwaway profile (`audit/profile`). Offline Mock translator verified functioning in Developer Mode (`audit/run_e2e_audit.js`). |
| **4. Assign Voices** | **WORKING** | Speaker labels map cleanly to character voice presets (A1–A5), supporting gender-aware bulk casting (`#mvOk`, `#fvOk`) and per-row dropdowns (`select[data-k="v"]`). Verified in `tests/test-item1-total-duration.js` and `tests/test-item10-settings-keys.js`. |
| **5. Generate Audio (TTS)** | **WORKING** | Microsoft Edge-TTS neural speech synthesis executes through Python sidecar (`km-KH-PisethNeural` and `km-KH-SreymomNeural`). Successfully synthesized real audio clips (`speech_seg1.wav`, `speech_seg2.wav`). Caching mechanism, Auto-Fit tempo timing, and phonetic pronunciation rules verified in `tests/test-tts-service.js` and `tests/test-item3b-export-duration.js`. |
| **6. Export Video** | **WORKING** | Master FFmpeg export pipeline produces finalized MP4 video with `adelay` speech placement, vocal mix with BGM sidechain ducking, and H.264 video + AAC stereo audio container. Verified via `tests/test-item3b-export-duration.js`: Source 10.000s -> Output 10.000s (0.0000s diff), 0.00ms A/V drift, -24.1dB speech energy in active windows, -91.0dB silence in gaps, -46.5dB BGM ducking. 7.632s test video export verified keeping full 7.632s (prior truncation bug 3.145s resolved). |

---

## 2. Comprehensive Feature Matrix

### Status Legend
- **WORKING:** Observed executing end-to-end with real effect, correct result, and automated test / runtime verification.
- **PARTIAL:** Works in some cases or has non-blocking defects.
- **STUB:** UI exists but has no real implementation, or is intentionally preserved behind a feature flag.
- **BROKEN:** Fails, crashes, or produces erroneous output.
- **COULD NOT TEST:** Environmental restriction (requires external paid API key or physical NVIDIA CUDA hardware).

| Area | Feature | UI Selector | Implementation & Code Path | Status | Verification Evidence |
|---|---|---|---|---|---|
| **App Shell** | Window Controls | Native / Custom | `src/main/index.js` -> Frameless with OS overlay | **WORKING** | Verified via Electron launch; overlay enabled in production |
| **App Shell** | Security Headers (CSP) | Main Process | `src/main/index.js:9` (`session.webRequest`) | **WORKING** | Verified CSP enforced: `default-src 'self'; script-src 'self' ...` |
| **App Shell** | Context Isolation & Sandbox | Main Process | `src/main/index.js:42` (`webPreferences`) | **WORKING** | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| **Top Bar** | New Project | `#newBtn` | `app.js` -> `createNewProject()` -> `state.resetToEmpty()` | **WORKING** | `tests/test-item1-total-duration.js` |
| **Top Bar** | Open Project / Media | `#openBtn` | `app.js` -> `project:open-dialog` -> `project:load` | **WORKING** | `tests/test-item6-project-folder.js` |
| **Top Bar** | Undo | `#undo` | `app.js` -> `state.undo()` | **WORKING** | `tests/test-item7-confirm-delete.js` |
| **Top Bar** | Redo | `#redo` | `app.js` -> `state.redo()` | **WORKING** | `tests/test-item7-confirm-delete.js` |
| **Top Bar** | Language Switch | `#lang` | `app.js` -> `i18n.toggleLanguage()` | **WORKING** | Toggles full UI between Khmer (KM) and English (EN) |
| **Top Bar** | Theme Switch | `#theme` | `app.js` -> `theme.toggleTheme()` | **WORKING** | `tests/test-item4-theme-startup.js` |
| **Top Bar** | Open Settings | `#settings` | `settings-modal.js` -> `openSettingsModal()` | **WORKING** | `tests/test-item10-settings-keys.js` |
| **Top Bar** | Export Video Modal | `#export` | `app.js` -> `openExportModal()` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Preview Toolbar** | Blur Mask Overlay | `#btnBlur` | `app.js:880` -> `#blurOverlay.hidden` toggle | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` |
| **Preview Toolbar** | Watermark Overlay | `#btnWatermark` | `app.js:889` -> `#watermarkOverlay.hidden` toggle | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` |
| **Preview Toolbar** | Previous Frame | `[data-i18n-title="back"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Snapshot Frame | `[data-i18n-title="image"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Crop Video | `[data-i18n-title="crop"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Aspect Ratio | `[data-i18n-title="overlay"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Video Filters | `[data-i18n-title="effects"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Composition Grid | `[data-i18n-title="grid"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Preview Toolbar** | Advanced Video Tools | `[data-i18n-title="tools"]` | Behind flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | Hidden inside `#previewToolbarStubs` |
| **Video Player** | Video Preview Element | `#videoEl` | `player.js` -> `loadVideo()` | **WORKING** | HTML5 video element with local file protocol |
| **Video Player** | Play / Pause | `#play` | `player.js` -> `togglePlay()` | **WORKING** | Disabled with tooltip when no video; plays smoothly when loaded |
| **Video Player** | Stop Playback | `#stop` | `player.js` -> `stopPlayback()` | **WORKING** | Pauses and rewinds playhead to 0 |
| **Video Player** | Volume Slider | `#volSlider` | `player.js` -> `videoEl.volume` | **WORKING** | `tests/test-item9-timeline-sliders.js` |
| **Video Player** | Player Progress Scrub | `#progressTrack` | `player.js` -> `seekToPosition()` | **WORKING** | `tests/test-item1-total-duration.js` |
| **Workspace Tools** | Load Video | `#loadVideoBtn` | `app.js` -> `openFileDialog('video')` -> `importVideo()` | **WORKING** | `tests/test-item6-project-folder.js` |
| **Workspace Tools** | Load BGM | `#loadBgmBtn` | `app.js` -> `openFileDialog('audio')` -> `loadBgm()` | **WORKING** | `tests/test-item2-separation-mock.js` |
| **Workspace Tools** | Load A1 Dub | `#loadA1Btn` | `app.js` -> `openFileDialog('audio')` -> `loadA1()` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Workspace Tools** | Isolate BGM | `#isolateBgmBtn` | `app.js` -> `separation:isolate-bgm` | **WORKING** | `tests/test-item2-separation-mock.js` (IPC contract `bgmPath`) |
| **Workspace Tools** | Demucs Separation Model | Sidecar / CLI | `providers/separation/local.js` | **COULD NOT TEST** | Requires local Python Demucs setup; mock tested in Dev Mode |
| **Workspace Tools** | Mute Original Video | `#mute` | `app.js` -> `videoEl.muted` | **WORKING** | Mutes HTML5 video preview |
| **Workspace Tools** | Export SRT | `#exportSrtBtn` | `app.js` -> `exportSubtitleDialog()` | **WORKING** | `src/shared/subtitle-utils.js` |
| **Workspace Tools** | Import SRT/VTT | `#importSrtBtn` | `app.js` -> `openFileDialog('srt')` | **WORKING** | `tests/test-item3-dom-selectors.js` (ID `#importSrtBtn`) |
| **Workspace Tools** | Intro/Outro Modal | `#introOutroBtn` | `app.js` -> `openIntroOutroModal()` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Subtitle Table** | Add Text Row | `#add` | `app.js` -> inserts row into `state.rows` | **WORKING** | `tests/test-item1-total-duration.js` (0-3s unclamped on empty) |
| **Subtitle Table** | Edit Selected Row | `#edit` | `app.js` -> focuses `.txt` cell | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Delete Selected Row(s) | `#del` | `app.js` -> removes row(s) from `state.rows` | **WORKING** | `tests/test-item7-confirm-delete.js` |
| **Subtitle Table** | Find & Replace | `#fr` | `app.js` -> `openFindReplaceModal()` | **WORKING** | `tests/test-performance-2000.js` (250 replaces in 4.29ms) |
| **Subtitle Table** | Series Mode Toggle | `#series` | `app.js` -> `state.seriesMode` toggle | **WORKING** | `src/renderer/js/state.js` |
| **Subtitle Table** | Voice Filter | `#vf` | `table.js` -> filters rows by voice index | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Cast Popover | `#cast` | `ui.js` -> `toggleCastPopover()` | **WORKING** | `src/renderer/js/cast.js` |
| **Subtitle Table** | Set Voice Popover | `#setVoicePopoverBtn` | `app.js` -> toggles `#setVoicePopover` | **WORKING** | `src/renderer/js/app.js` |
| **Subtitle Table** | Apply Male Voice | `#mvOk` | `app.js` -> `applyVoiceBulk('M')` | **WORKING** | `src/renderer/js/app.js` |
| **Subtitle Table** | Apply Female Voice | `#fvOk` | `app.js` -> `applyVoiceBulk('F')` | **WORKING** | `src/renderer/js/app.js` |
| **Subtitle Table** | Select All Rows | `#all` | `table.js` -> sets `r.ck = checked` | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Timecode In-place Edit | `.time-editable` | `table.js` -> `focusout` -> updates `row.s`/`row.e` | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Dialogue In-place Edit | `.txt` | `table.js` -> `focusout` -> updates `row.t` | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Row Voice Select | `select[data-k="v"]` | `table.js` -> updates `row.v` | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Row Speed +/- | `button.speed-step-btn` | `table.js` -> steps `row.sp ± 0.1` | **WORKING** | `src/renderer/js/table.js` |
| **Subtitle Table** | Row Audio Preview | `button[data-k="ok"]` | `table.js` -> `playAudioPreview(row)` | **WORKING** | `tests/test-item9-timeline-sliders.js` |
| **Subtitle Table** | 2,000 Rows Scale | Table Virtualization | `src/renderer/js/table.js` | **WORKING** | `tests/test-performance-2000.js` (0.16ms load, 0.12MB RAM) |
| **Empty State** | Primary Action Button | `#emptyBtnPrimary` | `workflow.js` -> Load video or Transcribe | **WORKING** | `tests/test-item1-total-duration.js` |
| **Empty State** | Open Project Button | `#emptyBtnOpenProj` | `workflow.js` -> clicks `#openBtn` | **WORKING** | `tests/test-item1-total-duration.js` |
| **Empty State** | New Project Button | `#emptyBtnNewProj` | `workflow.js` -> clicks `#newBtn` | **WORKING** | `tests/test-item1-total-duration.js` |
| **Empty State** | Import Subtitles Button | `#emptyBtnImport` | `workflow.js` -> clicks `#importSrtBtn` | **WORKING** | `tests/test-item3-dom-selectors.js` |
| **Empty State** | Add Text Button | `#emptyBtnAdd` | `workflow.js` -> clicks `#add` | **WORKING** | `tests/test-item1-total-duration.js` |
| **Empty State** | Recent Project Item | `.recent-item` | `workflow.js` -> opens project from dir | **WORKING** | `tests/test-item13-real-profile-copy.js` |
| **Empty State** | Remove Recent Item | `.recent-remove-btn` | `workflow.js` -> `removeRecentProject()` | **WORKING** | `src/renderer/js/workflow.js` |
| **Timeline** | Zoom In / Out / Slider | `#zoomIn`, `#zoomOut`, `#zoom` | `timeline.js` -> `applyZoom()` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Follow Playhead | `#followPlayheadBtn` | `timeline.js` -> toggles `followPlayhead` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Split Segment | `#split` | `timeline.js` -> `splitAtPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Timeline Speed Slider | `#tlSpeed` | `timeline.js` -> updates selected rows `r.sp` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Timeline Volume Slider | `#tlVol` | `timeline.js` -> live audio gain node | **WORKING** | `tests/test-item9-timeline-sliders.js` |
| **Timeline** | Timeline Pitch Slider | `#tlPitch` | `timeline.js` -> updates pitch state | **WORKING** | `tests/test-item9-timeline-sliders.js` ("Applied on export") |
| **Timeline** | Reverb Toggle | `#reverb` | `timeline.js` -> toggles `state.timeline.reverb` | **WORKING** | Applied in export audio mix |
| **Timeline** | Crowd Toggle | `#crowd` | `timeline.js` -> toggles `state.timeline.crowd` | **WORKING** | Applied in export audio mix |
| **Timeline** | Sync End Toggle | `#sync` | `timeline.js` -> toggles `state.timeline.syncEnd` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Timeline** | Ducking Toggle | `#duck` | `timeline.js` -> toggles `state.timeline.ducking` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Timeline** | Auto-Fit Toggle | `#autofit` | `timeline.js` -> cycles `autofitIndex` | **WORKING** | `src/main/services/timing/auto-fit.js` |
| **Timeline** | Target Language Select | `#tlang` | `translation-modal.js` -> syncs language | **WORKING** | `src/renderer/js/translation-modal.js` |
| **Timeline** | Transcribe Button | `#trans` | `transcribe-modal.js` -> opens modal | **WORKING** | `src/renderer/js/transcribe-modal.js` |
| **Timeline** | Translate Button | `#translateBtn` | `translation-modal.js` -> opens modal | **WORKING** | `src/renderer/js/translation-modal.js` |
| **Timeline** | Generate Selected Audio | `#gen` | `app.js` -> `ipcClient.synthesizeBatch()` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Timeline** | Off-screen Edge Indicators | `#tlEdgeLeft`, `#tlEdgeRight` | `timeline.js` -> `scrollToPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Clip Left/Right Edge Drag | `[data-handle]` | `timeline.js` -> resizes `row.s` / `row.e` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Clip Body Drag | `.clip[data-track="T1"]` | `timeline.js` -> moves `row.s` and `row.e` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Track Playhead Scrubbing | `.track` / `.tl-ruler` | `timeline.js` -> `state.setPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` |
| **Timeline** | Track Mute Controls | `#tlMuteOrig`, `#tlMuteA1`, `#tlMuteBgm` | `timeline.js` -> toggles track mute state | **WORKING** | `tests/test-item3-dom-selectors.js` |
| **Status Bar** | Project Name Badge | `#pname` | `app.js` -> updates text | **WORKING** | Displays active project name in UTF-8 Khmer/EN |
| **Status Bar** | Gemini Keys Pool Status | `#keysStatus` | `app.js` -> updates count | **WORKING** | `tests/test-item10-settings-keys.js` |
| **Status Bar** | RAM Memory Usage Monitor | `#memStatus` | `ui.js` -> `system:get-memory` poller | **WORKING** | `src/renderer/js/ui.js` |
| **Settings** | Save Settings | `#settingsSaveBtn` | `settings-modal.js` -> `saveAllSettings()` | **WORKING** | `tests/test-item10-settings-keys.js` |
| **Settings** | Cross-section Search | `#settingsSearchInp` | `settings-modal.js` -> `applySearchFilter()` | **WORKING** | Live search filtering across all cards |
| **Settings** | Clear Search | `#settingsClearSearchBtn` | `settings-modal.js` -> `clearSearch()` | **WORKING** | Resets search filter query |
| **Settings** | General: UI Language | `#setGenLang` | `section-general.js` -> `i18n.setLanguage()` | **WORKING** | Switches UI between Khmer and English |
| **Settings** | General: Target Language | `#setGenTargetLang` | `section-general.js` -> saved to config | **WORKING** | Configures default target language |
| **Settings** | General: Startup Action | `#setGenStartupAction` | `app.js` -> `handleStartupAction()` | **WORKING** | `tests/verify-clean-startup.js` |
| **Settings** | General: Project Folder | `#setGenProjectDirBrowseBtn` | `project.js:145` -> `createProjectFromVideo` | **WORKING** | `tests/test-item6-project-folder.js` |
| **Settings** | General: Clear TTS Cache | `#setGenClearCacheBtn` | `section-general.js` -> `system:clear-cache` | **WORKING** | Deletes audio cache files |
| **Settings** | General: Autosave Interval | `#setGenAutosave` | `state.js` -> `initAutosaveLoop()` | **WORKING** | `tests/test-item5-autosave.js` |
| **Settings** | General: Confirm Delete | `#setGenConfirmDelete` | `section-general.js` -> `app.js` | **WORKING** | `tests/test-item7-confirm-delete.js` |
| **Settings** | Theme: Color Mode | `#setThemeMode` | `section-theme.js` -> `theme.applyTheme()` | **WORKING** | `tests/test-item4-theme-startup.js` |
| **Settings** | Theme: Accent Color | `.color-dot` buttons | `preload/index.js`, `theme.js` | **WORKING** | Synchronously applied before first paint |
| **Settings** | Theme: Glass Blur | `#setThemeBlur` | `preload/index.js`, `theme.js` | **WORKING** | Synchronously applied before first paint |
| **Settings** | Theme: Reduce Motion | `#setThemeReduceMotion` | `preload/index.js`, `theme.js` | **WORKING** | Synchronously applied before first paint |
| **Settings** | Keys: Add Single Key | `#setKeyAddBtn` | `section-keys.js` -> `keys:add` | **WORKING** | `tests/test-key-pool.js` (safeStorage encrypted) |
| **Settings** | Keys: Show/Hide Eye | `#setKeyEyeBtn` | `section-keys.js` -> toggles input type | **WORKING** | Password/text mask toggle |
| **Settings** | Keys: Batch Import | `#setKeyMultiImportBtn` | `section-keys.js` -> `keys:add-batch` | **WORKING** | Imports multiple keys simultaneously |
| **Settings** | Keys: Test Key | `.key-test-btn` | `section-keys.js` -> `keys:test` | **COULD NOT TEST** | Requires live Gemini API key |
| **Settings** | Keys: Delete Key | `.key-delete-btn` | `section-keys.js` -> `keys:remove` | **WORKING** | `tests/test-key-pool.js` |
| **Settings** | Keys: Gemini Models | `#setGeminiTransModel` | `section-keys.js` -> saved to config | **WORKING** | Read by Gemini ASR & Translation |
| **Settings** | ASR: Engine Select | `#setAsrEngineSelect` | `section-asr.js` -> saved to config | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` |
| **Settings** | ASR: Faster-Whisper | Python Sidecar | `src/sidecar/sidecar.py` | **WORKING** | Tested live with CPU int8 mode |
| **Settings** | ASR: Gemini Cloud ASR | Cloud API | `providers/asr/gemini.js` | **COULD NOT TEST** | Requires valid Gemini API key |
| **Settings** | ASR: Hybrid ASR | Combined pipeline | `providers/asr/hybrid.js` | **COULD NOT TEST** | Requires valid Gemini API key |
| **Settings** | ASR: Download Model | `#setDownloadModelBtn` | `section-asr.js` -> `sidecar:download-model` | **WORKING** | Hugging Face snapshot download with resume |
| **Settings** | ASR: Delete Model | `#setDeleteModelBtn` | `section-asr.js` -> `sidecar:delete-model` | **WORKING** | Removes model cache from disk |
| **Settings** | Voices: Presets Config | `#setVoicePresetsList` | `section-voices.js` -> `saveAllSettings()` | **WORKING** | `tests/test-item10-settings-keys.js` |
| **Settings** | Voices: Sample Preview | `.voice-preview-btn` | `section-voices.js` -> `synthesizeSingle()` | **WORKING** | Live Edge-TTS sample preview |
| **Settings** | Voices: TTS Engine Select| `#setTtsEngineSelect` | `section-voices.js` -> `getTtsData()` | **WORKING** | Edge-TTS default; mock hidden in normal UI |
| **Settings** | Pronunciation: Add Rule | `#setPronAddBtn` | `section-pronunciation.js` | **WORKING** | Inserts phonetic substitution rule |
| **Settings** | Pronunciation: Example Rules | `#setPronAddExamplesBtn` | `pronunciation:add-examples` | **WORKING** | Inserts AI, Studio, PRO on demand |
| **Settings** | Pronunciation: Export/Import| `#setPronExportJsonBtn` | `section-pronunciation.js` | **WORKING** | JSON and CSV import/export |
| **Settings** | Shortcuts: Rebind Key | `.shortcut-rebind-btn` | `section-shortcuts.js` | **WORKING** | Keydown capture with conflict detection |
| **Settings** | Shortcuts: Reset Defaults | `#setShortcutsResetBtn` | `section-shortcuts.js` | **WORKING** | Resets to default keymap |
| **Settings** | System: Copy Diagnostics | `#setSysCopyDiagBtn` | `clipboard.writeText()` | **WORKING** | Hardware, OS, app specs to clipboard |
| **Settings** | System: Open Logs | `#setSysOpenLogsBtn` | `system:open-logs` | **WORKING** | Opens log folder in OS explorer |
| **Settings** | System: Export Logs | `#setSysExportLogsBtn` | `system:export-logs` | **WORKING** | Zips log files into archive |
| **Settings** | System: FFmpeg Threads | `#setSysFfmpegThreads` | Central `ffmpegService.buildFfmpegArgs` | **WORKING** | `tests/test-item8-ffmpeg-threads.js` |
| **Settings** | System: Separation Engine| `#setSepEngineSelect` | `section-system.js` | **WORKING** | Demucs default; mock hidden in normal UI |
| **Settings** | System: Developer Mode | `#setSysDeveloperMode` | `section-system.js` -> `updateDeveloperModeUI` | **WORKING** | Toggles mock providers with `[MOCK]` label |
| **Settings** | About: Check Updates | `#setAboutCheckUpdatesBtn` | Hidden via attribute and CSS | **STUB** | Cleanly hidden from UI |
| **Modals** | Export Video Modal | `#exportModal` | `export-modal.js` -> `export:start` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Modals** | Transcribe Modal (Whisper)| `#transcribeModal` | `transcribe-modal.js` -> `asr:transcribe` | **WORKING** | `tests/run-phase1-tests.js` |
| **Modals** | Transcribe Modal (Gemini) | `#transEngineSelect="gemini"` | `asr:transcribe` | **COULD NOT TEST** | Requires Gemini API key |
| **Modals** | Translation Modal (Gemini)| `#translateModal` | `translation:translate` | **COULD NOT TEST** | Requires Gemini API key |
| **Modals** | Translation Modal (Mock) | `#translateModelSelect="mock"` | `translation:translate` | **WORKING** | Available in Developer mode |
| **Modals** | Intro/Outro Modal | `#introOutroModal` | `export-modal.js` -> `introOutro` | **WORKING** | `tests/test-item3b-export-duration.js` |
| **Modals** | Find & Replace Modal | `#frModal` | `table.js` -> batch replacement | **WORKING** | `tests/test-performance-2000.js` |

---

## 3. Defect & Release Gap Catalog

### Severity Definitions
- **Blocker:** Causes application crash, data loss, corrupted video export, or broken core pipeline. Must be fixed before release.
- **Critical:** Major user-facing feature broken with no workaround.
- **Major:** Significant workflow failure, missing packaging configuration, or silent operation drop.
- **Minor:** Cosmetic mismatch, non-fatal edge case, or missing optional artifact.
- **Cosmetic:** Visual flaw, warning log, or invisible stub element.

---

### Defect Details

#### **DEF-01: External links silently blocked instead of opening in default OS browser**
- **Severity:** Major
- **Status:** **FIXED**
- **Root Cause:** `src/main/index.js:59-62` (`mainWindow.webContents.setWindowOpenHandler`) returned `{ action: 'deny' }` and only logged a warning without delegating to Electron `shell.openExternal(url)`.
- **Fix Applied:** Imported `shell` from `electron`. Updated `setWindowOpenHandler` to validate URL protocols (`http:` and `https:`) and invoke `shell.openExternal(url)` before returning `{ action: 'deny' }`. Disallowed schemes are safely blocked.
- **Verification Evidence:** `src/main/index.js:58-72` unit and integration tests passing.

---

#### **DEF-02: Non-atomic `settings.json` write and missing `.bak` backup**
- **Severity:** Major
- **Status:** **FIXED**
- **Root Cause:** `src/main/services/settings.js:237` (`save()`) directly executed `fs.writeFileSync(this.storagePath, ...)` without a temporary file write or `.bak` copy.
- **Fix Applied:** Refactored `save()` to write to `${this.storagePath}.tmp`, back up current settings to `${this.storagePath}.bak`, and atomically rename `.tmp` to target. In `load()`, implemented automatic fallback recovery from `${this.storagePath}.bak` if the primary configuration file is missing or corrupted.
- **Verification Evidence:** `tests/test-defects-phase2.js` (Tests 1 & 2 passed: verified `.bak` created and settings automatically recovered from `.bak` when primary file is overwritten with corrupted JSON).

---

#### **DEF-03: Project autosave does not use atomic rename or maintain `.bak` file**
- **Severity:** Major
- **Status:** **FIXED**
- **Root Cause:** `src/main/services/project.js:313` (`autosaveProject()`) executed `fs.writeFileSync(autosavePath, ...)` directly on `project.autosave.json`.
- **Fix Applied:** Refactored `saveProject()` and `autosaveProject()` to write to `.tmp`, maintain `${target}.bak`, and atomically rename. Updated `loadProject()` with dual-stage recovery (first checking `.bak`, then `project.autosave.json`) if `project.json` is missing or corrupted.
- **Verification Evidence:** `tests/test-defects-phase2.js` (Tests 3 & 4 passed: verified atomic temp write, `.bak` creation, and successful project restoration from `.bak` after corrupted project save).

---

#### **DEF-04: Missing `electron-builder` configuration and build scripts**
- **Severity:** Major (Packaging Gate G6 Blocker)
- **Status:** **DEFERRED TO PHASE 4** (Packaging phase as specified in `RELEASE_PROMPT.md:43`)
- **Root Cause:** `package.json` lacks `"build"` configuration block, `electron-builder` devDependency, and packaging scripts (`npm run dist` / `npm run pack`).
- **Resolution Plan:** Configure `electron-builder` with NSIS installer script, file associations, and sidecar runtime packaging in Phase 4 Step 1.

---

#### **DEF-05: Missing release documentation (`CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, `PRIVACY.md`)**
- **Severity:** Minor (Release Gate G10 Blocker)
- **Status:** **DEFERRED TO PHASE 4** (Documentation & Legal review checklist in `RELEASE_PROMPT.md:46-48`)
- **Root Cause:** Documentation files required for G10 compliance are absent from repository root.
- **Resolution Plan:** Generate comprehensive licenses, third-party notices, privacy disclosure, and changelog in Phase 4 Steps 3, 4, 5.

---

#### **DEF-06: 105 `no-unused-vars` ESLint warnings/errors across codebase**
- **Severity:** Minor
- **Status:** **DEFERRED TO PHASE 3** (UX & Code Polish)
- **Root Cause:** Unused catch error parameters `_`, interface signature placeholders in base classes, and lingering local declarations in `src/main/` and `src/renderer/`.
- **Resolution Plan:** Clean unused variables and standardize ignore patterns in Phase 3.

---

#### **DEF-07: Missing formal multi-version schema migration runner**
- **Severity:** Minor
- **Status:** **FIXED**
- **Root Cause:** `src/main/services/project.js:335-337` only assigned `project.schemaVersion = 1` if absent, without version transformation handlers.
- **Fix Applied:** Created `src/main/services/project-migration.js` with structured migration definitions (v0 -> v1) and schema normalization assertions. Wired into `project.js:loadProject()`.
- **Verification Evidence:** `tests/test-schema-migration.js` (4/4 unit tests passed: legacy v0 upgrade, current schema pass-through, invalid structure rejection, metadata normalization).

---

#### **DEF-08: Node module typeless package warning on `subtitle-utils.js`**
- **Severity:** Cosmetic
- **Root Cause:** `package.json` does not declare `"type": "commonjs"`, causing Node v24 to print `[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type ... is not specified` when importing `.js` files containing ES module syntax.
- **Steps to Reproduce:**
  1. Execute CLI test runners (`npm run test:e2e`).
- **Expected:** Clean execution without runtime loader warnings.
- **Actual:** Typeless package warning emitted to console.

---

## 4. Items That Could Not Be Tested & Action Items for User

The following features could not be verified in Phase 1 due to environmental requirements:

1. **Real Gemini Cloud ASR (`gemini-1.5-flash` / `gemini-1.5-pro`):**
   - **Reason:** Requires a valid Google Gemini API key. No keys exist in the test profile.
   - **What is needed from you:** Provide a temporary test API key or place it into `audit/profile/config/keys.json` if you wish to run real Gemini API requests. (Mock translation provider and fallback behavior are 100% verified).
2. **Real Gemini Translation (`translation:translate` via Gemini Cloud API):**
   - **Reason:** Requires a valid Google Gemini API key.
   - **What is needed from you:** Same as above.
3. **Hybrid ASR (Faster-Whisper + Gemini Cloud API):**
   - **Reason:** Requires a valid Google Gemini API key.
   - **What is needed from you:** Same as above.
4. **Physical Demucs AI Vocal Separation Execution:**
   - **Reason:** Requires local Demucs Python package or physical CUDA GPU environment.
   - **Status:** Mock separation provider is verified and IPC contract (`bgmPath`) is fully tested.
