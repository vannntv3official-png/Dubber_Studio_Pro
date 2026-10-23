/**
 * Microsoft Edge-TTS Provider
 * Communicates with Python sidecar running edge-tts or uses built-in voice catalogs.
 * Supports comprehensive Khmer and international neural voices, retry with backoff, and caching.
 */

const fs = require('fs');
const path = require('path');
const BaseTtsProvider = require('./base');
const sidecarManager = require('../../sidecar-manager');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

// Curated list of high-quality Microsoft Edge Neural voices (Khmer + Popular Global)
const CURATED_EDGE_VOICES = [
  // Khmer Primary
  { name: 'km-KH-PisethNeural', short_name: 'km-KH-PisethNeural', gender: 'Male', locale: 'km-KH', label: 'Khmer (Piseth - Male)' },
  { name: 'km-KH-SreymomNeural', short_name: 'km-KH-SreymomNeural', gender: 'Female', locale: 'km-KH', label: 'Khmer (Sreymom - Female)' },

  // English
  { name: 'en-US-JennyNeural', short_name: 'en-US-JennyNeural', gender: 'Female', locale: 'en-US', label: 'English US (Jenny - Female)' },
  { name: 'en-US-GuyNeural', short_name: 'en-US-GuyNeural', gender: 'Male', locale: 'en-US', label: 'English US (Guy - Male)' },
  { name: 'en-US-AriaNeural', short_name: 'en-US-AriaNeural', gender: 'Female', locale: 'en-US', label: 'English US (Aria - Female)' },
  { name: 'en-US-ChristopherNeural', short_name: 'en-US-ChristopherNeural', gender: 'Male', locale: 'en-US', label: 'English US (Christopher - Male)' },
  { name: 'en-GB-SoniaNeural', short_name: 'en-GB-SoniaNeural', gender: 'Female', locale: 'en-GB', label: 'English UK (Sonia - Female)' },
  { name: 'en-GB-RyanNeural', short_name: 'en-GB-RyanNeural', gender: 'Male', locale: 'en-GB', label: 'English UK (Ryan - Male)' },

  // Southeast Asian
  { name: 'th-TH-PremwadeeNeural', short_name: 'th-TH-PremwadeeNeural', gender: 'Female', locale: 'th-TH', label: 'Thai (Premwadee - Female)' },
  { name: 'th-TH-NiwatNeural', short_name: 'th-TH-NiwatNeural', gender: 'Male', locale: 'th-TH', label: 'Thai (Niwat - Male)' },
  { name: 'vi-VN-HoaiMyNeural', short_name: 'vi-VN-HoaiMyNeural', gender: 'Female', locale: 'vi-VN', label: 'Vietnamese (HoaiMy - Female)' },
  { name: 'vi-VN-NamMinhNeural', short_name: 'vi-VN-NamMinhNeural', gender: 'Male', locale: 'vi-VN', label: 'Vietnamese (NamMinh - Male)' },
  { name: 'lo-LA-KeomanyNeural', short_name: 'lo-LA-KeomanyNeural', gender: 'Female', locale: 'lo-LA', label: 'Lao (Keomany - Female)' },
  { name: 'lo-LA-ChanthavongNeural', short_name: 'lo-LA-ChanthavongNeural', gender: 'Male', locale: 'lo-LA', label: 'Lao (Chanthavong - Male)' },
  { name: 'id-ID-GadisNeural', short_name: 'id-ID-GadisNeural', gender: 'Female', locale: 'id-ID', label: 'Indonesian (Gadis - Female)' },
  { name: 'id-ID-ArdiNeural', short_name: 'id-ID-ArdiNeural', gender: 'Male', locale: 'id-ID', label: 'Indonesian (Ardi - Male)' },

  // East Asian
  { name: 'zh-CN-XiaoxiaoNeural', short_name: 'zh-CN-XiaoxiaoNeural', gender: 'Female', locale: 'zh-CN', label: 'Chinese (Xiaoxiao - Female)' },
  { name: 'zh-CN-YunxiNeural', short_name: 'zh-CN-YunxiNeural', gender: 'Male', locale: 'zh-CN', label: 'Chinese (Yunxi - Male)' },
  { name: 'ja-JP-NanamiNeural', short_name: 'ja-JP-NanamiNeural', gender: 'Female', locale: 'ja-JP', label: 'Japanese (Nanami - Female)' },
  { name: 'ja-JP-KeitaNeural', short_name: 'ja-JP-KeitaNeural', gender: 'Male', locale: 'ja-JP', label: 'Japanese (Keita - Male)' },
  { name: 'ko-KR-SunHiNeural', short_name: 'ko-KR-SunHiNeural', gender: 'Female', locale: 'ko-KR', label: 'Korean (SunHi - Female)' },
  { name: 'ko-KR-InJoonNeural', short_name: 'ko-KR-InJoonNeural', gender: 'Male', locale: 'ko-KR', label: 'Korean (InJoon - Male)' },

  // European & Global
  { name: 'fr-FR-DeniseNeural', short_name: 'fr-FR-DeniseNeural', gender: 'Female', locale: 'fr-FR', label: 'French (Denise - Female)' },
  { name: 'fr-FR-HenriNeural', short_name: 'fr-FR-HenriNeural', gender: 'Male', locale: 'fr-FR', label: 'French (Henri - Male)' },
  { name: 'es-ES-ElviraNeural', short_name: 'es-ES-ElviraNeural', gender: 'Female', locale: 'es-ES', label: 'Spanish (Elvira - Female)' },
  { name: 'es-ES-AlvaroNeural', short_name: 'es-ES-AlvaroNeural', gender: 'Male', locale: 'es-ES', label: 'Spanish (Alvaro - Male)' },
  { name: 'de-DE-KatjaNeural', short_name: 'de-DE-KatjaNeural', gender: 'Female', locale: 'de-DE', label: 'German (Katja - Female)' },
  { name: 'de-DE-ConradNeural', short_name: 'de-DE-ConradNeural', gender: 'Male', locale: 'de-DE', label: 'German (Conrad - Male)' }
];

class EdgeTtsProvider extends BaseTtsProvider {
  constructor() {
    super('edge-tts');
    this.cachedVoices = null;
    this.activeJobIds = new Set();
  }

  /**
   * List voices using edge-tts with fallback to curated list
   */
  async listVoices() {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    try {
      logger.info('Fetching voice list from sidecar edge-tts...');
      const voices = await sidecarManager.sendRequest('list_voices', {}, 8000);
      if (Array.isArray(voices) && voices.length > 0) {
        voices.sort((a, b) => {
          const aKm = a.locale === 'km-KH' ? -1 : 1;
          const bKm = b.locale === 'km-KH' ? -1 : 1;
          if (aKm !== bKm) return aKm - bKm;
          return (a.short_name || '').localeCompare(b.short_name || '');
        });
        this.cachedVoices = voices;
        return voices;
      }
    } catch (err) {
      logger.warn(`Sidecar voice query unavailable (${err.message}); using built-in curated voice catalog.`);
    }

    this.cachedVoices = CURATED_EDGE_VOICES;
    return this.cachedVoices;
  }

  /**
   * Synthesize a single speech clip with retry & backoff
   */
  async synthesizeClip({ text, voice = 'km-KH-PisethNeural', rate = '+0%', pitch = '+0Hz', volume = '+0%', outputPath, slotDuration = 1.0 }) {
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

    // Check if text has speakable characters (Khmer, letters, numbers, or CJK)
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

    // Normalize rate, pitch, volume to exact Edge-TTS syntax
    const cleanRate = this._normalizeRate(rate);
    const cleanPitch = this._normalizePitch(pitch);
    const cleanVolume = this._normalizeVolume(volume);

    // Guard against numeric Camb.ai voice IDs or invalid voices passed to Edge-TTS
    let cleanVoice = voice;
    if (!cleanVoice || typeof cleanVoice !== 'string' || !cleanVoice.includes('-')) {
      const vStr = String(cleanVoice || '');
      if (vStr.includes('147321') || vStr.includes('147323') || vStr.toLowerCase().includes('female') || vStr.toLowerCase().includes('sreymom')) {
        cleanVoice = 'km-KH-SreymomNeural';
      } else {
        cleanVoice = 'km-KH-PisethNeural';
      }
    }

    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      if (this.isCancelled) {
        throw new Error('TTS synthesis cancelled');
      }

      attempt++;
      try {
        const payload = {
          text,
          voice: cleanVoice,
          rate: cleanRate,
          pitch: cleanPitch,
          volume: cleanVolume,
          output_path: outputPath
        };

        await sidecarManager.sendRequest('synthesize_tts', payload, 45000);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
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
        } else {
          throw new Error('Synthesized audio file was not written to disk');
        }
      } catch (err) {
        lastError = err;
        logger.warn(`TTS attempt ${attempt}/${maxRetries} failed: ${err.message}`);

        if (this.isCancelled) {
          throw new Error('TTS synthesis cancelled');
        }

        if (attempt < maxRetries) {
          const backoff = Math.pow(attempt, 2) * 500;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    throw new Error(`Edge-TTS synthesis failed after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
  }

  _normalizeRate(rate) {
    if (rate == null) return '+0%';
    const m = String(rate).match(/([+-]?\d+)/);
    if (!m) return '+0%';
    const val = Math.max(-100, Math.min(200, parseInt(m[1], 10)));
    return val >= 0 ? `+${val}%` : `${val}%`;
  }

  _normalizePitch(pitch) {
    if (pitch == null) return '+0Hz';
    const m = String(pitch).match(/([+-]?\d+)/);
    if (!m) return '+0Hz';
    const val = Math.max(-100, Math.min(100, parseInt(m[1], 10)));
    return val >= 0 ? `+${val}Hz` : `${val}Hz`;
  }

  _normalizeVolume(volume) {
    if (volume == null) return '+0%';
    const m = String(volume).match(/([+-]?\d+)/);
    if (!m) return '+0%';
    const val = Math.max(-100, Math.min(100, parseInt(m[1], 10)));
    return val >= 0 ? `+${val}%` : `${val}%`;
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = EdgeTtsProvider;
