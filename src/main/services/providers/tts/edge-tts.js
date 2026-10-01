/**
 * Microsoft Edge-TTS Provider
 * Communicates with the Python sidecar running edge-tts.
 * Supports voice listing, audio clip synthesis, retry with exponential backoff, and caching.
 */

const fs = require('fs');
const path = require('path');
const BaseTtsProvider = require('./base');
const sidecarManager = require('../../sidecar-manager');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

class EdgeTtsProvider extends BaseTtsProvider {
  constructor() {
    super('edge-tts');
    this.cachedVoices = null;
    this.activeJobIds = new Set();
  }

  /**
   * List voices using edge-tts with in-memory caching
   */
  async listVoices() {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    try {
      logger.info('Fetching voice list from Python sidecar edge-tts...');
      const voices = await sidecarManager.sendRequest('list_voices', {}, 30000);
      if (Array.isArray(voices) && voices.length > 0) {
        // Sort Khmer voices first, then alphabetical by locale
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
      logger.error('Failed to query sidecar for voices', err);
    }

    // Default fallback voices if sidecar is offline
    return [
      { name: 'km-KH-PisethNeural', short_name: 'km-KH-PisethNeural', gender: 'Male', locale: 'km-KH' },
      { name: 'km-KH-SreymomNeural', short_name: 'km-KH-SreymomNeural', gender: 'Female', locale: 'km-KH' }
    ];
  }

  /**
   * Synthesize a single speech clip with retry & backoff
   */
  async synthesizeClip({ text, voice = 'km-KH-PisethNeural', rate = '+0%', pitch = '+0Hz', volume = '+0%', outputPath }) {
    if (this.isCancelled) {
      throw new Error('TTS synthesis cancelled');
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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
          voice,
          rate,
          pitch,
          volume,
          output_path: outputPath
        };

        const result = await sidecarManager.sendRequest('synthesize_tts', payload, 45000);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          // Probe actual duration of output file
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
          // Exponential backoff: 500ms, 1500ms, 3000ms
          const backoff = Math.pow(attempt, 2) * 500;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    throw new Error(`Edge-TTS synthesis failed after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = EdgeTtsProvider;
