# AI Dubbing Studio — Automated Feature Audit Suite

This directory contains the automated audit suite, runtime test runners, fixtures, logs, and evidence screenshots generated during the evidence-based feature verification requested in `ANALYZE_PROMPT.md`.

---

## 1. Quick Start / How to Rerun the Audit

To rerun the full automated audit suite (Method B + Method C):

```bash
# Run master audit runner directly
node audit/run_audit.js

# Or if npm script is configured:
npm run audit
```

To run individual phases separately:

```bash
# 1. Regenerate synthetic test fixtures (FFmpeg video, edge-tts audio, BGM, subtitles)
node audit/generate_fixtures.js

# 2. Method B: Dead-Control Runtime Scan across all 5 UI states and modals
npx electron audit/dead_control_scan.js

# 3. Method C: End-to-End Pipeline & Subsystem Verification
node audit/run_e2e_audit.js
```

---

## 2. Directory Structure

```
audit/
├── fixtures/
│   ├── test_video.mp4           # 7.6s 1280x720 synthetic MP4 test video with audio
│   ├── speech.mp3               # Synthetic TTS speech generated via edge-tts
│   ├── bgm.mp3                  # Synthetic BGM audio generated via FFmpeg
│   ├── sample.srt               # Clean test SRT subtitle file
│   ├── sample.vtt               # Clean test WebVTT subtitle file
│   ├── dub_track.wav            # Assembled multi-clip dubbing vocal track
│   ├── master_audio.wav         # Mixed master track with BGM ducking
│   ├── exported_output.mp4      # Final rendered dubbed MP4 video verified via ffprobe
│   └── audio/                   # Generated individual segment TTS MP3s
├── logs/
│   ├── dead_controls.json       # Method B: 547 control scans, DOM diffs, IPC calls, errors
│   └── e2e_audit.json           # Method C: pipeline results, ffprobe stream probes, subsystem tests
├── screenshots/
│   ├── state_1_No_Project.png           # Clean start screen (zero demo data)
│   ├── state_2_Video_Loaded_No_Subs.png # Video loaded empty state
│   ├── state_3_Subtitles_Present.png    # Populated table with timeline segments
│   ├── state_4_Translated_Dialogue.png  # Khmer translations in table rows
│   ├── state_5_Audio_Generated.png      # Dubbing ready state with audio indicators
│   ├── state_6_Modal_Settings.png       # Redesigned 9-section Settings modal
│   └── state_7_Modal_Export.png         # Export modal with resolution/preset options
├── profile/                             # Isolated throwaway user-data-dir (no real user data touched)
├── generate_fixtures.js                 # Fixture generation script
├── dead_control_scan.js                 # Method B runner script
├── run_e2e_audit.js                     # Method C runner script
├── run_audit.js                         # Master runner script
└── README.md                            # Documentation and rerun instructions
```

---

## 3. Safety & Isolation Guarantee

- **No modification to `src/`**: All application code remains intact. No production files were edited.
- **Isolated User Data Profile**: All runs enforce `--user-data-dir=audit/profile`. Real user settings, API keys, and existing projects in `%APPDATA%` are never read or overwritten.
- **Zero API Key Leakage**: No API keys are printed, logged, or recorded in any audit reports.
- **Zero Heavy Downloads**: Python whisper base model is cached locally under 150MB; no network downloads exceeded 500MB.

---

## 4. Summary of Audit Deliverables

1. `FEATURE_MAP.md`: Full static trace mapping UI controls -> event handlers -> IPC channels -> service implementations.
2. `FEATURE_STATUS.md`: Authoritative feature matrix with exact statuses (`WORKING`, `PARTIAL`, `STUB`, `BROKEN`, `COULD NOT TEST`), core workflow verdicts, dead control catalogs, top 10 problem root causes, and user requirements.
3. `audit/`: Complete reproducible testing package with logs, fixtures, screenshots, and runners.
