"""
AI Dubbing Studio - Python Sidecar
Handles Faster-Whisper local ASR, Edge-TTS synthesis, and hardware detection.
Communicates with Electron main process via newline-delimited JSON over stdin/stdout.
"""

import sys
import os
import json
import asyncio
import threading
import traceback
import wave
from concurrent.futures import ThreadPoolExecutor

# Reconfigure stdout/stdin to UTF-8 and line buffering
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8', line_buffering=True)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True, write_through=True)

# Global print lock for thread-safe JSON-line output
stdout_lock = threading.Lock()
active_jobs = {}  # job_id -> threading.Event (cancellation)
cached_models = {}  # cache loaded WhisperModel instances by key (model_size, device, compute_type)


def emit(data):
    """Emit a JSON message to stdout."""
    line = json.dumps(data, ensure_ascii=False)
    with stdout_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def emit_progress(job_id, percent, message=""):
    emit({
        "id": job_id,
        "type": "progress",
        "progress": percent,
        "message": message
    })


def emit_result(job_id, result):
    emit({
        "id": job_id,
        "type": "result",
        "data": result
    })


def emit_error(job_id, error_message, details=""):
    emit({
        "id": job_id,
        "type": "error",
        "error": error_message,
        "details": details
    })


def emit_cancelled(job_id):
    emit({
        "id": job_id,
        "type": "cancelled"
    })


# -------------------------------------------------------------
# Handlers
# -------------------------------------------------------------

def handle_ping(job_id, payload):
    emit_result(job_id, {
        "status": "ok",
        "python": sys.version,
        "platform": sys.platform
    })


_cached_hardware = None

def get_hardware_info():
    global _cached_hardware
    if _cached_hardware is not None:
        return _cached_hardware
    try:
        import torch
        cuda_avail = torch.cuda.is_available()
        gpu_info = []
        if cuda_avail:
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                gpu_info.append({
                    "index": i,
                    "name": props.name,
                    "total_memory_mb": round(props.total_memory / (1024 * 1024)),
                    "capability": f"{props.major}.{props.minor}"
                })

        cpu_threads = os.cpu_count() or 4
        recommended_device = "cuda" if cuda_avail else "cpu"
        recommended_compute_type = "float16" if cuda_avail else "int8"

        _cached_hardware = {
            "cuda_available": cuda_avail,
            "device_count": len(gpu_info),
            "gpus": gpu_info,
            "cpu_threads": cpu_threads,
            "recommended_device": recommended_device,
            "recommended_compute_type": recommended_compute_type
        }
    except Exception as e:
        _cached_hardware = {
            "cuda_available": False,
            "device_count": 0,
            "gpus": [],
            "cpu_threads": os.cpu_count() or 4,
            "recommended_device": "cpu",
            "recommended_compute_type": "int8",
            "error": str(e)
        }
    return _cached_hardware


def handle_detect_hardware(job_id, payload):
    try:
        hw = get_hardware_info()
        emit_result(job_id, hw)
    except Exception as e:
        emit_error(job_id, f"Hardware detection failed: {str(e)}", traceback.format_exc())


MMS_VOICE_CATALOG = [
    {"name": "facebook/mms-tts-khm", "short_name": "facebook/mms-tts-khm", "gender": "Female", "locale": "km-KH", "label": "Khmer (MMS Neural - Female)"},
    {"name": "facebook/mms-tts-eng", "short_name": "facebook/mms-tts-eng", "gender": "Female", "locale": "en-US", "label": "English (MMS Neural)"},
    {"name": "facebook/mms-tts-tha", "short_name": "facebook/mms-tts-tha", "gender": "Female", "locale": "th-TH", "label": "Thai (MMS Neural)"},
    {"name": "facebook/mms-tts-vie", "short_name": "facebook/mms-tts-vie", "gender": "Female", "locale": "vi-VN", "label": "Vietnamese (MMS Neural)"},
    {"name": "facebook/mms-tts-lao", "short_name": "facebook/mms-tts-lao", "gender": "Female", "locale": "lo-LA", "label": "Lao (MMS Neural)"},
    {"name": "facebook/mms-tts-zho", "short_name": "facebook/mms-tts-zho", "gender": "Female", "locale": "zh-CN", "label": "Chinese (MMS Neural)"},
    {"name": "facebook/mms-tts-jpn", "short_name": "facebook/mms-tts-jpn", "gender": "Female", "locale": "ja-JP", "label": "Japanese (MMS Neural)"},
    {"name": "facebook/mms-tts-kor", "short_name": "facebook/mms-tts-kor", "gender": "Female", "locale": "ko-KR", "label": "Korean (MMS Neural)"},
    {"name": "facebook/mms-tts-fra", "short_name": "facebook/mms-tts-fra", "gender": "Female", "locale": "fr-FR", "label": "French (MMS Neural)"},
    {"name": "facebook/mms-tts-spa", "short_name": "facebook/mms-tts-spa", "gender": "Female", "locale": "es-ES", "label": "Spanish (MMS Neural)"},
    {"name": "facebook/mms-tts-deu", "short_name": "facebook/mms-tts-deu", "gender": "Female", "locale": "de-DE", "label": "German (MMS Neural)"}
]


def handle_list_voices(job_id, payload):
    engine = payload.get("engine", "")
    if engine in ["mms-tts", "facebook/mms-tts"]:
        emit_result(job_id, MMS_VOICE_CATALOG)
        return

    try:
        import edge_tts
        voices = asyncio.run(edge_tts.list_voices())
        # Filter and structure voice info
        voice_list = []
        for v in voices:
            voice_list.append({
                "name": v.get("Name", ""),
                "short_name": v.get("ShortName", ""),
                "gender": v.get("Gender", "Unknown"),
                "locale": v.get("Locale", ""),
                "suggested_codec": v.get("SuggestedCodec", "")
            })
        emit_result(job_id, voice_list)
    except Exception as e:
        emit_error(job_id, f"Failed to list voices: {str(e)}", traceback.format_exc())


def get_audio_duration_seconds(file_path):
    """Read WAV file duration in seconds."""
    try:
        with wave.open(file_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate > 0:
                return frames / float(rate)
    except Exception:
        pass
    return None


def handle_download_model(job_id, payload, cancel_event):
    model_size = payload.get("model_size", "base")
    download_root = payload.get("download_root", None)
    
    emit_progress(job_id, 5, f"Initializing download for faster-whisper-{model_size}...")

    try:
        from huggingface_hub import snapshot_download
        repo_id = f"Systran/faster-whisper-{model_size}"

        emit_progress(job_id, 20, f"Connecting to repository {repo_id}...")

        # Perform snapshot download
        # Note: snapshot_download checks local cache automatically
        snapshot_download(
            repo_id=repo_id,
            local_dir=download_root,
            local_dir_use_symlinks=False,
            resume_download=True
        )

        if cancel_event.is_set():
            emit_cancelled(job_id)
            return

        emit_progress(job_id, 100, f"Model {model_size} ready.")
        emit_result(job_id, {"model_size": model_size, "status": "ready"})
    except Exception as e:
        emit_error(job_id, f"Model download failed: {str(e)}", traceback.format_exc())


def handle_transcribe_whisper(job_id, payload, cancel_event):
    audio_path = payload.get("audio_path")
    model_size = payload.get("model_size", "base")
    device = payload.get("device", "auto")
    compute_type = payload.get("compute_type", "auto")
    language = payload.get("language", None)
    beam_size = payload.get("beam_size", 5)
    vad_filter = payload.get("vad_filter", True)
    download_root = payload.get("download_root", None)

    if not audio_path or not os.path.exists(audio_path):
        emit_error(job_id, f"Audio file not found: {audio_path}")
        return

    emit_progress(job_id, 5, "Preparing Faster-Whisper model...")

    try:
        from faster_whisper import WhisperModel
        import torch

        # Resolve auto device and compute type
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if compute_type == "auto":
            compute_type = "float16" if device == "cuda" else "int8"

        cache_key = f"{model_size}_{device}_{compute_type}_{download_root}"
        if cache_key in cached_models:
            model = cached_models[cache_key]
        else:
            emit_progress(job_id, 10, f"Loading model {model_size} on {device} ({compute_type})...")
            model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                download_root=download_root
            )
            cached_models[cache_key] = model

        if cancel_event.is_set():
            emit_cancelled(job_id)
            return

        emit_progress(job_id, 25, "Analyzing audio...")
        total_duration = get_audio_duration_seconds(audio_path) or 1.0

        lang_arg = language if (language and language != "auto") else None

        segments_generator, info = model.transcribe(
            audio_path,
            beam_size=beam_size,
            vad_filter=vad_filter,
            language=lang_arg,
            word_timestamps=True
        )

        segments = []
        seg_id = 1

        for seg in segments_generator:
            if cancel_event.is_set():
                emit_cancelled(job_id)
                return

            text = seg.text.strip()
            if text:
                segments.append({
                    "id": seg_id,
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": text,
                    "speaker": "unknown",
                    "gender": "unknown"
                })
                seg_id += 1

            if total_duration > 0:
                prog = min(98, max(25, int(25 + (seg.end / total_duration) * 73)))
                emit_progress(job_id, prog, f"Transcribing ({round(seg.end, 1)}s / {round(total_duration, 1)}s)...")

        emit_progress(job_id, 100, "Transcription complete.")
        emit_result(job_id, {
            "segments": segments,
            "detected_language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 3)
        })

    except Exception as e:
        emit_error(job_id, f"Transcription error: {str(e)}", traceback.format_exc())


def sanitize_edge_tts_text(text):
    if not text:
        return ""
    import html
    import re
    # Unescape existing HTML entities
    cleaned = html.unescape(text)
    # Remove XML / HTML tags that corrupt edge-tts SSML
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
    # Remove non-printable control characters
    cleaned = "".join(ch for ch in cleaned if ch in "\t\n\r" or ord(ch) >= 32)
    # Normalize multiple whitespace
    cleaned = re.sub(r'[ \t]+', ' ', cleaned).strip()
    return cleaned


def normalize_edge_tts_rate(rate):
    import re
    if not rate:
        return "+0%"
    m = re.search(r'([+-]?\d+)', str(rate))
    if not m:
        return "+0%"
    val = max(-100, min(200, int(m.group(1))))
    return f"+{val}%" if val >= 0 else f"{val}%"


def normalize_edge_tts_pitch(pitch):
    import re
    if not pitch:
        return "+0Hz"
    m = re.search(r'([+-]?\d+)', str(pitch))
    if not m:
        return "+0Hz"
    val = max(-100, min(100, int(m.group(1))))
    return f"+{val}Hz" if val >= 0 else f"{val}Hz"


def normalize_edge_tts_volume(volume):
    import re
    if not volume:
        return "+0%"
    m = re.search(r'([+-]?\d+)', str(volume))
    if not m:
        return "+0%"
    val = max(-100, min(100, int(m.group(1))))
    return f"+{val}%" if val >= 0 else f"{val}%"


def handle_synthesize_tts(job_id, payload, cancel_event):
    raw_text = payload.get("text", "")
    voice = payload.get("voice", "km-KH-PisethNeural")

    # Guard against invalid or foreign numeric voice IDs (e.g. Camb.ai 147320 passed to Edge-TTS)
    if not voice or not isinstance(voice, str) or "-" not in str(voice):
        v_str = str(voice or "")
        if "147321" in v_str or "147323" in v_str or "female" in v_str.lower() or "sreymom" in v_str.lower():
            voice = "km-KH-SreymomNeural"
        else:
            voice = "km-KH-PisethNeural"

    rate = normalize_edge_tts_rate(payload.get("rate", "+0%"))
    pitch = normalize_edge_tts_pitch(payload.get("pitch", "+0Hz"))
    volume = normalize_edge_tts_volume(payload.get("volume", "+0%"))
    output_path = payload.get("output_path")

    if not raw_text or not output_path:
        emit_error(job_id, "Missing text or output_path for TTS synthesis")
        return

    clean_text = sanitize_edge_tts_text(raw_text)
    if not clean_text:
        emit_error(job_id, "Text is empty after sanitization")
        return

    try:
        import edge_tts

        async def _synthesize():
            last_err = None
            for attempt in range(1, 4):
                if cancel_event.is_set():
                    return
                try:
                    comm = edge_tts.Communicate(
                        text=clean_text,
                        voice=voice,
                        rate=rate,
                        pitch=pitch,
                        volume=volume
                    )
                    await comm.save(output_path)
                    if os.path.exists(output_path) and os.path.getsize(output_path) > 50:
                        return
                except Exception as exc:
                    last_err = exc
                    if attempt < 3 and not cancel_event.is_set():
                        await asyncio.sleep(0.4 * attempt)

            if last_err:
                raise last_err

        asyncio.run(_synthesize())

        if cancel_event.is_set():
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            emit_cancelled(job_id)
            return

        emit_result(job_id, {
            "output_path": output_path,
            "status": "success"
        })
    except Exception as e:
        emit_error(job_id, f"TTS synthesis error: {str(e)}", traceback.format_exc())


mms_models_cache = {}


def get_mms_model(model_name):
    if model_name in mms_models_cache:
        return mms_models_cache[model_name]
    from transformers import VitsModel, AutoTokenizer
    # Ensure model starts with facebook/mms-tts if short form was given
    if not model_name.startswith("facebook/mms-tts"):
        if model_name.startswith("mms-tts"):
            model_name = "facebook/" + model_name
        else:
            model_name = "facebook/mms-tts-khm"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = VitsModel.from_pretrained(model_name)
    mms_models_cache[model_name] = (tokenizer, model)
    return tokenizer, model


def handle_synthesize_mms_tts(job_id, payload, cancel_event):
    text = payload.get("text", "")
    voice = payload.get("voice", "facebook/mms-tts-khm")
    rate = payload.get("rate", "+0%")
    pitch = payload.get("pitch", "+0Hz")
    volume = payload.get("volume", "+0%")
    output_path = payload.get("output_path")

    if not text or not output_path:
        emit_error(job_id, "Missing text or output_path for MMS-TTS synthesis")
        return

    # Map legacy voice or non-mms voice if passed
    if "piseth" in voice.lower() or "sreymom" in voice.lower() or voice.startswith("km-"):
        voice = "facebook/mms-tts-khm"
    elif voice.startswith("en-"):
        voice = "facebook/mms-tts-eng"
    elif voice.startswith("th-"):
        voice = "facebook/mms-tts-tha"
    elif voice.startswith("vi-"):
        voice = "facebook/mms-tts-vie"
    elif not voice.startswith("facebook/"):
        voice = f"facebook/{voice}" if voice.startswith("mms-tts") else "facebook/mms-tts-khm"

    try:
        import torch
        import soundfile as sf
        import re

        tokenizer, model = get_mms_model(voice)

        # Parse speaking rate
        rate_val = 0
        match = re.search(r'([+-]?\d+)', str(rate))
        if match:
            rate_val = int(match.group(1))
        # VITS speaking_rate: 1.0 is normal, 1.2 is 20% faster, 0.8 is 20% slower
        speed_factor = max(0.5, min(2.0, 1.0 + (rate_val / 100.0)))
        model.speaking_rate = speed_factor

        inputs = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            output = model(**inputs).waveform

        waveform = output.squeeze().cpu().numpy()
        sample_rate = model.config.sampling_rate

        # Volume adjustment
        vol_match = re.search(r'([+-]?\d+)', str(volume))
        if vol_match:
            vol_val = int(vol_match.group(1))
            if vol_val != 0:
                scale = max(0.1, 1.0 + (vol_val / 100.0))
                waveform = waveform * scale

        if cancel_event.is_set():
            emit_cancelled(job_id)
            return

        # Ensure directory exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        if output_path.lower().endswith(".mp3"):
            try:
                sf.write(output_path, waveform, sample_rate, format="MP3")
            except Exception:
                wav_temp = output_path.replace(".mp3", ".wav")
                sf.write(wav_temp, waveform, sample_rate)
                if wav_temp != output_path and os.path.exists(wav_temp):
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    os.rename(wav_temp, output_path)
        else:
            sf.write(output_path, waveform, sample_rate)

        if cancel_event.is_set():
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            emit_cancelled(job_id)
            return

        emit_result(job_id, {
            "output_path": output_path,
            "status": "success"
        })
    except Exception as e:
        emit_error(job_id, f"MMS-TTS synthesis error: {str(e)}", traceback.format_exc())


# -------------------------------------------------------------
# Main Stdin Dispatcher
# -------------------------------------------------------------

executor = ThreadPoolExecutor(max_workers=4)


def dispatch(data):
    job_id = data.get("id")
    action = data.get("action")
    payload = data.get("payload", {})

    if not job_id or not action:
        emit({"error": "Missing id or action in request"})
        return

    if action == "cancel":
        target_id = payload.get("target_id") or job_id
        if target_id in active_jobs:
            active_jobs[target_id].set()
            emit_cancelled(target_id)
        return

    cancel_event = threading.Event()
    active_jobs[job_id] = cancel_event

    def worker():
        try:
            if action == "ping":
                handle_ping(job_id, payload)
            elif action == "detect_hardware":
                handle_detect_hardware(job_id, payload)
            elif action == "list_voices":
                handle_list_voices(job_id, payload)
            elif action == "download_model":
                handle_download_model(job_id, payload, cancel_event)
            elif action == "transcribe_whisper":
                handle_transcribe_whisper(job_id, payload, cancel_event)
            elif action == "synthesize_tts":
                handle_synthesize_tts(job_id, payload, cancel_event)
            elif action == "synthesize_mms_tts":
                handle_synthesize_mms_tts(job_id, payload, cancel_event)
            else:
                emit_error(job_id, f"Unknown action: {action}")
        except Exception as exc:
            emit_error(job_id, f"Worker unhandled error: {str(exc)}", traceback.format_exc())
        finally:
            active_jobs.pop(job_id, None)

    executor.submit(worker)


def main():
    # Pre-warm hardware detection on main thread to avoid Windows DLL loader lock
    hw = get_hardware_info()
    # Notify ready with hardware details
    emit({"event": "ready", "version": "1.0.0", "hardware": hw})

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            dispatch(data)
        except json.JSONDecodeError as je:
            emit({"error": f"Invalid JSON received: {str(je)}"})
        except Exception as e:
            emit({"error": f"Sidecar loop exception: {str(e)}", "details": traceback.format_exc()})


if __name__ == "__main__":
    main()
