# Third-Party Notices & Licenses

AI Dubbing Studio PRO incorporates and redistributes open-source software, fonts, icons, and services subject to their respective licenses and terms.

---

## 1. Open-Source Software Components

### FFmpeg and FFprobe
- **Distribution:** Packaged via `ffmpeg-static` and `ffprobe-static` (gyan.dev Windows builds).
- **License:** GNU Lesser General Public License (LGPL) version 2.1 or later (or GNU General Public License version 3 if compiled with GPL-enabled filters like libx264).
- **Notice:** FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project. The source code of FFmpeg can be obtained from https://ffmpeg.org/.
- **Legal Review Flag:** Depending on the exact build configuration of `ffmpeg-static` (LGPL vs GPL build with x264/x265), redistributing binaries may trigger GPL obligations. Commercial distributors must ensure compliance with LGPL/GPL source offering requirements.

### Faster-Whisper & CTranslate2
- **Origin:** SYSTRAN / OpenNMT
- **License:** MIT License
- **Notice:** Copyright (c) 2023 SYSTRAN. Faster-Whisper is a reimplementation of OpenAI's Whisper model using CTranslate2, a fast inference engine for Transformer models.

### OpenAI Whisper Model Weights
- **Origin:** OpenAI
- **License:** MIT License
- **Notice:** The Whisper model checkpoints and weights distributed via Hugging Face (`Systran/faster-whisper-*`) are licensed under the MIT License.

### Demucs (Audio Source Separation)
- **Origin:** Meta AI Research
- **License:** MIT License
- **Notice:** Copyright (c) Meta Platforms, Inc. and affiliates. Used for music/vocal separation.

### Edge-TTS
- **Origin:** rany2 / edge-tts
- **License:** GNU General Public License v3.0 (GPLv3)
- **Service Dependency Notice:** Edge-TTS communicates with Microsoft's Speech Synthesis service via an unofficial online WebSocket protocol.
- **Important Advisory:** This service is an unofficial online interface provided without warranty. Microsoft may alter, throttle, or terminate this endpoint at any time. Users must ensure their usage adheres to applicable laws.

### Electron & Chromium Framework
- **Origin:** OpenJS Foundation / Google LLC
- **License:** MIT License / BSD-style License
- **Notice:** Copyright (c) Electron contributors and Chromium authors.

### Noto Sans Khmer Font
- **Origin:** Google Fonts
- **License:** SIL Open Font License, Version 1.1 (OFL-1.1)
- **Notice:** Copyright 2022 The Noto Project Authors (https://github.com/notofonts/khmer).

### Lucide Icons
- **Origin:** Lucide Project
- **License:** ISC License
- **Notice:** Copyright (c) Lucide Contributors.

---

## 2. API Terms & User Responsibility Notice

### Gemini API Terms
- Gemini API functionality operates exclusively using the user's personal API keys.
- All requests submitted to Google Gemini endpoints are subject to Google's Terms of Service and the Google AI Studio Terms of Service.
- The application stores API keys locally in encrypted form using OS safeStorage and never transmits keys to any party other than Google's official endpoints.

### Copyright & Intellectual Property Responsibilities
- **USER RESPONSIBILITY NOTICE:** Users are strictly and solely responsible for verifying that they hold the necessary rights, licenses, or authorizations to import, transcribe, translate, alter, dub, and export any video or audio media processed by this application.
- The creators and distributors of AI Dubbing Studio disclaim all liability for unauthorized reproduction or infringement of copyrighted works.
