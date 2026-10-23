/**
 * Camb.ai TTS Provider
 * Connects to Camb.ai Studio API (MARS-8 / Mars-Flash AI Dubbing & Multilingual Neural Voice Model)
 * Supporting authentic Cambodian (Khmer) and global cinematic voice synthesis.
 */

const fs = require('fs');
const path = require('path');
const BaseTtsProvider = require('./base');
const settingsService = require('../../settings');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

// Curated high-fidelity Camb.ai voices with Khmer primary
const CURATED_CAMBAI_VOICES = [
  { name: '147320', short_name: '147320', voice_id: 147320, gender: 'Male', locale: 'km-KH', label: 'Camb.ai Khmer (Sophat - Male)' },
  { name: '147321', short_name: '147321', voice_id: 147321, gender: 'Female', locale: 'km-KH', label: 'Camb.ai Khmer (Kolab - Female)' },
  { name: '147322', short_name: '147322', voice_id: 147322, gender: 'Male', locale: 'km-KH', label: 'Camb.ai Khmer (Vannak - Cinema Male)' },
  { name: '147323', short_name: '147323', voice_id: 147323, gender: 'Female', locale: 'km-KH', label: 'Camb.ai Khmer (Bopha - Soft Female)' },
  { name: '147300', short_name: '147300', voice_id: 147300, gender: 'Female', locale: 'en-US', label: 'Camb.ai English (Elena - Female)' },
  { name: '147301', short_name: '147301', voice_id: 147301, gender: 'Male', locale: 'en-US', label: 'Camb.ai English (David - Male)' }
];

// Global Mutex & Pacing Queue for Camb.ai
// Camb.ai Starter/Free plans strictly enforce max_concurrent_api_requests_per_account = 1.
// All requests are serialized sequentially with a 300ms cool-down gap to prevent HTTP 429 concurrency_exceeded.
let cambAiGlobalMutex = Promise.resolve();

function serializeCambAiRequest(taskFn) {
  const previousMutex = cambAiGlobalMutex;
  let releaseSlot;
  cambAiGlobalMutex = new Promise((resolve) => {
    releaseSlot = resolve;
  });

  return (async () => {
    try {
      await previousMutex;
      return await taskFn();
    } finally {
      setTimeout(releaseSlot, 300);
    }
  })();
}

class CambAiTtsProvider extends BaseTtsProvider {
  constructor() {
    super('camb-ai');
    this.cachedVoices = null;
    this.apiBase = 'https://client.camb.ai/apis';
  }

  /**
   * List voices from Camb.ai account or fallback to curated list
   */
  async listVoices() {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    const settings = settingsService.get();
    const apiKey = (settings?.cambai?.apiKey || '').trim();

    if (apiKey) {
      try {
        logger.info('Fetching voice list from Camb.ai API...');
        const response = await fetch(`${this.apiBase}/list-voices`, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey
          }
        });

        if (response.ok) {
          const data = await response.json();
          const rawList = Array.isArray(data) ? data : (Array.isArray(data.payload) ? data.payload : (Array.isArray(data.data) ? data.data : []));

          if (rawList.length > 0) {
            const formatted = rawList.map(v => {
              const id = v.id || v.voice_id;
              const gender = v.gender === 1 || v.gender === 'female' || v.gender === 'Female' ? 'Female' : 'Male';
              const name = v.voice_name || v.name || `Voice ${id}`;
              const locale = v.language || 'km-KH';
              return {
                name: String(id),
                short_name: String(id),
                voice_id: Number(id),
                gender,
                locale,
                label: `${name} (${gender})`
              };
            });

            // Sort with Khmer first
            formatted.sort((a, b) => {
              const aKm = a.locale.includes('km') ? -1 : 1;
              const bKm = b.locale.includes('km') ? -1 : 1;
              if (aKm !== bKm) return aKm - bKm;
              return a.label.localeCompare(b.label);
            });

            this.cachedVoices = formatted;
            return formatted;
          }
        }
      } catch (err) {
        logger.warn(`Failed to fetch Camb.ai voices via API: ${err.message}. Using curated voices.`);
      }
    }

    this.cachedVoices = CURATED_CAMBAI_VOICES;
    return this.cachedVoices;
  }

  /**
   * Synthesize a single speech clip via Camb.ai streaming TTS API
   */
  async synthesizeClip({ text, voice, rate = '+0%', pitch = '+0Hz', volume = '+0%', outputPath, slotDuration = 1.0 }) {
    if (this.isCancelled) {
      throw new Error('TTS synthesis cancelled');
    }
    if (!text || !text.trim()) {
      throw new Error('Cannot synthesize empty text');
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if text has speakable characters
    const hasSpeakable = /[\u1780-\u17FFa-zA-Z0-9\u4e00-\u9fa5\u3040-\u30ff]/.test(text);
    if (!hasSpeakable) {
      const silentSec = Math.max(0.3, Math.min(2.0, Number(slotDuration) || 0.4));
      try {
        await ffmpegService.generateSilence(outputPath, silentSec);
        return {
          outputPath,
          duration: Math.round(silentSec * 100) / 100,
          status: 'success',
          silent: true
        };
      } catch (_) {}
    }

    const settings = settingsService.get();
    const cambaiConfig = settings?.cambai || {};
    const apiKey = (cambaiConfig.apiKey || '').trim();

    if (!apiKey) {
      logger.warn('Camb.ai API Key is not configured. Automatically falling back to Microsoft Edge-TTS...');
      const EdgeTtsProvider = require('./edge-tts');
      const edge = new EdgeTtsProvider();
      let fallbackVoice = 'km-KH-PisethNeural';
      if (voice && (String(voice).includes('147321') || String(voice).includes('147323') || String(voice).toLowerCase().includes('female'))) {
        fallbackVoice = 'km-KH-SreymomNeural';
      }
      return await edge.synthesizeClip({
        text,
        voice: fallbackVoice,
        rate,
        pitch,
        volume,
        outputPath,
        slotDuration
      });
    }

    // Resolve voice ID
    let voiceId = 147320;
    if (voice && !isNaN(Number(voice))) {
      voiceId = Number(voice);
    } else if (cambaiConfig.voiceId) {
      voiceId = Number(cambaiConfig.voiceId);
    }

    const isKhmer = /[\u1780-\u17FF]/.test(text);
    const language = isKhmer ? 'km-kh' : (cambaiConfig.language || 'km-kh');
    let speechModel = cambaiConfig.speechModel || 'mars-8.1-flash-beta';

    // Model compatibility normalization:
    // Only 'mars-8.1-flash-beta', 'mars-81-flash', 'mars-81', and 'mars-x-instruct' support Khmer ('km-kh').
    // Other models like 'mars-flash', 'mars-pro', 'mars-instruct', and 'mars-8' reject with HTTP 422 for Khmer.
    if (isKhmer) {
      if (speechModel === 'mars-flash' || speechModel === 'mars-8' || speechModel === 'mars-pro' || speechModel === 'mars-instruct') {
        speechModel = 'mars-8.1-flash-beta';
      }
    } else if (speechModel === 'mars-8') {
      speechModel = 'mars-81';
    }

    const audioFormat = outputPath.endsWith('.mp3') ? 'mp3' : 'wav';

    const maxRetries = 4;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      if (this.isCancelled) {
        throw new Error('TTS synthesis cancelled');
      }

      attempt++;
      try {
        logger.info(`Camb.ai TTS: Synthesizing clip with voice ${voiceId}, model ${speechModel}, attempt ${attempt}`);

        const buffer = await serializeCambAiRequest(async () => {
          const response = await fetch(`${this.apiBase}/tts-stream`, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: text.trim(),
              voice_id: voiceId,
              language,
              speech_model: speechModel,
              output_configuration: {
                format: audioFormat
              }
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            let msg = `HTTP ${response.status}`;
            let isConcurrencyExceeded = false;
            try {
              const errObj = JSON.parse(errText);
              if (errObj.payload?.error === 'concurrency_exceeded' || errObj.message === 'Too Many Requests' || response.status === 429) {
                isConcurrencyExceeded = true;
              }
              if (Array.isArray(errObj.detail)) {
                msg = errObj.detail.map(d => `${d.loc ? d.loc.join('.') : 'field'}: ${d.msg}`).join('; ');
              } else if (errObj.payload?.message) {
                msg = errObj.payload.message;
              } else if (errObj.message || errObj.error) {
                msg = errObj.message || errObj.error;
              } else if (typeof errObj.detail === 'string') {
                msg = errObj.detail;
              }
            } catch (_) {
              if (errText) msg = errText.slice(0, 150);
            }

            // If quota exhausted (402 Payment Required) or invalid key (401), don't waste time retrying
            const isFatalAuthOrCredit = response.status === 401 || response.status === 402 || /payment|insufficient credit|unauthorized|invalid key/i.test(msg);
            if (isFatalAuthOrCredit) {
              logger.warn(`Camb.ai fatal quota/auth error (${msg}). Instantly falling back to Microsoft Edge-TTS without retry.`);
              const fatalErr = new Error(`Camb.ai rejected: ${msg}`);
              fatalErr.isFatal = true;
              throw fatalErr;
            }

            const rejErr = new Error(`Camb.ai rejected: ${msg}`);
            rejErr.status = response.status;
            rejErr.isConcurrencyExceeded = isConcurrencyExceeded;
            throw rejErr;
          }

          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        });

        if (buffer.length < 100) {
          throw new Error('Received incomplete audio response from Camb.ai');
        }

        fs.writeFileSync(outputPath, buffer);

        let duration = 1.0;
        try {
          const meta = await ffmpegService.probeMedia(outputPath);
          duration = meta.duration || 1.0;
        } catch (_) {}

        return {
          outputPath,
          duration: Math.round(duration * 100) / 100,
          status: 'success'
        };
      } catch (err) {
        lastError = err;
        logger.warn(`Camb.ai TTS attempt ${attempt}/${maxRetries} failed: ${err.message}`);

        if (this.isCancelled) {
          throw new Error('TTS synthesis cancelled');
        }

        if (err.isFatal) {
          break;
        }

        if (attempt < maxRetries) {
          // If concurrency exceeded or rate limited (429), back off with generous cool-down
          const is429 = err.status === 429 || err.isConcurrencyExceeded || /too many requests|concurrency_exceeded/i.test(err.message);
          const backoff = is429 ? (1200 * attempt) : (Math.pow(attempt, 2) * 600);
          logger.info(`Camb.ai waiting ${backoff}ms before retry attempt ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    logger.warn(`Camb.ai synthesis failed after ${maxRetries} attempts (${lastError ? lastError.message : ''}). Automatically falling back to Microsoft Edge-TTS...`);
    try {
      const EdgeTtsProvider = require('./edge-tts');
      const edge = new EdgeTtsProvider();
      let fallbackVoice = 'km-KH-PisethNeural';
      if (voice && (String(voice).includes('147321') || String(voice).includes('147323') || String(voice).toLowerCase().includes('female'))) {
        fallbackVoice = 'km-KH-SreymomNeural';
      }
      return await edge.synthesizeClip({
        text,
        voice: fallbackVoice,
        rate,
        pitch,
        volume,
        outputPath,
        slotDuration
      });
    } catch (fallbackErr) {
      throw new Error(`Camb.ai synthesis failed (${lastError?.message}) and Edge-TTS fallback failed: ${fallbackErr.message}`);
    }
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = CambAiTtsProvider;
