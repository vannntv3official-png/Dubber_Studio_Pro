# RELEASE READINESS: analyze all features, fix bugs, improve, and prepare AI Dubbing Studio for public release

You are the QA lead and senior engineer for this release. The app will be given to real users, so the goal is a trustworthy release, not a long list of changes. Work in phases, with a hard STOP and my approval between phases.

## Context files in this folder (read first)
PROMPT.md (product spec), FEATURE_STATUS.md (latest audit), FIX_PROMPT.md, TEST_PROMPT.md, ANALYZE_PROMPT.md, README.md. If something I already asked for in FIX_PROMPT.md is not done yet, include it in this work (do not redo what is verified as done).

## Global rules
- Evidence over claims. WORKING means you observed it run and have proof (test name, log, screenshot, ffprobe/ffmpeg numbers). A code reference alone is never proof. Allowed statuses only: WORKING / PARTIAL / STUB / BROKEN / COULD NOT TEST.
- Never touch my real app-data profile, API keys, or projects. Use a throwaway profile (`--user-data-dir=audit/profile`) for tests and a COPY of my real profile only when I say so. Never print or log API keys. Ask me before paid or large API usage or downloads above 500 MB.
- Commit after each verified fix (small commits, clear messages) so any change can be reverted. Work on a branch `release/1.0`; tag the starting point `pre-release-baseline`.
- Smallest change that fixes each problem. No unrelated refactors. Keep Khmer/English i18n, shortcuts, ARIA, dark and light themes working.
- Every fix needs a regression test. Every improvement needs a measurable before/after.
- Do not hide problems: if something is flaky, run it 3 times and report the pass rate. If you cannot test something, say so.
- Never mark a release gate as passed on assumptions.

## PHASE 0: Baseline and safety
1. Create the branch and baseline tag. Run `npm install`, lint (ESLint `no-undef`, `no-unused-vars`), and the existing tests; record the results.
2. Make sure `npm test` finishes by itself (no hanging timers or open handles), and add scripts: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run audit`.
3. Produce RELEASE_BASELINE.md: app version, dependency versions, test results, bundle size, startup time, idle memory.

## PHASE 1: Full analysis (report only, no application code changes)
Cover EVERY feature, with the three methods: (A) static trace UI -> handler -> IPC/sidecar -> real effect; (B) runtime dead-control scan with Playwright for Electron in 5 states (no project / video loaded / subtitles / translated / audio generated); (C) end-to-end runs through the REAL app path (UI and IPC, not by calling services directly).
Areas: app shell and window, project (new/open/save/autosave/recovery/recent), import (video/audio/corrupt/unicode paths), player, timeline (zoom, follow, split, drag/resize, waveforms, thumbnails, tracks, sliders), subtitle table (edit, voices, cast, find & replace, series, undo/redo, 2,000 rows), Faster-Whisper, Gemini ASR, Hybrid, Gemini translation, edge-tts (all voice presets, cache, retries), Pronunciation, timing/auto-fit/sync-end, BGM isolation, mixing (ducking, volumes), export (MP4, SRT/VTT), intro/outro, overlay effects, all Settings sections, shortcuts, error handling (no internet, invalid key, quota, sidecar crash, cancel, disk full, corrupt files), security (contextIsolation, CSP, IPC argument validation, FFmpeg argument injection, key storage), performance and memory (load 5 videos in a row, zoom 50 times, play/stop 20 times: report memory growth), accessibility, packaging.
Specific known problems that must be re-checked with evidence: TOTAL_DURATION ReferenceError (Add Text/Play/scrub with no video), Isolate BGM property mismatch (`accompanimentPath` vs `bgmPath`), empty-state Import SRT/VTT dead id, settings with no effect (accent/blur/reduce-motion at startup, autosave interval, default project folder, confirm delete, FFmpeg threads, timeline Volume/Pitch), stub toolbar icons, mock providers visible in normal UI, demo/sample data on startup (project "E02"), debug text in the UI ("loadVideoForFilmstrip"), mojibake in the status bar, EXPORT LENGTH (a 7.632 s source produced a 3.145 s export, so verify output duration, speech placement per segment, and A/V drift in ms).
Real-provider tests: use my Gemini key only if I put it in the throwaway profile; otherwise mark COULD NOT TEST. edge-tts and Faster-Whisper (base/tiny model) must be run for real.
Deliverable: RELEASE_AUDIT.md = (1) verdict for the 6 core steps with evidence, (2) full feature table with status and evidence, (3) every defect with ID, severity (Blocker / Critical / Major / Minor / Cosmetic), steps to reproduce, expected vs actual, root cause (file/function), (4) list of everything COULD NOT TEST and what you need from me. STOP and wait for my approval.

## PHASE 2: Fix
Fix in this order: Blockers (crash, data loss, wrong export, core pipeline broken), Critical, Major, then Minor. For each defect: root cause first, smallest fix, regression test, commit, and update RELEASE_AUDIT.md (status + evidence). Re-run the affected area after each fix and the whole suite after each severity group. Report fixed / not fixed / deferred (with reason). STOP and wait for my approval.

## PHASE 3: Improve (only things that make the release safer or clearly better for users)
1. Reliability: every long task has progress, ETA, Cancel, and clean recovery; resumable Whisper model download; sidecar crash auto-restart; autosave + crash recovery verified by killing the app mid-edit; atomic writes for project.json and settings.json (write temp then rename; keep a `.bak`); schema version + migration tests.
2. Error messages: every error is human-readable in Khmer and English, says what happened and what to do, with a "Copy details" button. "Export diagnostics" bundles logs and versions with API keys removed.
3. First-run experience: a short welcome (what the app does, add Gemini key with a link to get one, choose the Whisper model, test the connection), and a sample 10-second project the user can open (clearly marked as a sample, never loaded automatically).
4. Performance targets (measure before and after): startup under 4 s, UI never frozen more than 100 ms during Transcribe/Export, subtitle table with 2,000 rows scrolls at 55+ fps, no memory growth after the repeat test.
5. UX polish already requested (apply if not done): compact table rows, timeline alignment and empty-state fixes, consistent icon set, WCAG AA contrast, disabled-state tooltips, real-data-driven button states.
6. Security hardening: validate all IPC inputs, no arbitrary path or FFmpeg flag injection, CSP enforced, external links open in the system browser, API keys only in safeStorage (verify no plain-text copy in app-data or logs).
7. Accessibility and i18n: keyboard-only walkthrough of the whole workflow, screen reader labels, no untranslated or hard-coded strings, Khmer rendering with the bundled font.
STOP and wait for my approval.

## PHASE 4: Release hardening
1. Packaging: build the Windows installer with electron-builder. Verify on a clean Windows profile or VM (no Node, Python, or FFmpeg installed): installs, starts, bundled Python sidecar and FFmpeg run, Whisper model download works, uninstall removes the app but keeps user projects. Report installer size and install path behavior (per-user vs all-users).
2. Code signing: the installer should be signed; if no certificate exists, mark BLOCKED and document the SmartScreen warning users will see.
3. Updates and versioning: set version 1.0.0, add CHANGELOG.md, and an "About" screen with version, credits, and licenses. Implement or hide "Check for updates" (no disabled stubs).
4. Licenses and legal review checklist (flag, do not decide for me): FFmpeg build license (LGPL/GPL and how it is distributed), Faster-Whisper/CTranslate2, Whisper model weights, Demucs, edge-tts, Noto Sans Khmer font, Lucide icons; produce THIRD_PARTY_NOTICES.md. Note that edge-tts uses an unofficial Microsoft online service that may change or restrict use, and that Gemini API terms apply to users' own keys. Put a clear in-app note about these and about users being responsible for having rights to the videos they dub.
5. Privacy: confirm no telemetry or network calls other than the ones the user triggers (Gemini, edge-tts, model downloads); document exactly what is sent where in PRIVACY.md and in the About screen.
6. Documentation: README (install, first run, workflow, FAQ, troubleshooting: no internet, key errors, slow Whisper, GPU), KNOWN_ISSUES.md, and a 1-page quick start in Khmer and English.

## PHASE 5: Release gates (go / no-go)
Produce RELEASE_READINESS_REPORT.md with this table. Each gate is PASS / FAIL / BLOCKED with evidence.
| Gate | Criterion |
|---|---|
| G1 | 0 open Blocker or Critical defects |
| G2 | Full pipeline on 3 different real videos (10 s, 5 min, 30 min, vertical and horizontal): transcribe, translate, dub, export succeed; export duration equals source within 0.1 s; speech inside segment windows; A/V drift under 80 ms; no clipping |
| G3 | `npm test`, lint, and e2e suite all pass, and exit on their own |
| G4 | No memory growth after the repeat test; no crash in a 60-minute soak test (open, edit, play, generate, export loop) |
| G5 | Offline, bad key, quota, sidecar crash, cancel, and disk-full cases all handled with clear messages and no data loss |
| G6 | Clean-machine installer test passes (no Node/Python/FFmpeg installed) |
| G7 | No placeholder, stub, demo data, mock provider, or debug text visible to a normal user |
| G8 | Security checks pass; no API key in plain text anywhere |
| G9 | Accessibility: keyboard-only workflow works; contrast AA in both themes |
| G10 | Licenses, privacy, and known issues documented |
Finish with a clear recommendation: SHIP / SHIP WITH KNOWN ISSUES (list) / DO NOT SHIP, with the top risks, and a short list of tasks that only a human can do (listening to Khmer voice quality, real-world video samples, GPU testing, code-signing certificate, legal review).

## Output format at every STOP
(1) what you did, (2) evidence (test names, numbers, screenshots), (3) what you could NOT verify, (4) what you need from me. Keep progress saved in the report files so nothing is lost if the session stops.
