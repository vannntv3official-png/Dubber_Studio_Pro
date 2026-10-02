# Privacy Policy — AI Dubbing Studio

Last Updated: October 2, 2026

AI Dubbing Studio is engineered with a strict **local-first, zero-telemetry** architecture. We respect your privacy and provide complete transparency regarding network activity and data storage.

---

## 1. Zero Telemetry & No Analytics

- **No Usage Tracking:** The application does not collect analytics, diagnostic pings, crash telemetry, user identifiers, or usage frequency statistics.
- **No Third-Party Trackers:** No tracking pixels, Google Analytics, Firebase, Sentry, or third-party monitoring SDKs are embedded in the software.
- **No Background Heartbeats:** The application does not contact remote servers in the background without explicit user action.

---

## 2. On-Device Local Processing

All media processing is conducted entirely on your local workstation by default:
- **Audio Extraction & Waveforms:** FFmpeg extracts audio and computes waveform peak data locally on your storage drive.
- **Speech Recognition (Faster-Whisper):** When using the default Faster-Whisper engine, transcription runs entirely on your local CPU or NVIDIA GPU. No audio is uploaded to the internet.
- **BGM / Vocal Separation (Demucs):** Separation runs on your local machine using PyTorch/Demucs neural networks.
- **Video Exporting & Ducking:** All timeline rendering, subtitle burning, and audio ducking mixing occur locally via bundled FFmpeg.

---

## 3. Explicit Remote Network Communications

Network connections occur **only** when specifically initiated by the user for the following features:

### A. Google Gemini API (Translation & Cloud ASR)
- **What is sent:** Subtitle text segments or audio snippets when the user initiates "Translate Subtitles" or selects "Gemini ASR".
- **Destination:** Google AI Studio official endpoints (`generativelanguage.googleapis.com`).
- **Authentication:** Your personal API key. Keys are encrypted at rest on your workstation using Electron's `safeStorage` (OS DPAPI on Windows) and are transmitted directly over HTTPS to Google.
- **Privacy Policy:** Governed by [Google Privacy Policy](https://policies.google.com/privacy).

### B. Microsoft Edge-TTS (Voice Synthesis)
- **What is sent:** Synthesized subtitle text phrases (e.g. Khmer sentences) and speech rate/pitch parameters.
- **Destination:** Microsoft Speech Services WebSocket endpoint.
- **Audio Return:** The synthesized MP3/WAV audio stream is downloaded directly to your local project cache directory.
- **Advisory:** Communicates over encrypted WSS connections to Microsoft's speech service.

### C. Faster-Whisper Model Downloads (First Run)
- **What is sent:** Standard HTTP GET requests to download model weights.
- **Destination:** Hugging Face model repository (`huggingface.co/Systran/faster-whisper-*`).
- **Data Stored:** Model weights are saved in your local user data directory and reused offline for all subsequent transcriptions.

---

## 4. Local Data & Log Storage

- **Project Data:** Saved locally in user-chosen directories (defaulting to the source video folder or `%USERPROFILE%/Documents/AI Dubbing Studio Projects`).
- **Application Logs:** Stored locally in `%APPDATA%/glass-app/logs/`. Logs record operational messages and errors.
- **Sanitization:** When using the "Export Diagnostics" function, all API keys (`AIzaSy...`) are automatically redacted before export.
