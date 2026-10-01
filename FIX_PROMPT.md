# FIX: Bugs found by the feature audit (see FEATURE_STATUS.md in this folder)

Read FEATURE_STATUS.md first. Work in 3 phases. After each phase: run the app and the tests, show before/after evidence (screenshots, test output), list what you verified and what you could NOT verify, then STOP and wait for my OK. Smallest change per fix, no unrelated refactors. Keep i18n (Khmer/English), shortcuts, and ARIA behavior.

## PHASE 1: Critical bugs

1. `ReferenceError: TOTAL_DURATION is not defined` (app.js ~412, player.js ~196, 255, 289, 309). Find the root cause (a constant removed during a refactor) and replace ALL uses with one safe helper, e.g. `getProjectDuration()`, returning the real duration or 0. Required behavior with NO video loaded: "+ Add Text" creates a row (start 0, end 3 s, not clamped); Play and the progress scrubber are disabled with a tooltip ("Load a video first") and never throw. Also fix the empty-state "Add Text" button. Then run a lint/static check for undefined identifiers across the whole renderer and main code (ESLint `no-undef`) and fix every other hit; add the lint step to `npm test`.
2. Isolate BGM: the renderer checks `res.accompanimentPath` but the service returns `{ success, vocalsPath, bgmPath }`. Fix the mismatch, and define the IPC response shape in ONE shared place (typedef or constants) used by both sides. Show the REAL error message in the toast (the current "Engine unavailable" text is wrong when separation succeeded). Add an integration test using the mock separation provider that checks the BGM track is loaded and its waveform renders. Check every other IPC call for the same kind of field-name mismatch and report what you found.
3. Empty-state "Import SRT/VTT" calls `getElementById('openSrt')` but the button id is `importSrtBtn`. Fix it, and add a static test that fails when any `getElementById` / `querySelector` in the renderer points to an id or selector that does not exist in the HTML.
3b. Export length looks wrong (new finding in the latest FEATURE_STATUS.md). The test video is 7.632 s, but `exported_output.mp4` is only 3.145 s, which is about the length of the longest TTS clip (3.14 s). The exported video must keep the FULL duration of the source video (unless I explicitly choose a range or trim). Investigate the root cause first (likely the dub track length or an `amix` / `-shortest` setting driving the output duration, clips not placed with `adelay` at their segment start times, or the video stream being cut). Fix it, then add an automated test on the 10-second fixture that asserts: (a) output duration equals the source duration within 0.1 s; (b) the dubbed speech energy appears inside each segment's time window and is silent outside the windows (measure with ffmpeg `volumedetect` / `astats` on sliced ranges, or compare RMS per window); (c) audio/video start and end are in sync (report drift in ms); (d) the original audio is muted/attenuated and BGM is present when those options are on. Run this test through the real app path (UI/IPC export), not by calling the export service directly, and attach the numbers.

## PHASE 2: Settings that do nothing

Make each setting real, apply it live where possible (no restart), and add a test per setting:

4. Accent color, glass blur, reduce motion: load and apply them at startup BEFORE first paint (no flash of default colors), not only when the Settings modal opens.
5. Autosave interval: read `settings.general.autosaveIntervalSec` (0 = disabled); restart the timer when the setting changes.
6. Default project folder: use `settings.general.defaultProjectFolder` in `createProjectFromVideo` (fall back to the video's folder if unset or not writable; sanitize the name; avoid overwriting an existing folder by adding a numeric suffix).
7. Confirm before delete: respect `settings.general.confirmDelete` (keep the Undo toast as the safety net).
8. FFmpeg threads: pass `-threads N` from `settings.system.ffmpegThreads` in every FFmpeg invocation through ONE central command builder ("Auto" = omit the flag).
9. Timeline Volume/Pitch sliders only change a label. Make Volume apply live to the preview audio (gain). For Pitch show a clear "applied on export" note in the label/tooltip, since real-time pitch shifting is not supported. Do not leave a control that silently does nothing.
10. Add a static test that every key saved in settings.json is read by at least one place in the code, so ignored settings are caught in future.

## PHASE 3: Cleanup and honest verification

11. Seven preview-toolbar icons (previous frame, snapshot, crop, aspect ratio, filters, grid, advanced tools) are disabled stubs. Remove them from the UI for now (keep Blur and Watermark, which work) and keep the code behind a feature flag. Hide the disabled "Check updates" button in About.
12. Mock providers (ASR / translation / TTS / separation) must be hidden from normal users: show them only when "Developer mode" is enabled in Settings > System, with a "MOCK" label. Pronunciation: do not seed default rules (AI, Studio, PRO) silently; offer an "Add example rules" button instead.
13. Test on a COPY of my real app-data profile (not the throwaway profile): confirm the app no longer opens with a demo project (E02, "Story Dubbing", sample Khmer lines). Do not touch my real keys, settings, or projects.
14. Re-audit and correct FEATURE_STATUS.md using ONLY these statuses: WORKING / PARTIAL / STUB / BROKEN / COULD NOT TEST. WORKING requires observed runtime evidence (test name, screenshot, log, ffprobe output); a code reference alone is not enough. Fix the inconsistent counts. Mark Translate (Gemini) and Gemini/Hybrid ASR as COULD NOT TEST until a key is available. Show real evidence for Export: run the full pipeline on the 10-second fixture and report ffprobe output (duration, streams), audio present at the expected times, and A/V drift at the start and end.
15. Update README / PROMPT.md / TEST_PROMPT.md for anything that changed.
