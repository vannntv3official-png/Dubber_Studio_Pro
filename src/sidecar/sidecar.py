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


def handle_list_voices(job_id, payload):
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


def handle_synthesize_tts(job_id, payload, cancel_event):
    text = payload.get("text", "")
    voice = payload.get("voice", "km-KH-PisethNeural")
    rate = payload.get("rate", "+0%")
    pitch = payload.get("pitch", "+0Hz")
    volume = payload.get("volume", "+0%")
    output_path = payload.get("output_path")

    if not text or not output_path:
        emit_error(job_id, "Missing text or output_path for TTS synthesis")
        return

    try:
        import edge_tts

        async def _synthesize():
            comm = edge_tts.Communicate(
                text=text,
                voice=voice,
                rate=rate,
                pitch=pitch,
                volume=volume
            )
            await comm.save(output_path)

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
