ANALYZE: Which features of the AI Dubbing Studio really work? (audit and report only, do NOT change application code)

Goal: produce an honest, evidence-based status of EVERY feature: Working, Partial, Stub, Broken, or Could not test. A visible button is not proof that a feature exists. Treat anything you did not observe working as unverified.

Safety rules
- Do NOT modify application code. You may add files under audit/ (scripts, fixtures, screenshots, reports).
- Run the app with a separate throwaway profile (e.g. `--user-data-dir=audit/profile`) so my real settings, API keys and projects are never touched or overwritten. Never print, log, or put API keys in the report.
- Real Gemini calls: allowed only for a few tiny requests, and only if a key is configured; tell me before any larger or paid usage or any download above 500 MB. edge-tts needs internet and is free.
- Do not delete user files outside audit/.

Method (do all three, in this order)
A) Static trace. Build FEATURE_MAP.md: for every control and function in the app (top bar, left panel icon strip, Workspace Tools, subtitle toolbar, table row controls, timeline toolbar and tracks, status bar, all Settings sections, keyboard shortcuts, context menus, dialogs), follow it from the UI element -> event handler -> main-process/IPC/sidecar function -> real effect (file written, process spawned, network call, state change). Flag red-flag patterns:
   - handlers that only show a toast/alert/console.log, are empty, or contain TODO/FIXME/"coming soon"/"not implemented";
   - fake progress (setTimeout/setInterval simulating work), random or hard-coded results, sample/demo data (search for "demo", "sample", "mock", "E02", "Story Dubbing", hard-coded Khmer sentences);
   - UI states that are never updated from real data; settings that are saved but never read by any code; IPC channels with no handler or handlers never called; dead code and unused i18n keys;
   - mock providers that are used in the normal (non-test) code path.
B) Dead-control scan (runtime). With Playwright for Electron, enumerate every interactive element on every screen and dialog (buttons, inputs, selects, sliders, toggles, tabs, menu items, [role=button], [tabindex]). For each one: interact with it safely (click / change value) and record whether ANYTHING real happened: IPC call made, state changed, DOM changed meaningfully, file written, network request, or nothing. Controls that do nothing are "dead". Record the console and terminal errors each interaction produced. Do this in states: (1) no project, (2) video loaded and no subtitles, (3) subtitles present, (4) translated, (5) audio generated.
C) End-to-end run. Using audit/fixtures (create with FFmpeg: a 10-second video with synthetic speech made by edge-tts, a BGM mp3, a sample SRT/VTT): run the real workflow Load video -> Transcribe -> Translate -> Assign voices -> Generate audio -> Mix -> Export, first with the real providers if keys exist (otherwise say BLOCKED and run with mocks, clearly labeled as mock), then verify the exported MP4 with ffprobe (valid file, duration, streams, audio present at expected times, no clipping). Also test: Save/Open project, Undo/Redo, Find & Replace, SRT/VTT import-export, timeline zoom/split/drag, settings persistence after restart, and error handling with no internet / invalid key.

Status definitions (use exactly these)
- WORKING: observed end to end with real effect and correct result.
- PARTIAL: works in some cases or has defects (describe).
- STUB: UI exists but there is no real implementation (toast only, fake, demo data, mock).
- BROKEN: implemented but fails or errors.
- COULD NOT TEST: say exactly why and what is needed (e.g. a GPU, a real key, a long video).
Every status needs evidence: screenshot path, log excerpt, command output, test name, or code reference (file:function). No evidence = not WORKING.

Deliverables
1. FEATURE_STATUS.md with:
   a) Verdict for each of the 6 core workflow steps (Load video, Transcribe, Translate, Assign voices, Generate audio, Export): status + one-line reason + evidence.
   b) Full table: Area | Feature | UI location | Code path (UI -> handler -> implementation) | Status | Evidence | Notes.
   c) Counts per status per area, and an overall "percent really working".
   d) List of dead controls (button does nothing) and of settings that have no effect.
   e) List of demo/sample/mock data still used in the normal code path.
   f) Top 10 problems ordered by user impact (Critical / Major / Minor), each with steps to reproduce, expected vs actual, probable root cause (file/function). No code changes.
   g) What you could NOT verify and what you need from me (e.g. key, GPU, real videos).
2. FEATURE_MAP.md and audit/ folder (scripts, fixtures, screenshots, logs) with a README on how to rerun the audit (`npm run audit`).
3. A final message to me (max 12 lines): overall health, the 6 workflow verdicts, top 5 problems, and what you need from me.

Work area by area and save progress in FEATURE_STATUS.md as you go so nothing is lost if the session stops. Do not stop at the first failure. When unsure, mark "COULD NOT TEST", never "WORKING".