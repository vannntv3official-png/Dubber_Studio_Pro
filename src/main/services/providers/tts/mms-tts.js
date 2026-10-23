/**
 * Meta Facebook MMS-TTS Provider
 * Uses Massively Multilingual Speech (VITS) models from Meta AI (e.g. facebook/mms-tts-khm).
 * Runs locally via Python sidecar using Transformers & PyTorch.
 */

const fs = require('fs');
const path = require('path');
const BaseTtsProvider = require('./base');
const sidecarManager = require('../../sidecar-manager');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

// Curated list of Facebook MMS-TTS neural voices
const CURATED_MMS_VOICES = [
  // Khmer Primary
  { name: 'facebook/mms-tts-khm', short_name: 'facebook/mms-tts-khm', gender: 'Female', locale: 'km-KH', label: 'Khmer (MMS Neural - Female)' },

  // English & Regional
  { name: 'facebook/mms-tts-eng', short_name: 'facebook/mms-tts-eng', gender: 'Female', locale: 'en-US', label: 'English (MMS Neural)' },
  { name: 'facebook/mms-tts-tha', short_name: 'facebook/mms-tts-tha', gender: 'Female', locale: 'th-TH', label: 'Thai (MMS Neural)' },
  { name: 'facebook/mms-tts-vie', short_name: 'facebook/mms-tts-vie', gender: 'Female', locale: 'vi-VN', label: 'Vietnamese (MMS Neural)' },
  { name: 'facebook/mms-tts-lao', short_name: 'facebook/mms-tts-lao', gender: 'Female', locale: 'lo-LA', label: 'Lao (MMS Neural)' },
  { name: 'facebook/mms-tts-zho', short_name: 'facebook/mms-tts-zho', gender: 'Female', locale: 'zh-CN', label: 'Chinese (MMS Neural)' },
  { name: 'facebook/mms-tts-jpn', short_name: 'facebook/mms-tts-jpn', gender: 'Female', locale: 'ja-JP', label: 'Japanese (MMS Neural)' },
  { name: 'facebook/mms-tts-kor', short_name: 'facebook/mms-tts-kor', gender: 'Female', locale: 'ko-KR', label: 'Korean (MMS Neural)' },
  { name: 'facebook/mms-tts-fra', short_name: 'facebook/mms-tts-fra', gender: 'Female', locale: 'fr-FR', label: 'French (MMS Neural)' },
  { name: 'facebook/mms-tts-spa', short_name: 'facebook/mms-tts-spa', gender: 'Female', locale: 'es-ES', label: 'Spanish (MMS Neural)' },
  { name: 'facebook/mms-tts-deu', short_name: 'facebook/mms-tts-deu', gender: 'Female', locale: 'de-DE', label: 'German (MMS Neural)' }
];

class MmsTtsProvider extends BaseTtsProvider {
  constructor() {
    super('facebook/mms-tts');
    this.cachedVoices = null;
  }

  /**
   * List voices using sidecar or fallback to curated list
   */
  async listVoices() {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    try {
      logger.info('Fetching MMS voice list from sidecar...');
      const voices = await sidecarManager.sendRequest('list_voices', { engine: 'mms-tts' }, 8000);
      if (Array.isArray(voices) && voices.length > 0) {
        this.cachedVoices = voices;
        return voices;
      }
    } catch (err) {
      logger.warn(`Sidecar MMS voice query unavailable (${err.message}); using built-in catalog.`);
    }

    this.cachedVoices = CURATED_MMS_VOICES;
    return this.cachedVoices;
  }

  /**
   * Synthesize a single speech clip via sidecar MMS-TTS
   */
  async synthesizeClip({ text, voice = 'facebook/mms-tts-khm', rate = '+0%', pitch = '+0Hz', volume = '+0%', outputPath }) {
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

    // Normalize voice identifier if needed
    let effectiveVoice = voice;
    if (effectiveVoice.includes('Piseth') || effectiveVoice.includes('Sreymom') || effectiveVoice.startsWith('km-')) {
      effectiveVoice = 'facebook/mms-tts-khm';
    } else if (effectiveVoice.startsWith('en-')) {
      effectiveVoice = 'facebook/mms-tts-eng';
    } else if (!effectiveVoice.startsWith('facebook/')) {
      effectiveVoice = effectiveVoice.startsWith('mms-tts') ? `facebook/${effectiveVoice}` : 'facebook/mms-tts-khm';
    }

    const maxRetries = 2;
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
          voice: effectiveVoice,
          rate,
          pitch,
          volume,
          output_path: outputPath
        };

        await sidecarManager.synthesizeMmsTts(payload, null);

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
        logger.warn(`MMS-TTS attempt ${attempt}/${maxRetries} failed: ${err.message}`);

        if (this.isCancelled) {
          throw new Error('TTS synthesis cancelled');
        }

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    throw new Error(`MMS-TTS synthesis failed after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = MmsTtsProvider;
