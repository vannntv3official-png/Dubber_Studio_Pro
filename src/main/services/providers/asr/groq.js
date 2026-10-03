/**
 * Groq Whisper Cloud ASR Provider
 * Fast, cloud-based Whisper-large-v3-turbo transcription via Groq API.
 */

const fs = require('fs');
const BaseAsrProvider = require('./base');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

class GroqAsrProvider extends BaseAsrProvider {
  constructor() {
    super('groq');
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const apiKey = options.groqApiKey || settings.groqApiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error('Groq API key not configured. Please add your Groq API key in Settings.');
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileSize = fs.statSync(audioPath).size;
    logger.info(`Starting Groq Whisper ASR on ${audioPath} (${Math.round(fileSize / 1024)} KB)`);

    if (typeof onProgress === 'function') {
      onProgress({ percent: 15, message: 'Groq: Uploading speech audio...' });
    }

    const fileBuffer = fs.readFileSync(audioPath);
    const FormDataClass = globalThis.FormData || require('form-data');
    const BlobClass = globalThis.Blob || require('buffer').Blob;

    const formData = new FormDataClass();
    formData.set('file', new BlobClass([fileBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.set('model', 'whisper-large-v3-turbo');
    formData.set('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const language = options.language || settings.asr?.whisperLanguage || 'auto';
    if (language && language !== 'auto') {
      formData.set('language', language);
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 45, message: 'Groq: Transcribing with Whisper-large-v3-turbo...' });
    }

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Groq API HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error && parsed.error.message) {
          errorMsg = parsed.error.message;
        }
      } catch (_) {}
      throw new Error(`Groq transcription failed: ${errorMsg}`);
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
        confidence: 0.75,
        source: 'groq-whisper',
        vocalType: 'unknown'
      };
    });

    if (typeof onProgress === 'function') {
      onProgress({ percent: 100, message: `Groq: Transcribed ${segments.length} dialogue lines` });
    }

    return segments;
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = GroqAsrProvider;
