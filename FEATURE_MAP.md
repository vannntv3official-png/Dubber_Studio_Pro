# Feature Map: AI Dubbing Studio

This document contains a complete static trace of every interactive control, function, IPC channel, and background service in the application.

---

## 1. Top Header Bar

| Element ID / Selector | UI Label / Icon | Event Handler / Listener | Code Path (Renderer -> Preload -> Main -> Effect) | Real Effect | Flags & Red Flags |
|---|---|---|---|---|---|
| `#newBtn` | Plus icon ("New Project") | `click` in `app.js:323` | `createNewProject()` -> `state.resetToEmpty(true)` -> `player.unloadVideo()` -> `updateProjectDisplay()` | Resets in-memory state, unloads player video, clears subtitles. | Real state change. |
| `#openBtn` | Folder icon ("Open Project") | `click` in `app.js:328` | `ipcClient.openFileDialog('all')` -> `window.api.project.openDialog('all')` -> `project:open-dialog` -> `dialog.showOpenDialog` -> if `.json`: `openProjectFile` -> `project:load` -> `state.loadProjectData`; if media: `importVideo` -> `project:create-from-video` | Prompts native OS file picker, extracts audio/peaks/thumbnails if video, loads project state. | Real effect (spawns OS dialog, loads/extracts project). |
| `#undo` | Undo curved arrow | `click` in `app.js:341` | `state.undo()` -> restores previous state snapshot from `state.history` | Undoes subtitle table/timeline edits. Enabled/disabled via `state.on('historyChange')`. | Real effect (state change & UI re-render). |
| `#redo` | Redo curved arrow | `click` in `app.js:345` | `state.redo()` -> restores next state snapshot from `state.future` | Redoes subtitle table/timeline edits. Enabled/disabled via `state.on('historyChange')`. | Real effect (state change & UI re-render). |
| `#lang` | "EN" / "KM" toggle | `click` in `app.js:350` | `i18n.toggleLanguage()` -> sets `localStorage['dubber_lang']` -> updates DOM elements with `data-i18n*` attributes | Full UI bilingual localization (Khmer / English). | Real effect (DOM text update + storage). |
| `#theme` | Sun / Moon icon | `click` in `app.js:356` | `theme.toggleTheme()` -> `localStorage['dubber_theme']` -> `document.documentElement.setAttribute('data-theme', ...)` -> `ipcClient.setTheme()` -> `theme:set` -> `mainWindow.setTitleBarOverlay()` | Switches CSS themes (dark/light) & native titlebar overlay styling. | Real effect (DOM attribute, localStorage, titlebar update). |
| `#settings` | Gear icon ("Settings") | `click` in `settings-modal.js:125` | `openSettingsModal()` -> `loadAllSettings()` -> `ipcClient.getSettings()` -> `settings:get` -> `modal.classList.add('open')` | Opens 900x600 settings modal and loads settings from disk. | Real effect (dialog displayed, IPC fetch). |
| `#export` | "នាំចេញវីដេអូ" (Export Video) | `click` in `app.js:362` | `openExportModal()` -> checks `hasAudio` prerequisite -> populates modal inputs -> `modal.classList.add('open')` | Opens video export dialog. Disabled until audio generated. | Real effect. |

---

## 2. Left Aside: Video Preview & Workspace Tools

| Element ID / Selector | UI Label / Icon | Event Handler / Listener | Code Path (Renderer -> Preload -> Main -> Effect) | Real Effect | Flags & Red Flags |
|---|---|---|---|---|---|
| `#btnBlur` | Drop/Mask icon ("Blur Mask") | `click` in `app.js:848` | `state.previewBlur = !state.previewBlur` -> `#blurOverlay.hidden` toggle | Toggles blur mask overlay on preview player. | Real visual preview toggle. |
| `#btnWatermark` | Stamp icon ("Watermark") | `click` in `app.js:858` | `state.previewWatermark = !state.previewWatermark` -> `#watermarkOverlay.hidden` toggle | Toggles watermark overlay on preview player. | Real visual preview toggle. |
| `.icons-toolbar .btn[data-i18n-title="back"]` | Previous Frame | `click` in `app.js:867` | Event listener on `.icons-toolbar .btn` -> `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled in HTML; clicking only shows toast "Coming soon". | **STUB / RED FLAG**: No implementation. Disabled with "Coming soon" title. |
| `.icons-toolbar .btn[data-i18n-title="image"]` | Snapshot Frame | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `.icons-toolbar .btn[data-i18n-title="crop"]` | Crop Video | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `.icons-toolbar .btn[data-i18n-title="overlay"]` | Aspect Ratio | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `.icons-toolbar .btn[data-i18n-title="effects"]` | Video Filters | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `.icons-toolbar .btn[data-i18n-title="grid"]` | Composition Grid | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `.icons-toolbar .btn[data-i18n-title="tools"]` | Advanced Video Settings | `click` in `app.js:867` | `ui.showToast(i18n.t('featureUpcoming'))` | Button is disabled; toast only. | **STUB / RED FLAG**: No implementation. |
| `#videoEl` | HTML5 `<video>` | `click`, `timeupdate`, `play`, `pause`, `ended` in `player.js:215` | HTML5 video events -> `state.setPlayhead(video.currentTime, true)` -> triggers caption & timeline sync | Plays imported video file. | Real effect. |
| `#progressTrack` | Player scrubber | `pointerdown`, `pointermove`, `pointerup` in `player.js:275` | Computes time pct -> `state.setPlayhead(time)` -> seeks `videoEl.currentTime` | Scrubs playback time. | **CRITICAL BUG**: If no video loaded (`duration=0`), calls `state.project.duration \|\| TOTAL_DURATION` which throws `ReferenceError: TOTAL_DURATION is not defined`. |
| `#play` | Play/Pause icon | `click` in `player.js:241` | `player.togglePlay()` -> if real video: `videoEl.play()/pause()`; else: `startFallbackLoop()` | Plays/pauses video or fallback timer. | **CRITICAL BUG**: Fallback timer calls `state.project.duration \|\| TOTAL_DURATION` throwing `ReferenceError: TOTAL_DURATION is not defined` when no video loaded. |
| `#stop` | Stop icon | `click` in `player.js:245` | `player.stopPlayback()` -> pauses video and rewinds playhead to 0 | Rewinds playhead to 0. | Real effect. |
| `#volSlider` | Volume slider (0-100) | `input` in `player.js:324` | `videoEl.volume = val / 100` | Adjusts preview video playback volume. | Real effect. |
| `#loadVideoBtn` | "បើកវីដេអូ" (Load Video) | `click` in `app.js:744` | `ipcClient.openFileDialog('video')` -> `app.importVideo(path)` -> `ipcClient.createProjectFromVideo` -> FFmpeg probe, audio extract (16kHz wav), peaks, thumbnails | Creates project directory, extracts audio track, extracts thumbnails, generates peaks. | Real effect (FFmpeg processing & project folder created). |
| `#loadBgmBtn` | "បើកតន្ត្រី" (Load BGM) | `click` in `app.js:752` | `ipcClient.openFileDialog('audio')` -> `ipcClient.loadBgm(path)` -> copies to `media/bgm.mp3` -> generates peaks | Loads background music into project, renders waveform in A2 track. | Real effect (file copy & peaks generated). |
| `#loadA1Btn` | "បើកសម្លេង A1" (Load A1 Dub) | `click` in `app.js:769` | `ipcClient.openFileDialog('audio')` -> `ipcClient.loadA1(path)` -> copies to `media/a1.wav` -> generates peaks | Loads pre-recorded dubbing audio into A1 track. | Real effect (file copy & peaks generated). |
| `#isolateBgmBtn` | "ញែកតន្ត្រី" (Isolate BGM) | `click` in `app.js:786` | `ipcClient.isolateBgm(source, dir)` -> `separation:isolate-bgm` -> runs Demucs or Mock separation -> returns `{ vocalsPath, bgmPath }` | Separates vocals & accompaniment. | **CRITICAL BUG**: Handler checks `if (res.success && res.accompanimentPath)`, but service returns `bgmPath`. Accompaniment never loads and UI shows error toast despite successful separation! |
| `#mute` | "បិទសម្លេងដើម" (Mute Original) | `click` in `app.js:819` | `state.timeline.muted = !state.timeline.muted` -> `videoEl.muted = state.timeline.muted` | Mutes/unmutes HTML5 video preview sound. | Real effect. |
| `#exportSrtBtn` | "នាំចេញ SRT" (Export SRT) | `click` in `app.js:836` | `exportSrt()` -> `ipcClient.exportSubtitleDialog()` -> `serializeToSrt(state.rows)` -> `ipcClient.writeFileText()` | Writes formatted SRT file to user chosen path. | Real effect (file written to disk). |
| `#importSrtBtn` | "នាំចូល SRT/VTT" (Import SRT) | `click` in `app.js:841` | `importSubtitles()` -> `ipcClient.openFileDialog('srt')` -> `readFileText()` -> `parseSubtitles()` -> populates `state.rows` | Parses SRT or VTT subtitle file and loads segments into table & timeline. | Real effect (subtitles loaded into state). |
| `#introOutroBtn` | "ផ្តើម និងបញ្ចប់" (Intro/Outro) | `click` in `app.js:831` | `openIntroOutroModal()` -> `#introOutroModal.classList.add('open')` | Opens dedicated modal to configure intro and outro clips. | Real effect. |

---

## 3. Subtitle Data Panel & Table

| Element ID / Selector | UI Label / Icon | Event Handler / Listener | Code Path (Renderer -> Preload -> Main -> Effect) | Real Effect | Flags & Red Flags |
|---|---|---|---|---|---|
| `#add` | "＋ បន្ថែម" (Add Text) | `click` in `app.js:408` | `state.snapshot()` -> calculates start/end -> pushes new row to `state.rows` | Adds new subtitle line at playhead/end of last line. | **CRITICAL BUG**: If no video loaded (`duration=0`), calls `state.project.duration \|\| TOTAL_DURATION` throwing `ReferenceError: TOTAL_DURATION is not defined`. |
| `#edit` | "កែ" (Edit) | `click` in `app.js:433` | Finds `tr.sel .txt` -> `.focus()` | Focuses contenteditable cell of selected row. | Real effect. Disabled if no row selected. |
| `#del` | "លុប" (Delete) | `click` in `app.js:439` | Checks selection -> optional `window.confirm` if >1 row -> filters `state.rows` | Deletes selected row(s) and updates table & timeline. | Real effect. **NOTE**: Ignores `settings.general.confirmDelete` setting. |
| `#fr` | "ស្វែងរក និងជំនួស" (Find & Replace) | `click` in `app.js:552` | `ui.openFindReplaceModal()` -> `#frModal.classList.add('open')` | Opens Find & Replace modal dialog. | Real effect. |
| `#series` | "Series" toggle | `click` in `app.js:458` | `state.seriesMode = !state.seriesMode` -> `table.render()` | Toggles series view mode. | Real state toggle. |
| `#vf` | Voice filter select | `change` in `table.js:423` | `state.filterVoice = Number(value)` -> `table.render()` | Filters visible table rows by character voice index (A1-A5). | Real filtering effect. |
| `#cast` | "Cast ({count}) ▾" | `click` in `ui.js:46` | `ui.toggleCastPopover()` -> populates `#pop` with voice distribution breakdown | Displays popover with character counts per voice. | Real effect. |
| `#setVoicePopoverBtn` | "កំណត់សម្លេង ▾" (Set Voice) | `click` in `app.js:467` | Toggles `#setVoicePopover.hidden` | Opens 2-row Male/Female bulk voice assign popover. | Real effect. |
| `#mvOk` | "✓ អនុវត្ត" (Male Voice Apply) | `click` in `app.js:548` | `applyVoiceBulk('M', 'mv')` -> reassigns male voice index for checked or all rows | Batch assigns selected voice to male characters. | Real effect (state change & undo snapshot). |
| `#fvOk` | "✓ អនុវត្ត" (Female Voice Apply) | `click` in `app.js:549` | `applyVoiceBulk('F', 'fv')` -> reassigns female voice index for checked or all rows | Batch assigns selected voice to female characters. | Real effect (state change & undo snapshot). |
| `#moreMenuBtn` | "•••" (More Options) | `click` in `app.js:477` | Toggles `#moreMenuDropdown.hidden` | Displays collapsed toolbar items when window width < 680px. | Real responsive container effect. |
| `#all` (Checkbox) | Header checkbox | `change` in `table.js:431` | Loops `state.rows` -> `r.ck = checked` -> `table.render()` | Selects or deselects all row checkboxes. | Real effect. |
| Table row: `.time-editable` | Timecode cells | `focusout` in `table.js:403` | `timeStringToSeconds()` -> updates `row.s` or `row.e` | In-place timecode editing with validation and re-render. | Real effect. |
| Table row: `.txt` | Text cells | `focusout` in `table.js:385` | Updates `row.t = newText` -> `state.emit('change')` | In-place Khmer dialogue editing. | Real effect. |
| Table row: `select[data-k="v"]` | Voice select | `change` in `table.js:372` | Updates `row.v = +value` -> `state.emit('change')` | Reassigns character voice preset. | Real effect. |
| Table row: `button.speed-step-btn` | +/- speed buttons | `click` in `table.js:339` | Updates `row.sp = clamp(row.sp ± 0.1)` | Steps row playback speed. | Real effect. |
| Table row: `input[data-k="sp"]` | Speed slider | `change` in `table.js:372` | Updates `row.sp = +value` | Sets row playback speed. | Real effect. |
| Table row: `button[data-k="ok"]` | Audio status speaker button | `click` in `table.js:320` | `table.playAudioPreview(row)` -> if `row.audioPath`: HTML5 Audio; else: synthetic Web Audio oscillator | Plays synthesized dialogue audio clip or tone fallback. | Real audio playback effect. |

### Empty State Controls

| Element ID | Event Handler / Listener | Code Path | Real Effect | Flags & Red Flags |
|---|---|---|---|---|
| `#emptyBtnPrimary` | `click` in `workflow.js:288` | If `loadVideo`: `#openVideo?.click() \|\| #openBtn?.click()`; If `transcribe`: `#trans?.click()` | Triggers video load or transcribe modal. | Working (falls back to `#openBtn`). |
| `#emptyBtnOpenProj` | `click` in `workflow.js:300` | `#openBtn?.click()` | Triggers Open Project dialog. | Working. |
| `#emptyBtnNewProj` | `click` in `workflow.js:306` | `#newBtn?.click()` | Creates new project. | Working. |
| `#emptyBtnImport` | `click` in `workflow.js:312` | `document.getElementById('openSrt')?.click()` | **NONE**. Element `#openSrt` does not exist in DOM (actual button is `#importSrtBtn`). | **DEAD CONTROL**: Button does nothing when clicked. |
| `#emptyBtnAdd` | `click` in `workflow.js:318` | `document.getElementById('add')?.click()` | Clicks `#add`. | **BROKEN**: Throws `ReferenceError: TOTAL_DURATION is not defined` if duration is 0. |
| `.recent-item` | `click` in `workflow.js:267` | `app.openProjectFromDir(dir)` -> `ipcClient.loadProject` | Opens clicked recent project from disk. | Working. |
| `.recent-remove-btn` | `click` in `workflow.js:261` | `ipcClient.removeRecentProject(dir)` | Removes project from recent history list. | Working. |

---

## 4. Timeline Editor Panel

| Element ID / Selector | UI Label / Icon | Event Handler / Listener | Code Path (Renderer -> Preload -> Main -> Effect) | Real Effect | Flags & Red Flags |
|---|---|---|---|---|---|
| `#zoomOut` | Zoom out magnifying glass | `click` in `timeline.js:669` | `zoomSlider.stepDown(10)` -> `applyZoom(newPPS)` | Decreases timeline horizontal scale (px/sec). | Real rendering/scaling effect. |
| `#zoomIn` | Zoom in magnifying glass | `click` in `timeline.js:663` | `zoomSlider.stepUp(10)` -> `applyZoom(newPPS)` | Increases timeline horizontal scale (px/sec). | Real rendering/scaling effect. |
| `#zoom` | Zoom range slider | `input` in `timeline.js:653` | `applyZoom(newPPS)` -> updates CSS grid column template on `#tracks` | Smooth timeline zoom scaling. | Real rendering/scaling effect. |
| `#followPlayheadBtn` | "Follow: ON/OFF" | `click` in `timeline.js:678` | Toggles `state.timeline.followPlayhead` | Auto-scrolls timeline viewport during playback to follow playhead. | Real smooth auto-scroll effect. |
| `#split` | "កាត់" (Split) | `click` in `timeline.js:501` | `timeline.splitAtPlayhead()` -> splits dialogue segment at playhead timestamp -> creates 2 rows | Splits subtitle segment and creates new segment with split text. | Real editing effect. |
| `#tlSpeed` | Speed slider (0.5x - 2.0x) | `input` in `timeline.js:721` | Updates `output` and sets `sp` on active target segments | Adjusts playback speed of selected segments. | Real effect. |
| `#tlVol` | Volume slider (0 - 200%) | `input` in `timeline.js:721` | Updates output display | Timeline track volume slider display. | **PARTIAL**: Changes visual output display; export reads modal slider. |
| `#tlPitch` | Pitch slider (-12 to +12) | `input` in `timeline.js:721` | Updates output display | Timeline pitch slider display. | **PARTIAL**: Changes visual output display; export reads modal pitch select. |
| `#reverb` | "Reverb" toggle | `click` in `timeline.js:756` | Toggles `state.timeline.reverb` | Toggles reverb state; passed to export mixing filter. | Real state toggle. |
| `#tlang` | Target Language select | `change` in `translation-modal.js:41` | Syncs `targetLangSelect.value = tlangToolbar.value` | Selects target translation language. | Real synchronization effect. |
| `#autofit` | "Auto-Fit: Med" | `click` in `timeline.js:761` | Cycles `autofitIndex` (Off -> Low -> Med -> High) | Sets Auto-Fit tempo compression algorithm level for TTS audio. | Real timing calculation effect. |
| `#crowd` | "Crowd" toggle | `click` in `timeline.js:755` | Toggles `state.timeline.crowd` | Toggles crowd ambience state; passed to export mixing filter. | Real state toggle. |
| `#sync` | "Sync End: ON/OFF" | `click` in `timeline.js:753` | Toggles `state.timeline.syncEnd` | Enforces speech audio alignment to segment end timestamp. | Real timing calculation effect. |
| `#duck` | "Ducking: ON/OFF" | `click` in `timeline.js:754` | Toggles `state.timeline.ducking` | Enables/disables FFmpeg sidechain ducking in export mix. | Real mixing parameter effect. |
| `#trans` | "Transcribe" button | `click` in `transcribe-modal.js:32` | Opens Transcribe modal dialog | Opens speech recognition dialog. | Real effect. |
| `#translateBtn` | "បកប្រែ (Translate)" | `click` in `translation-modal.js:60` | Opens Translation modal dialog | Opens AI translation dialog. | Real effect. |
| `#gen` | "បង្កើតសម្លេងដែលបានជ្រើស" | `click` in `app.js:556` | `ipcClient.synthesizeBatch()` -> `tts:synthesize-batch` -> sidecar Edge-TTS -> stores audio files -> updates rows | Synthesizes neural TTS voice audio for selected or all subtitle rows. | Real effect (audio files generated on disk & waveforms updated). |
| `#tlEdgeLeft` | "◀ 00:00.00" edge indicator | `click` in `timeline.js:694` | `scrollToPlayhead()` | Scrolls timeline view to off-screen playhead position. | Real smooth scroll effect. |
| `#tlEdgeRight` | "00:00.00 ▶" edge indicator | `click` in `timeline.js:697` | `scrollToPlayhead()` | Scrolls timeline view to off-screen playhead position. | Real smooth scroll effect. |
| Clip Left Handle | `[data-handle="left"]` | `pointerdown` in `timeline.js:510` | Drags segment start time `row.s` | Resizes segment start in real time. | Real editing effect. |
| Clip Right Handle | `[data-handle="right"]` | `pointerdown` in `timeline.js:510` | Drags segment end time `row.e` | Resizes segment end in real time. | Real editing effect. |
| Clip Body | `.clip[data-track="T1"]` | `pointerdown` in `timeline.js:529` | Drags segment start and end times together | Moves segment along timeline. | Real editing effect. |
| Track scrubbing | `.track` / `.tl-ruler` | `pointerdown` in `timeline.js:547` | Updates `state.setPlayhead(time)` | Seeks playhead across all tracks. | Real scrubbing effect. |

---

## 5. Status Bar Footer

| Element ID | Code Path | Real Effect | Flags & Red Flags |
|---|---|---|---|
| `#projFooter` (`#pname`) | `state.on('projectLoaded')` / `autosaved` | Displays active project name and autosave confirmation. | Real effect. |
| `#keysStatus` (`#keysStatusTxt`) | `ipcClient.on('keys:status')` | Real-time active/total key count in Gemini Key Pool. | Real effect. |
| `#memStatus` (`#memStatusTxt`) | `ui.initStatusPoller()` -> `system:get-memory` (every 10s) | Queries real Electron process working set + system RAM usage. | Real effect. |

---

## 6. Dialogs & Modals

### 6.1 Find & Replace Modal (`#frModal`)
| Element ID | Action / Effect | Real Effect | Flags |
|---|---|---|---|
| `#fInp`, `#rInp` | Search query & replacement text inputs | Live match counter updates | Working |
| `#frCase` | Case sensitivity checkbox toggle | Updates search regex | Working |
| `#frSelOnly` | Selected rows only checkbox toggle | Limits replacement scope | Working |
| `#frNext` | Replace next occurrence button | Replaces matching text in next row | Working |
| `#frOk` | Replace all occurrences button | Batch replaces matching text across all rows | Working |
| `#frCancel` | Dismiss button | Closes modal dialog | Working |

### 6.2 Settings Modal (`#settingsModal`)
| Section / Control ID | Action / Effect | Real Effect | Flags & Red Flags |
|---|---|---|---|
| `#settingsCloseBtn`, `#settingsDismissBtn` | Closes settings modal with dirty check | Closes modal | Working |
| `#settingsSaveBtn` | `saveAllSettings()` -> `ipcClient.updateSettings()` | Persists settings across sections to disk | Working |
| `#settingsSearchInp` | Cross-section search filter input | Filters setting cards dynamically | Working |
| `#setGenLang` | UI Language select (Khmer / English) | Switches UI language immediately | Working |
| `#setGenTargetLang` | Default target translation language | Saved to settings config | Working |
| `#setGenStartupAction` | On startup: startScreen vs reopenLast | Handled on startup | Working |
| `#setGenProjectDir` & `#setGenProjectDirBrowseBtn` | Default project folder picker | **SETTING HAS NO EFFECT**: Saved to settings, but never read by project service (always defaults to video dir). | **DEAD SETTING** |
| `#setGenClearCacheBtn` | Clears TTS audio cache directory | Deletes cached MP3 files from disk | Working |
| `#setGenAutosave` | Autosave interval select (15s, 30s, 60s, 120s, 0) | **SETTING HAS NO EFFECT**: `state.js` hardcodes `setInterval(..., 30000)`. Never reads setting. | **DEAD SETTING** |
| `#setGenConfirmDelete` | Confirm before delete checkbox | **SETTING HAS NO EFFECT**: `app.js` hardcodes `if (targets.length > 1) window.confirm`. Never reads setting. | **DEAD SETTING** |
| `#setThemeMode` | Dark / Light / System mode select | Live previews and applies CSS theme | Working |
| `#accentColorRow` | 6 color dot preset buttons | Live previews accent color; saved to config | **PARTIAL**: Not applied on fresh app startup until Settings modal opened. |
| `#setThemeBlur` | Glass blur intensity slider (0-24px) | Live previews backdrop blur | **PARTIAL**: Not applied on fresh app startup until Settings modal opened. |
| `#setThemeReduceMotion` | Reduce motion checkbox | Live previews disabling CSS transitions | **PARTIAL**: Not applied on fresh app startup until Settings modal opened. |
| `#setKeyInp` & `#setKeyAddBtn` | Single Gemini API Key entry with eye toggle | Validates key, encrypts via Electron safeStorage, adds to pool | Working |
| `#setKeyMultiToggleBtn`, `#setKeyMultiImportBtn` | Multi-key textarea batch importer | Batch imports and encrypts multiple keys | Working |
| Dynamic Key Cards (`.key-item`) | Test key / Delete key buttons | Tests key with Gemini API ping / Removes key from encrypted store | Working |
| `#setGeminiTransModel`, `#setGeminiTranslateModel` | Gemini model selectors | Persists model configurations for transcription/translation | Working |
| `#setGeminiConcurrency`, `#setGeminiBatchSize` | Concurrency & batch size inputs | Configures request throttling and batch sizing | Working |
| `#setAsrEngineSelect` | Faster-Whisper / Gemini / Hybrid / Mock | Configures default ASR engine | Working |
| `#setWhisperModelSelect` | Whisper model size (tiny, base, small, medium, large-v3) | Configures model size and checks disk presence | Working |
| `#setWhisperDeviceSelect`, `#setWhisperBeam` | Device (auto, cpu, cuda) & Beam size | Configures inference device and beam search width | Working |
| `#setDownloadModelBtn` | Downloads selected Whisper model | Downloads model via sidecar with live progress | Working |
| `#setDeleteModelBtn` | Deletes downloaded model | Removes model files from disk | Working |
| `#setVoicePresetsList` (A1 - A5) | Customizes character name, voice, rate, pitch, vol | Persists voice presets; tested via preview button | Working |
| `#setPronWrittenInp`, `#setPronSpokenInp`, `#setPronAddBtn` | Adds phonetic dictionary mapping | Inserts rule into pronunciation dictionary | Working |
| `#setPronExportJsonBtn`, `#setPronExportCsvBtn` | Exports dictionary to JSON / CSV | Exports pronunciation dictionary to file | Working |
| `#setPronImportBtn` | Imports dictionary from JSON / CSV | Imports pronunciation dictionary from file | Working |
| `#setShortcutsResetBtn` | Resets keyboard shortcuts to defaults | Resets shortcut key map | Working |
| Rebind buttons (`.shortcut-rebind-btn`) | Interactive key capture for shortcuts | Captures key combination with conflict detection | Working |
| `#setSysCopyDiagBtn` | Copies diagnostics JSON to clipboard | Copies system specs & versions to clipboard | Working |
| `#setSysOpenLogsBtn` | Opens logs directory in OS file manager | Opens logs folder via `shell.openPath` | Working |
| `#setSysExportLogsBtn` | Exports logs to zip archive | Packages log files into archive | Working |
| `#setSysFfmpegThreads` | FFmpeg CPU thread count (0, 2, 4, 8) | **SETTING HAS NO EFFECT**: Saved to settings, but never read by `ffmpeg.js`, mixer, or export. | **DEAD SETTING** |
| `#setAboutCheckUpdatesBtn` | "Up to date (v1.0.0)" button | Disabled button with static version tooltip | **STUB**: No update checker implemented. |

### 6.3 Transcription Modal (`#transcribeModal`)
| Element ID | Action / Effect | Real Effect | Flags |
|---|---|---|---|
| `#transEngineSelect` | Engine selector (Whisper, Gemini, Hybrid, Mock) | Switches ASR provider | Working |
| `#transLangSelect` | Audio spoken language selector | Passed to ASR provider | Working |
| `#transModelSelect` | Whisper model size selector | Passed to Faster-Whisper provider | Working |
| `#transStartBtn` | Initiates speech recognition | Runs ASR provider, reports live progress, maps segments into table | Working |
| `#transCancelJobBtn` | Cancels running transcription | Aborts sidecar/Gemini transcription | Working |

### 6.4 Translation Modal (`#translateModal`)
| Element ID | Action / Effect | Real Effect | Flags |
|---|---|---|---|
| `#targetLangSelect` | Target language selector | Configures translation target language | Working |
| `#translateModelSelect` | Gemini model / Mock engine selector | Selects Gemini AI model | Working |
| `#translateBatchSizeSelect` | Batch size selector (15, 30, 50) | Configures translation batching | Working |
| `#translateGlossaryInp` | Character names & series glossary textarea | Injected into Gemini prompt context | Working |
| `#startTranslationBtn` | Initiates dialogue translation | Translates dialogue lines with retry and context | Working |
| `#translateCancelJobBtn` | Cancels running translation | Aborts translation pipeline | Working |

### 6.5 Export Modal (`#exportModal`)
| Element ID | Action / Effect | Real Effect | Flags |
|---|---|---|---|
| `#exportOutputInp`, `#exportBrowseBtn` | Output file path and picker | Sets destination `.mp4` path | Working |
| `#exportPresetSelect` | FFmpeg encoding speed preset | Controls x264 encoding preset | Working |
| `#exportBgmCheck`, `#exportPickBgmBtn`, `#exportBgmVol` | BGM inclusion, file picker, volume | Mixes BGM with specified gain | Working |
| `#exportDuckCheck` | Audio ducking toggle | Enables FFmpeg sidechain compression | Working |
| `#exportDubVol` | Dub vocal gain slider (0.2x - 2.0x) | Adjusts volume of synthesized dialogue | Working |
| `#exportMuteOrigCheck` | Mute original audio toggle | Mutes original video sound track | Working |
| `#exportReverbCheck`, `#exportCrowdCheck` | Reverb and crowd ambience toggles | Applies audio filter complex DSP effects | Working |
| `#exportPitchSelect` | Master pitch shift select (-4 to +4 st) | Shifts pitch via asetrate/aresample | Working |
| `#exportBlurCheck` | Blur hard-subs checkbox | Applies boxblur filter on subtitle area | Working |
| `#exportWatermarkCheck`, `#exportWatermarkTextInp` | Watermark checkbox and text | Renders drawtext watermark overlay | Working |
| `#exportIntroInp/browse/clear`, `#exportOutroInp/browse/clear` | Intro/outro video clip paths | Concatenates intro and outro clips | Working |
| `#exportStartBtn` | Starts video export | Runs 5-stage FFmpeg export pipeline with live progress | Working |
| `#exportCancelJobBtn` | Cancels running export | Terminates FFmpeg processes and removes temp files | Working |

---

## 7. Keyboard Shortcuts Map

| Shortcut | Action | Handler / Location | Flags |
|---|---|---|---|
| `Space` | Play / Pause Video | `app.js:901` -> `player.togglePlay()` | Crashes if no video loaded (`TOTAL_DURATION`) |
| `KeyS` | Split at Playhead | `app.js:908` -> `timeline.splitAtPlayhead()` | Working |
| `Ctrl+KeyS` | Save Project | `app.js:922` -> `saveCurrentProject()` | Working |
| `Ctrl+KeyZ` | Undo | `app.js:929` -> `state.undo()` | Working |
| `Ctrl+KeyY` | Redo | `app.js:938` -> `state.redo()` | Working |
| `Ctrl+KeyF` | Find & Replace | `app.js:947` -> `ui.openFindReplaceModal()` | Working |
| `Delete` | Delete Selected Row | `app.js:961` -> clicks `#del` | Working |
| `ArrowUp` | Previous Subtitle Row | `table.js:457` -> selects prev row & seeks playhead | Working |
| `ArrowDown` | Next Subtitle Row | `table.js:449` -> selects next row & seeks playhead | Working |
| `Ctrl+N` | New Project | `app.js:915` -> `createNewProject()` | Working |
| `Ctrl+O` | Open Project | Bound to `#openBtn` in HTML | Working |
| `Home` | Scroll Timeline to Playhead | `timeline.js:701` -> `scrollToPlayhead()` | Working |
| `Escape` | Close Modal / Popover | `app.js:954`, `settings-modal.js:192` | Working |
