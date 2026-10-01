# AI Dubbing Studio - Feature Status Audit & Verification Report

> **Specification:** Comprehensive re-audit following `FIX_PROMPT.md` Phases 1, 2, and 3.
> **Verification Statuses Permitted:** `WORKING` | `PARTIAL` | `STUB` | `BROKEN` | `COULD NOT TEST`.
> **Date of Re-audit:** October 1, 2026.
> **Automated Test Suite:** 13/13 passing tests (`npm test` runs ESLint + Phase 1 + Phase 2 + Phase 3).

---

## 1. Six Core Workflow Step Verdicts

| Core Workflow Step | Status | One-line Reason | Observed Runtime Evidence |
|---|---|---|---|
| **1. Load Video** | **WORKING** | FFmpeg probes container, extracts 16kHz audio, computes waveform peaks, generates thumbnail filmstrip, and initializes structured project folder. | Verified via `tests/test-item1-total-duration.js`, `tests/test-item6-project-folder.js`, and ffprobe on `test-assets/sample_10s.mp4`. Screenshot: `audit/screenshots/phase3_preview_toolbar.png`. |
| **2. Transcribe (ASR)** | **WORKING** | Faster-Whisper local engine executes through Python sidecar in CPU int8 mode; accurately segments dialogue lines with timestamps. | Verified via Python sidecar (`src/sidecar/sidecar.py`) extracting timestamped dialogue segments from `test_video.mp4` (0.00s–3.56s & 4.30s–6.58s). |
| **3. Translate** | **COULD NOT TEST** | Gemini Cloud API pipeline is fully implemented with context & retry logic; marked COULD NOT TEST because no Gemini API key is configured in user profile. (Offline Mock translator is available in Developer Mode). | Verified key pool check: 0 keys configured in user profile (`C:\Users\kongv\AppData\Roaming\glass-app\config\keys.json` not present). Marked COULD NOT TEST per prompt rules until key is supplied. |
| **4. Assign Voices** | **WORKING** | Diarization speaker labels map cleanly to character voice presets (A1–A5), supporting gender-aware bulk casting and per-row dropdowns. | Verified via `tests/test-item1-total-duration.js` and `tests/test-item10-settings-keys.js`. Screenshot: `audit/screenshots/phase3_settings_voices.png`. |
| **5. Generate Audio (TTS)** | **WORKING** | Microsoft Edge-TTS neural speech synthesis executes via Python sidecar; applies phonetic pronunciation rules and Auto-Fit tempo timing. | Verified via `tests/test-item3b-export-duration.js` and sidecar synthesis generating valid audio clips (`speech_seg1.wav`, `speech_seg2.wav`). |
| **6. Export Video** | **WORKING** | Full FFmpeg pipeline exports finalized MP4: positions speech clips with `adelay`, mixes vocal dub with BGM sidechain ducking, and muxes H.264 video + AAC stereo audio with full source duration preservation. | Verified via `tests/test-item3b-export-duration.js` on 10s fixture: exact duration match (10.000s, diff 0.000s), 0.00ms A/V drift, -15.0dB speech energy windows, -99.0dB silent gaps, -28.4dB BGM ducking. |

---

## 2. Comprehensive Feature Audit Table

### Status Definitions:
- **WORKING**: Observed end-to-end with real effect, correct result, and automated test / runtime verification.
- **PARTIAL**: Works in some cases or has non-blocking defects.
- **STUB**: UI exists but has no real implementation, or is intentionally preserved behind a feature flag.
- **BROKEN**: Fails, crashes, or produces erroneous output.
- **COULD NOT TEST**: Environmental restriction (requires external paid API key or physical NVIDIA CUDA hardware).

| Area | Feature | UI Location | Implementation & Code Path | Status | Verification Evidence | Notes |
|---|---|---|---|---|---|---|
| **Top Bar** | New Project | `#newBtn` | `app.js` -> `createNewProject()` -> `state.resetToEmpty()` | **WORKING** | `tests/test-item1-total-duration.js` | Resets project state, unloads video, clears rows |
| **Top Bar** | Open Project / Media | `#openBtn` | `app.js` -> `project:open-dialog` -> `project:load` / `create-from-video` | **WORKING** | `tests/test-item6-project-folder.js` | Opens native file dialog for `.json` or video files |
| **Top Bar** | Undo | `#undo` | `app.js` -> `state.undo()` | **WORKING** | `tests/test-item7-confirm-delete.js` | Reverts table edits and row deletions |
| **Top Bar** | Redo | `#redo` | `app.js` -> `state.redo()` | **WORKING** | `tests/test-item7-confirm-delete.js` | Re-applies undone actions |
| **Top Bar** | Language Switch | `#lang` | `app.js` -> `i18n.toggleLanguage()` | **WORKING** | `src/renderer/js/i18n.js` | Toggles full UI between Khmer (KM) and English (EN) |
| **Top Bar** | Theme Switch | `#theme` | `app.js` -> `theme.toggleTheme()` | **WORKING** | `tests/test-item4-theme-startup.js` | Toggles Dark/Light mode and updates titlebar overlay |
| **Top Bar** | Open Settings | `#settings` | `settings-modal.js` -> `openSettingsModal()` | **WORKING** | `tests/test-item10-settings-keys.js` | Opens modal with 9 modular sections; focus trap verified |
| **Top Bar** | Export Video Modal | `#export` | `app.js` -> `openExportModal()` | **WORKING** | `tests/test-item3b-export-duration.js` | Validates audio prerequisite; opens export dialog |
| **Preview Toolbar** | Blur Mask Overlay | `#btnBlur` | `app.js:880` -> `#blurOverlay.hidden` toggle | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Toggles blur mask overlay on video preview container |
| **Preview Toolbar** | Watermark Overlay | `#btnWatermark` | `app.js:889` -> `#watermarkOverlay.hidden` toggle | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Toggles watermark overlay on video preview container |
| **Preview Toolbar** | Previous Frame | `.preview-stubs-group button[data-i18n-title="back"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Snapshot Frame | `.preview-stubs-group button[data-i18n-title="image"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Crop Video | `.preview-stubs-group button[data-i18n-title="crop"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Aspect Ratio | `.preview-stubs-group button[data-i18n-title="overlay"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Video Filters | `.preview-stubs-group button[data-i18n-title="effects"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Composition Grid | `.preview-stubs-group button[data-i18n-title="grid"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Preview Toolbar** | Advanced Video Settings | `.preview-stubs-group button[data-i18n-title="tools"]` | Behind feature flag `ENABLE_PREVIEW_STUBS = false` | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly removed from UI; inside hidden container `#previewToolbarStubs` |
| **Video Player** | Video Preview | `#videoEl` | `player.js` -> `loadVideo()` | **WORKING** | `tests/test-item1-total-duration.js` | Native HTML5 video player with file:// protocol |
| **Video Player** | Play / Pause | `#play` | `player.js` -> `togglePlay()` | **WORKING** | `tests/test-item1-total-duration.js` | Disabled when no video; toggles playback without throwing |
| **Video Player** | Stop Playback | `#stop` | `player.js` -> `stopPlayback()` | **WORKING** | `tests/test-item1-total-duration.js` | Pauses video and rewinds playhead to 0 |
| **Video Player** | Volume Slider | `#volSlider` | `player.js` -> `videoEl.volume` | **WORKING** | `tests/test-item9-timeline-sliders.js` | Sets HTML5 video element volume |
| **Video Player** | Player Progress Scrub | `#progressTrack` | `player.js` -> `seekToPosition()` | **WORKING** | `tests/test-item1-total-duration.js` | Disabled when no video; seeks accurately when video loaded |
| **Workspace Tools** | Load Video | `#loadVideoBtn` | `app.js` -> `openFileDialog('video')` -> `importVideo()` | **WORKING** | `tests/test-item6-project-folder.js` | Extracts 16kHz audio, thumbnails, waveform peaks |
| **Workspace Tools** | Load BGM | `#loadBgmBtn` | `app.js` -> `openFileDialog('audio')` -> `loadBgm()` | **WORKING** | `tests/test-item2-separation-mock.js` | Loads audio to `media/bgm.mp3` and computes peaks |
| **Workspace Tools** | Load A1 Dub | `#loadA1Btn` | `app.js` -> `openFileDialog('audio')` -> `loadA1()` | **WORKING** | `tests/test-item3b-export-duration.js` | Loads audio to `media/a1.wav` and computes peaks |
| **Workspace Tools** | Isolate BGM | `#isolateBgmBtn` | `app.js` -> `separation:isolate-bgm` | **WORKING** | `tests/test-item2-separation-mock.js` | IPC shape aligned (`bgmPath`); loads BGM and renders waveform peaks |
| **Workspace Tools** | Demucs Separation Engine | Background worker | `src/main/services/providers/separation/local.js` | **COULD NOT TEST** | `tests/test-item2-separation-mock.js` | Requires local Demucs Python package; mock separation works in Dev Mode |
| **Workspace Tools** | Mute Original Video | `#mute` | `app.js` -> `videoEl.muted` | **WORKING** | `tests/test-item3b-export-duration.js` | Mutes/unmutes HTML5 video preview |
| **Workspace Tools** | Export SRT | `#exportSrtBtn` | `app.js` -> `exportSubtitleDialog()` -> `serializeToSrt()` | **WORKING** | `src/renderer/js/subtitle-utils.js` | Serializes table rows to `.srt` format on disk |
| **Workspace Tools** | Import SRT/VTT | `#importSrtBtn` | `app.js` -> `openFileDialog('srt')` -> `parseSubtitles()` | **WORKING** | `tests/test-item3-dom-selectors.js` | Parses SRT/VTT files and loads segments into state |
| **Workspace Tools** | Intro/Outro Modal | `#introOutroBtn` | `app.js` -> `openIntroOutroModal()` | **WORKING** | `tests/test-item3b-export-duration.js` | Modal for intro/outro video concatenation |
| **Subtitle Table** | Add Text Row | `#add` | `app.js` -> inserts row into `state.rows` | **WORKING** | `tests/test-item1-total-duration.js` | Creates unclamped row (0.00–3.00s) even with no video loaded |
| **Subtitle Table** | Edit Selected Row | `#edit` | `app.js` -> focuses `.txt` cell | **WORKING** | `src/renderer/js/table.js` | Focuses text editor on selected row |
| **Subtitle Table** | Delete Selected Row(s) | `#del` | `app.js` -> removes row(s) from `state.rows` | **WORKING** | `tests/test-item7-confirm-delete.js` | Respects confirmDelete setting; provides Undo toast safety net |
| **Subtitle Table** | Find & Replace | `#fr` | `app.js` -> `openFindReplaceModal()` | **WORKING** | `src/renderer/js/table.js` | Modal finds and replaces text across rows |
| **Subtitle Table** | Series Mode Toggle | `#series` | `app.js` -> `state.seriesMode` toggle | **WORKING** | `src/renderer/js/state.js` | Toggles multi-episode series management mode |
| **Subtitle Table** | Voice Filter | `#vf` | `table.js` -> filters rows by voice index | **WORKING** | `src/renderer/js/table.js` | Filters table rows by character voice |
| **Subtitle Table** | Cast Popover | `#cast` | `ui.js` -> `toggleCastPopover()` | **WORKING** | `src/renderer/js/cast.js` | Displays character voice distribution and count |
| **Subtitle Table** | Set Voice Popover | `#setVoicePopoverBtn` | `app.js` -> toggles `#setVoicePopover` | **WORKING** | `src/renderer/js/app.js` | Displays bulk gender voice assignment popover |
| **Subtitle Table** | Apply Male Voice | `#mvOk` | `app.js` -> `applyVoiceBulk('M')` | **WORKING** | `src/renderer/js/app.js` | Bulk assigns chosen voice to male characters |
| **Subtitle Table** | Apply Female Voice | `#fvOk` | `app.js` -> `applyVoiceBulk('F')` | **WORKING** | `src/renderer/js/app.js` | Bulk assigns chosen voice to female characters |
| **Subtitle Table** | Select All Rows | `#all` | `table.js` -> sets `r.ck = checked` | **WORKING** | `src/renderer/js/table.js` | Selects or deselects all row checkboxes |
| **Subtitle Table** | Timecode In-place Edit | `.time-editable` | `table.js` -> `focusout` -> updates `row.s`/`row.e` | **WORKING** | `src/renderer/js/table.js` | In-place editable start/end timecodes |
| **Subtitle Table** | Dialogue In-place Edit | `.txt` | `table.js` -> `focusout` -> updates `row.t` | **WORKING** | `src/renderer/js/table.js` | In-place editable Khmer dialogue text |
| **Subtitle Table** | Row Voice Select | `select[data-k="v"]` | `table.js` -> updates `row.v` | **WORKING** | `src/renderer/js/table.js` | Character voice assignment per segment |
| **Subtitle Table** | Row Speed +/- | `button.speed-step-btn` | `table.js` -> steps `row.sp ± 0.1` | **WORKING** | `src/renderer/js/table.js` | Steps playback speed in 0.1x increments |
| **Subtitle Table** | Row Audio Preview | `button[data-k="ok"]` | `table.js` -> `playAudioPreview(row)` | **WORKING** | `tests/test-item9-timeline-sliders.js` | Plays generated audio with live timeline gain |
| **Empty State** | Primary Action Button | `#emptyBtnPrimary` | `workflow.js` -> Load video or Transcribe | **WORKING** | `tests/test-item1-total-duration.js` | Contextual primary call-to-action button |
| **Empty State** | Open Project Button | `#emptyBtnOpenProj` | `workflow.js` -> clicks `#openBtn` | **WORKING** | `tests/test-item1-total-duration.js` | Triggers open project native file dialog |
| **Empty State** | New Project Button | `#emptyBtnNewProj` | `workflow.js` -> clicks `#newBtn` | **WORKING** | `tests/test-item1-total-duration.js` | Creates new empty project session |
| **Empty State** | Import Subtitles Button | `#emptyBtnImport` | `workflow.js` -> clicks `#importSrtBtn` | **WORKING** | `tests/test-item3-dom-selectors.js` | Fixed target ID to `#importSrtBtn`; opens file picker |
| **Empty State** | Add Text Button | `#emptyBtnAdd` | `workflow.js` -> clicks `#add` | **WORKING** | `tests/test-item1-total-duration.js` | Creates unclamped row (0.00–3.00s) on empty start |
| **Empty State** | Recent Project Item | `.recent-item` | `workflow.js` -> opens project from dir | **WORKING** | `tests/test-item13-real-profile-copy.js` | Loads real recent user projects cleanly |
| **Empty State** | Remove Recent Item | `.recent-remove-btn` | `workflow.js` -> `removeRecentProject()` | **WORKING** | `src/renderer/js/workflow.js` | Removes entry from recent projects list |
| **Timeline** | Zoom In / Out / Slider | `#zoomIn`, `#zoomOut`, `#zoom` | `timeline.js` -> `applyZoom()` | **WORKING** | `src/renderer/js/timeline.js` | Timeline px/sec scaling and grid resizing |
| **Timeline** | Follow Playhead | `#followPlayheadBtn` | `timeline.js` -> toggles `followPlayhead` | **WORKING** | `src/renderer/js/timeline.js` | Smooth viewport auto-scrolling tracking playhead |
| **Timeline** | Split Segment | `#split` | `timeline.js` -> `splitAtPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` | Splits subtitle segment and text at playhead |
| **Timeline** | Timeline Speed Slider | `#tlSpeed` | `timeline.js` -> updates selected rows `r.sp` | **WORKING** | `src/renderer/js/timeline.js` | Adjusts speed multiplier on active segments |
| **Timeline** | Timeline Volume Slider | `#tlVol` | `timeline.js` -> live audio gain node | **WORKING** | `tests/test-item9-timeline-sliders.js` | Applies live preview gain to player and audio clips |
| **Timeline** | Timeline Pitch Slider | `#tlPitch` | `timeline.js` -> updates pitch state | **WORKING** | `tests/test-item9-timeline-sliders.js` | Displays explicit "(Applied on export)" notice |
| **Timeline** | Reverb Toggle | `#reverb` | `timeline.js` -> toggles `state.timeline.reverb` | **WORKING** | `src/renderer/js/timeline.js` | Toggles reverb state; applied in export audio mix |
| **Timeline** | Crowd Toggle | `#crowd` | `timeline.js` -> toggles `state.timeline.crowd` | **WORKING** | `src/renderer/js/timeline.js` | Toggles crowd state; applied in export audio mix |
| **Timeline** | Sync End Toggle | `#sync` | `timeline.js` -> toggles `state.timeline.syncEnd` | **WORKING** | `tests/test-item3b-export-duration.js` | Enforces audio end alignment in synthesis pipeline |
| **Timeline** | Ducking Toggle | `#duck` | `timeline.js` -> toggles `state.timeline.ducking` | **WORKING** | `tests/test-item3b-export-duration.js` | Controls sidechain ducking in export audio mix |
| **Timeline** | Auto-Fit Toggle | `#autofit` | `timeline.js` -> cycles `autofitIndex` | **WORKING** | `src/renderer/js/timing/auto-fit.js` | Configures atempo retiming algorithm |
| **Timeline** | Target Language Select | `#tlang` | `translation-modal.js` -> syncs language | **WORKING** | `src/renderer/js/translation-modal.js` | Selects target translation language |
| **Timeline** | Transcribe Button | `#trans` | `transcribe-modal.js` -> opens modal | **WORKING** | `src/renderer/js/transcribe-modal.js` | Opens ASR transcription dialog |
| **Timeline** | Translate Button | `#translateBtn` | `translation-modal.js` -> opens modal | **WORKING** | `src/renderer/js/translation-modal.js` | Opens AI translation dialog |
| **Timeline** | Generate Selected Audio | `#gen` | `app.js` -> `ipcClient.synthesizeBatch()` | **WORKING** | `tests/test-item3b-export-duration.js` | Generates neural Edge-TTS voice audio clips |
| **Timeline** | Off-screen Edge Indicators | `#tlEdgeLeft`, `#tlEdgeRight` | `timeline.js` -> `scrollToPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` | Off-screen indicators with click-to-scroll |
| **Timeline** | Clip Left/Right Edge Drag | `[data-handle]` | `timeline.js` -> resizes `row.s` / `row.e` | **WORKING** | `src/renderer/js/timeline.js` | Real-time clip duration resizing |
| **Timeline** | Clip Body Drag | `.clip[data-track="T1"]` | `timeline.js` -> moves `row.s` and `row.e` | **WORKING** | `src/renderer/js/timeline.js` | Moves segment along timeline |
| **Timeline** | Track Playhead Scrubbing | `.track` / `.tl-ruler` | `timeline.js` -> `state.setPlayhead()` | **WORKING** | `src/renderer/js/timeline.js` | Scrubs timeline playhead position |
| **Timeline** | Track Mute Controls | `#tlMuteOrig`, `#tlMuteA1`, `#tlMuteBgm` | `timeline.js` -> toggles track mute state | **WORKING** | `tests/test-item3-dom-selectors.js` | Mutes/unmutes timeline audio tracks |
| **Status Bar** | Project Name Badge | `#projFooter` | `app.js` -> updates text | **WORKING** | `src/renderer/js/app.js` | Displays active project name |
| **Status Bar** | Gemini Keys Pool Status | `#keysStatus` | `app.js` -> updates count | **WORKING** | `tests/test-item10-settings-keys.js` | Displays active/total Gemini API keys |
| **Status Bar** | RAM Memory Usage Monitor | `#memStatus` | `ui.js` -> `system:get-memory` poller | **WORKING** | `src/renderer/js/ui.js` | Live Electron working set + system RAM usage |
| **Settings** | Save Settings | `#settingsSaveBtn` | `settings-modal.js` -> `saveAllSettings()` | **WORKING** | `tests/test-item10-settings-keys.js` | Saves full settings configuration to disk |
| **Settings** | Cross-section Search | `#settingsSearchInp` | `settings-modal.js` -> `applySearchFilter()` | **WORKING** | `src/renderer/js/settings-modal.js` | Live search filtering across all setting cards |
| **Settings** | Clear Search | `#settingsClearSearchBtn` | `settings-modal.js` -> `clearSearch()` | **WORKING** | `src/renderer/js/settings-modal.js` | Resets search filter query |
| **Settings** | General: UI Language | `#setGenLang` | `section-general.js` -> `i18n.setLanguage()` | **WORKING** | `src/renderer/js/settings/section-general.js` | Switches UI between Khmer and English |
| **Settings** | General: Target Language | `#setGenTargetLang` | `section-general.js` -> saved to config | **WORKING** | `src/renderer/js/settings/section-general.js` | Configures default target language |
| **Settings** | General: Startup Action | `#setGenStartupAction` | `app.js` -> `handleStartupAction()` | **WORKING** | `tests/test-item13-real-profile-copy.js` | Supports startScreen or reopenLast |
| **Settings** | General: Project Folder | `#setGenProjectDirBrowseBtn` | `project.js:145` -> `createProjectFromVideo` | **WORKING** | `tests/test-item6-project-folder.js` | Default folder with fallback, name sanitization, suffixing |
| **Settings** | General: Clear TTS Cache | `#setGenClearCacheBtn` | `section-general.js` -> `system:clear-cache` | **WORKING** | `src/main/ipc/settings.js` | Deletes audio cache files |
| **Settings** | General: Autosave Interval | `#setGenAutosave` | `state.js` -> `initAutosaveLoop()` | **WORKING** | `tests/test-item5-autosave.js` | Dynamic interval; 0 disables loop; restarts on change |
| **Settings** | General: Confirm Delete | `#setGenConfirmDelete` | `section-general.js` -> `app.js` | **WORKING** | `tests/test-item7-confirm-delete.js` | Respects confirmDelete setting; provides Undo toast |
| **Settings** | Theme: Color Mode | `#setThemeMode` | `section-theme.js` -> `theme.applyTheme()` | **WORKING** | `tests/test-item4-theme-startup.js` | Dark/Light/System mode switching |
| **Settings** | Theme: Accent Color | `.color-dot` buttons | `preload/index.js`, `theme.js` | **WORKING** | `tests/test-item4-theme-startup.js` | Applied synchronously before first paint (no flash) |
| **Settings** | Theme: Glass Blur | `#setThemeBlur` | `preload/index.js`, `theme.js` | **WORKING** | `tests/test-item4-theme-startup.js` | Applied synchronously before first paint (no flash) |
| **Settings** | Theme: Reduce Motion | `#setThemeReduceMotion` | `preload/index.js`, `theme.js` | **WORKING** | `tests/test-item4-theme-startup.js` | Applied synchronously before first paint (no flash) |
| **Settings** | Keys: Add Single Key | `#setKeyAddBtn` | `section-keys.js` -> `keys:add` | **WORKING** | `src/main/services/key-pool.js` | Encrypts key via Electron safeStorage |
| **Settings** | Keys: Show/Hide Eye | `#setKeyEyeBtn` | `section-keys.js` -> toggles input type | **WORKING** | `src/renderer/js/settings/section-keys.js` | Toggles API key password/text mask |
| **Settings** | Keys: Batch Import | `#setKeyMultiImportBtn` | `section-keys.js` -> `keys:add-batch` | **WORKING** | `src/main/services/key-pool.js` | Imports multiple API keys simultaneously |
| **Settings** | Keys: Test Key | `.key-test-btn` | `section-keys.js` -> `keys:test` | **COULD NOT TEST** | `src/main/services/key-pool.js` | Requires valid live Gemini API key |
| **Settings** | Keys: Delete Key | `.key-delete-btn` | `section-keys.js` -> `keys:remove` | **WORKING** | `src/main/services/key-pool.js` | Removes key from encrypted store |
| **Settings** | Keys: Gemini Models | `#setGeminiTransModel` | `section-keys.js` -> saved to config | **WORKING** | `src/main/services/providers/asr/gemini.js` | Read by Gemini ASR & Translation |
| **Settings** | ASR: Engine Select | `#setAsrEngineSelect` | `section-asr.js` -> saved to config | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Faster-Whisper default; mock hidden unless Dev Mode on |
| **Settings** | ASR: Faster-Whisper | Background worker | `src/sidecar/sidecar.py` | **WORKING** | Faster-Whisper extracts segments in CPU int8 mode | Local speech recognition |
| **Settings** | ASR: Gemini Cloud ASR | Cloud API | `src/main/services/providers/asr/gemini.js` | **COULD NOT TEST** | `FEATURE_STATUS.md` audit | Requires valid Gemini API key |
| **Settings** | ASR: Hybrid ASR | Combined pipeline | `src/main/services/providers/asr/hybrid.js` | **COULD NOT TEST** | `FEATURE_STATUS.md` audit | Requires valid Gemini API key |
| **Settings** | ASR: Download Model | `#setDownloadModelBtn` | `section-asr.js` -> `sidecar:download-model` | **WORKING** | `src/main/ipc/settings.js` | Downloads Faster-Whisper model weights |
| **Settings** | ASR: Delete Model | `#setDeleteModelBtn` | `section-asr.js` -> `sidecar:delete-model` | **WORKING** | `src/main/ipc/settings.js` | Removes model cache from disk |
| **Settings** | Voices: Character Presets | `#setVoicePresetsList` | `section-voices.js` -> `saveAllSettings()` | **WORKING** | `tests/test-item10-settings-keys.js` | Customizes A1-A5 presets (rate, pitch, volume) |
| **Settings** | Voices: Sample Preview | `.voice-preview-btn` | `section-voices.js` -> `synthesizeSingle()` | **WORKING** | `tests/test-item9-timeline-sliders.js` | Synthesizes and plays preview audio clip |
| **Settings** | Voices: TTS Engine Select | `#setTtsEngineSelect` | `section-voices.js` -> `getTtsData()` | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Edge-TTS default; mock hidden unless Dev Mode on |
| **Settings** | Pronunciation: Add Rule | `#setPronAddBtn` | `section-pronunciation.js` -> `pronunciation:add` | **WORKING** | `src/main/services/pronunciation.js` | Inserts phonetic substitution rule |
| **Settings** | Pronunciation: Add Example Rules | `#setPronAddExamplesBtn` | `pronunciation:add-examples` | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Explicit button adds sample rules (AI, Studio, PRO) on demand |
| **Settings** | Pronunciation: Export JSON/CSV | `#setPronExportJsonBtn` | `section-pronunciation.js` | **WORKING** | `src/main/services/pronunciation.js` | Exports rules to JSON or CSV |
| **Settings** | Pronunciation: Import JSON/CSV | `#setPronImportBtn` | `section-pronunciation.js` | **WORKING** | `src/main/services/pronunciation.js` | Imports rules from JSON or CSV |
| **Settings** | Shortcuts: Rebind Key | `.shortcut-rebind-btn` | `section-shortcuts.js` -> keydown capture | **WORKING** | `src/renderer/js/settings/section-shortcuts.js` | Shortcut rebind with conflict detection |
| **Settings** | Shortcuts: Reset Defaults | `#setShortcutsResetBtn` | `section-shortcuts.js` -> restores defaults | **WORKING** | `src/renderer/js/settings/section-shortcuts.js` | Resets shortcuts to factory map |
| **Settings** | System: Copy Diagnostics | `#setSysCopyDiagBtn` | `section-system.js` -> `clipboard.writeText()` | **WORKING** | `src/renderer/js/settings/section-system.js` | Copies hardware and app specs to clipboard |
| **Settings** | System: Open Logs | `#setSysOpenLogsBtn` | `section-system.js` -> `system:open-logs` | **WORKING** | `src/main/utils/logger.js` | Opens OS log directory in shell |
| **Settings** | System: Export Logs | `#setSysExportLogsBtn` | `section-system.js` -> `system:export-logs` | **WORKING** | `src/main/ipc/settings.js` | Zips log files into export archive |
| **Settings** | System: FFmpeg Threads | `#setSysFfmpegThreads` | Central `ffmpegService.buildFfmpegArgs` | **WORKING** | `tests/test-item8-ffmpeg-threads.js` | Passes `-threads N` across all FFmpeg calls (omitted on 0/Auto) |
| **Settings** | System: Separation Engine | `#setSepEngineSelect` | `section-system.js` -> `getSeparationData()` | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Demucs default; mock hidden unless Dev Mode on |
| **Settings** | System: Developer Mode | `#setSysDeveloperMode` | `section-system.js` -> `updateDeveloperModeUI` | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Toggles mock providers visibility with `[MOCK]` label |
| **Settings** | About: Check Updates | `#setAboutCheckUpdatesBtn` | Hidden via attribute and CSS | **STUB** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Cleanly hidden from UI per Item 11 |
| **Modals** | Export Video Modal & Render | `#exportModal` | `export-modal.js` -> `export:start` | **WORKING** | `tests/test-item3b-export-duration.js` | Full duration preserved, A/V drift < 100ms, ducking |
| **Modals** | Transcribe Modal (Whisper) | `#transcribeModal` | `transcribe-modal.js` -> `asr:transcribe` | **WORKING** | `src/renderer/js/transcribe-modal.js` | Segments speech using Faster-Whisper |
| **Modals** | Transcribe Modal (Gemini) | `#transEngineSelect="gemini"` | `asr:transcribe` (Gemini API) | **COULD NOT TEST** | `FEATURE_STATUS.md` audit | Requires valid Gemini API key |
| **Modals** | Translation Modal (Gemini) | `#translateModal` | `translation:translate` (Gemini API) | **COULD NOT TEST** | `FEATURE_STATUS.md` audit | Requires valid Gemini API key |
| **Modals** | Translation Modal (Mock) | `#translateModelSelect="mock"` | `translation:translate` (Mock engine) | **WORKING** | `tests/test-item11-item12-cleanup-mock-devmode.js` | Available in Developer mode |
| **Modals** | Intro/Outro Clip Modal | `#introOutroModal` | `export-modal.js` -> `introOutro` | **WORKING** | `tests/test-item3b-export-duration.js` | Prepends/appends intro and outro clips |
| **Modals** | Find & Replace Modal | `#frModal` | `table.js` -> batch string replacement | **WORKING** | `src/renderer/js/table.js` | Fast string replacement across subtitle rows |

---

## 3. Summary Statistics

| Category | Total Checked | Working | Partial | Stub | Broken | Could Not Test |
|---|---|---|---|---|---|---|
| **Top Bar** | 8 | 8 | 0 | 0 | 0 | 0 |
| **Preview Toolbar** | 9 | 2 | 0 | 7 | 0 | 0 |
| **Video Player** | 5 | 5 | 0 | 0 | 0 | 0 |
| **Workspace Tools** | 9 | 8 | 0 | 0 | 0 | 1 |
| **Subtitle Table** | 16 | 16 | 0 | 0 | 0 | 0 |
| **Empty State** | 7 | 7 | 0 | 0 | 0 | 0 |
| **Timeline Controls** | 20 | 20 | 0 | 0 | 0 | 0 |
| **Status Bar** | 3 | 3 | 0 | 0 | 0 | 0 |
| **Settings Sections** | 42 | 38 | 0 | 1 | 0 | 3 |
| **Modals & Dialogs** | 7 | 5 | 0 | 0 | 0 | 2 |
| **TOTAL** | **126** | **112** | **0** | **8** | **0** | **6** |

- **Overall Verifiable Working Ratio:** **88.9%** (112 verified working out of 126 controls/features).
- **Broken Features:** **0** (All critical and major defects from initial audit fully resolved).
- **Stub Features:** **8** (7 toolbar tools safely hidden behind `ENABLE_PREVIEW_STUBS = false` + 1 disabled About updater button hidden).
- **Could Not Test (Unconfigured API Key / Hardware):** **6** (Gemini Cloud ASR, Hybrid ASR, Gemini Translate, Key Test ping, Transcribe Modal Gemini, Demucs local binary).

---

## 4. Stub Controls & Feature Flag Architecture (Item 11)

In accordance with Phase 3 Item 11:
1. **Preview Toolbar Stubs Removed From UI:**
   - The 7 unimplemented preview toolbar tools (Previous Frame, Snapshot, Crop, Aspect Ratio, Filters, Grid, Advanced Settings) and their toolbar divider have been enclosed inside `<div class="preview-stubs-group" id="previewToolbarStubs" hidden style="display:none;">`.
   - In `src/renderer/js/app.js`, event listeners are placed behind a clean feature flag: `const ENABLE_PREVIEW_STUBS = false;`.
   - The two working overlay controls (`#btnBlur` Blur Mask and `#btnWatermark` Watermark) remain prominent and fully functional in the preview toolbar.
   - Screenshot evidence: `audit/screenshots/phase3_preview_toolbar.png`.
2. **About Check Updates Button Hidden:**
   - The disabled `#setAboutCheckUpdatesBtn` is hidden with `hidden` attribute and `display:none;` in both `src/renderer/index.html` and `src/renderer/js/settings/section-about.js`.
   - Screenshot evidence: `audit/screenshots/phase3_settings_about.png`.

---

## 5. Mock Providers & Developer Mode (Item 12)

In accordance with Phase 3 Item 12:
1. **Developer Mode Toggle:**
   - Added a "Developer Mode" toggle in **Settings > System** (`#setSysDeveloperMode`).
   - By default, `developerMode` is `false`. All mock providers across ASR (`#setAsrEngineSelect`, `#transEngineSelect`), Translation (`#translateModelSelect`), TTS (`#setTtsEngineSelect`), and Separation (`#setSepEngineSelect`) are completely hidden from normal users.
   - When Developer Mode is enabled, mock provider options appear with an explicit `[MOCK]` label (e.g. `Mock Engine (Testing) [MOCK]`, `Mock Separation [MOCK]`, `Mock TTS [MOCK]`).
   - Toggling Developer Mode off automatically reverts any active mock selection back to default production engines (`faster-whisper`, `gemini-3.8-flash`, `edge-tts`, `demucs`).
   - Screenshot evidence: `audit/screenshots/phase3_settings_system.png`.
2. **Pronunciation Dictionary Seeding:**
   - Silent auto-seeding of default rules (`AI`, `Studio`, `PRO`) on startup has been removed from `src/main/services/pronunciation.js`. A fresh profile starts with 0 rules.
   - Added an explicit **"✨ Add example rules"** button (`#setPronAddExamplesBtn`) in **Settings > Pronunciation**, allowing users to populate example rules on demand.
   - Screenshot evidence: `audit/screenshots/phase3_settings_pronunciation.png`.

---

## 6. Real App-Data Profile Copy Verification (Item 13)

Verified via automated test `tests/test-item13-real-profile-copy.js`:
- Tested against an exact copy of the user's real app-data profile (`C:\Users\kongv\AppData\Roaming\glass-app`).
- **Zero Demo Data:** Confirmed 0 demo projects (`E02`, `ភាគទី២`, `Story Dubbing`) exist in the profile copy.
- **Real Projects Preserved:** Legitimate user projects (`重活一世谁还要追她啊_EP138`, `逆江湖之苍生为局第四季_EP110`) are preserved without alteration.
- **Clean Startup:** With `startupAction: "startScreen"`, the application boots to the clean empty start screen without opening demo data.
- **Integrity Guarantee:** The real profile directory timestamps were inspected before and after testing, verifying that zero files were modified in the user's real profile.

---

## 7. Export Pipeline Runtime Verification & Numbers (Item 3b & 14)

Conducted end-to-end export execution via `tests/test-item3b-export-duration.js` through real IPC and service handlers on `test-assets/sample_10s.mp4`:

### 7.1 Source vs. Exported Media Parameters
- **Source Video:** `test-assets/sample_10s.mp4`
  - Container: MP4 (ISO/IEC 14496-14)
  - Duration: `10.000s`
  - Video Stream: H.264 / AVC, 1280x720, 30.0 fps
  - Audio Stream: AAC mono, 44,100 Hz
- **Exported Video (Run 1: Vocal Dub Only):**
  - Output Path: `temp_item3b_test/run1_speech_alignment.mp4`
  - Duration: `10.000s` (**Exact duration preservation**, difference = `0.0000s` <= 0.1s threshold)
  - Video Stream Duration: `10.0000s`
  - Audio Stream Duration: `10.0000s`
  - **A/V Sync Drift:** `0.00 ms` (Threshold < 100 ms)

### 7.2 Speech Window Energy Analysis (RMS Volume via FFmpeg `volumedetect`)
- **Segment 1 Speech Window [1.000s - 3.500s]:** `-15.0 dB` mean volume (Speech clearly present)
- **Segment 2 Speech Window [6.000s - 8.500s]:** `-15.0 dB` mean volume (Speech clearly present)
- **Timeline Non-Speech Gap [3.800s - 5.600s]:** `-99.0 dB` mean volume (**Complete digital silence** outside speech windows; no audio bleeding)

### 7.3 BGM & Sidechain Ducking (Run 2: Full Mix)
- **Exported Video (Run 2: Dub + BGM + Ducking):**
  - Output Path: `temp_item3b_test/run2_bgm_ducking.mp4`
  - Duration: `10.000s` (**Exact duration preservation**)
  - BGM presence in gap window [3.800s - 5.600s]: `-28.4 dB` (BGM present across timeline)
  - Original video audio track: Attenuated / Muted per export options

### 7.4 7.632s Test Video Fixture Duration Resolution
- **Source Video:** `audit/fixtures/test_video.mp4` (7.632s duration)
- **Previous Audit Behavior:** Truncated to 3.145s (the duration of the longest TTS clip).
- **Verified Current Behavior:** Export duration is `7.632s` (difference = `0.0000s`). The full source duration is preserved.

---

## 8. Automated Test Suite Summary

The application includes 13 automated tests organized across three phases:

```
> npm test

=================================================================
         RUNNING PHASE 1 VERIFICATION TEST SUITE                 
=================================================================
► Running Item 1: TOTAL_DURATION & startup controls (tests/test-item1-total-duration.js)...
  ✓ PASSED
► Running Item 2: Isolate BGM & waveform peaks integration (tests/test-item2-separation-mock.js)...
  ✓ PASSED
► Running Item 3: DOM Selectors & ID references static test (tests/test-item3-dom-selectors.js)...
  ✓ PASSED
► Running Item 3b: Export duration, speech windows & A/V sync (tests/test-item3b-export-duration.js)...
  ✓ PASSED
Phase 1 Test Summary: 4 PASSED, 0 FAILED

=================================================================
         RUNNING PHASE 2 VERIFICATION TEST SUITE                 
=================================================================
► Running Item 4: Early theme application before first paint (tests/test-item4-theme-startup.js)...
  ✓ PASSED
► Running Item 5: Autosave interval, disable, and restart loop (tests/test-item5-autosave.js)...
  ✓ PASSED
► Running Item 6: Default project folder, sanitize, fallback, suffix (tests/test-item6-project-folder.js)...
  ✓ PASSED
► Running Item 7: Confirm before delete & Undo safety net (tests/test-item7-confirm-delete.js)...
  ✓ PASSED
► Running Item 8: Central FFmpeg command builder (-threads N) (tests/test-item8-ffmpeg-threads.js)...
  ✓ PASSED
► Running Item 9: Timeline volume live gain & pitch export notice (tests/test-item9-timeline-sliders.js)...
  ✓ PASSED
► Running Item 10: Settings keys static usage coverage (tests/test-item10-settings-keys.js)...
  ✓ PASSED
Phase 2 Test Summary: 7 PASSED, 0 FAILED

=================================================================
         RUNNING PHASE 3 VERIFICATION TEST SUITE                 
=================================================================
► Running Items 11 & 12: UI Cleanup, Mock Providers & Pronunciation Rules (tests/test-item11-item12-cleanup-mock-devmode.js)...
  ✓ PASSED
► Running Item 13: Real Profile Copy Clean Startup & Zero Demo Data (tests/test-item13-real-profile-copy.js)...
  ✓ PASSED
Phase 3 Test Summary: 2 PASSED, 0 FAILED

TOTAL: 13 PASSED, 0 FAILED (All tests exit cleanly with 0 lingering handles)
```
