/**
 * CodeCraft Cloud Whisper ASR Provider
 * Connects to CodeCraft API (OpenAI-compatible gateway at https://codecraftapi.com/v1)
 * providing cloud speech recognition using Whisper models with overlap resolution.
 */

const fs = require('fs');
const BaseAsrProvider = require('./base');
const settingsService = require('../../settings');
const codecraftKeyPool = require('../../codecraft-pool');
const { resolveOverlaps } = require('../../../../shared/subtitle-utils');
const logger = require('../../../utils/logger');

class CodecraftAsrProvider extends BaseAsrProvider {
  constructor() {
    super('codecraft');
    this.abortController = null;
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    this.abortController = new AbortController();

    const settings = settingsService.get();
    const config = settings.codecraft || {};

    let apiKey = (options.apiKey || config.apiKey || '').trim();
    if (!apiKey && codecraftKeyPool.hasKeys()) {
      try {
        apiKey = codecraftKeyPool.getNextKey();
      } catch (_) {}
    }
    if (!apiKey) {
      throw new Error('CodeCraft API Key not configured. Please add your CodeCraft API key in Settings.');
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found for ASR: ${audioPath}`);
    }

    const rawBaseUrl = (options.baseUrl || config.baseUrl || 'https://codecraftapi.com/v1').trim();
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/audio/transcriptions`;
    const model = (options.model || config.asrModel || 'whisper-1').trim();

    const ffmpegService = require('../../ffmpeg');
    const path = require('path');
    const os = require('os');

    const fileSize = fs.statSync(audioPath).size;
    let uploadPath = audioPath;
    let tempMp3 = null;

    if (fileSize > 20 * 1024 * 1024 || !audioPath.toLowerCase().endsWith('.mp3')) {
      tempMp3 = path.join(os.tmpdir(), `cc_asr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
      try {
        if (typeof onProgress === 'function') {
          onProgress({ percent: 10, message: 'CodeCraft ASR: Optimizing audio payload...' });
        }
        await ffmpegService.sliceAndCompressAudio(audioPath, tempMp3, 0, null);
        if (fs.existsSync(tempMp3) && fs.statSync(tempMp3).size > 0) {
          uploadPath = tempMp3;
        }
      } catch (compErr) {
        logger.warn(`Could not pre-compress audio for CodeCraft: ${compErr.message}; using original audio.`);
      }
    }

    try {
      const uploadSize = fs.statSync(uploadPath).size;
      logger.info(`Starting CodeCraft Whisper ASR on ${uploadPath} (${Math.round(uploadSize / 1024)} KB) with model '${model}' via ${endpoint}`);

      if (typeof onProgress === 'function') {
        onProgress({ percent: 25, message: 'CodeCraft ASR: Uploading audio stream...' });
      }

      const fileBuffer = fs.readFileSync(uploadPath);
      const FormDataClass = globalThis.FormData || require('form-data');
      const BlobClass = globalThis.Blob || require('buffer').Blob;
      const isMp3 = uploadPath.toLowerCase().endsWith('.mp3');

      const formData = new FormDataClass();
      formData.set('file', new BlobClass([fileBuffer], { type: isMp3 ? 'audio/mp3' : 'audio/wav' }), isMp3 ? 'audio.mp3' : 'audio.wav');
      formData.set('model', model);
      formData.set('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      const language = options.language || settings.asr?.whisperLanguage || 'auto';
      if (language && language !== 'auto') {
        formData.set('language', language);
      }

      if (typeof onProgress === 'function') {
        onProgress({ percent: 50, message: `CodeCraft: Transcribing speech with ${model}...` });
      }

      const timeoutMs = 60000;
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        timeoutController.abort(new Error(`CodeCraft ASR request timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
      }

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          body: formData,
          signal: timeoutController.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error && parsed.error.message) {
          errorMsg = parsed.error.message;
        }
      } catch (_) {
        if (errorText) errorMsg = errorText.slice(0, 200);
      }
      throw new Error(`CodeCraft Whisper transcription failed: ${errorMsg}`);
    }

    const data = await response.json();
    const rawSegments = data.segments || [];

    if (rawSegments.length === 0 && data.text) {
      rawSegments.push({
        id: 0,
        start: 0,
        end: Math.round(data.duration || 5),
        text: data.text.trim()
      });
    }

    if (rawSegments.length === 0) {
      throw new Error('No spoken dialogue found in this audio file.');
    }

    const segments = rawSegments.map((seg, idx) => {
      const text = (seg.text || '').trim();
      const startSec = Math.max(0, Number(seg.start) || 0);
      const endSec = Math.max(startSec + 0.1, Number(seg.end) || (startSec + 1));
      const startMs = Math.round(startSec * 1000);
      const endMs = Math.round(endSec * 1000);

      return {
        id: `seg_${idx + 1}`,
        start: startSec,
        end: endSec,
        startMs,
        endMs,
        text,
        sourceText: text,
        confidence: 0.85,
        source: 'codecraft-whisper',
        vocalType: 'unknown'
      };
    });

    // Auto-resolve any potential overlaps
    const cleanSegments = resolveOverlaps(segments);

    if (typeof onProgress === 'function') {
      onProgress({ percent: 100, message: `CodeCraft: Transcribed ${cleanSegments.length} dialogue lines` });
    }

    return cleanSegments;
    } finally {
      if (tempMp3 && fs.existsSync(tempMp3)) {
        try { fs.unlinkSync(tempMp3); } catch (_) {}
      }
    }
  }

  cancel() {
    this.isCancelled = true;
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (_) {}
    }
  }
}

module.exports = CodecraftAsrProvider;
