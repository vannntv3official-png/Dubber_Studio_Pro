/**
 * Mock TTS Provider
 * Produces synthetic tone audio files via FFmpeg for fast, 100% offline verification & tests.
 */

const fs = require('fs');
const path = require('path');
const BaseTtsProvider = require('./base');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

const MOCK_VOICES = [
  { name: 'km-KH-PisethNeural', short_name: 'km-KH-PisethNeural', gender: 'Male', locale: 'km-KH' },
  { name: 'km-KH-SreymomNeural', short_name: 'km-KH-SreymomNeural', gender: 'Female', locale: 'km-KH' },
  { name: 'en-US-GuyNeural', short_name: 'en-US-GuyNeural', gender: 'Male', locale: 'en-US' },
  { name: 'en-US-JennyNeural', short_name: 'en-US-JennyNeural', gender: 'Female', locale: 'en-US' },
  { name: 'th-TH-NiwatNeural', short_name: 'th-TH-NiwatNeural', gender: 'Male', locale: 'th-TH' },
  { name: 'th-TH-PremwadeeNeural', short_name: 'th-TH-PremwadeeNeural', gender: 'Female', locale: 'th-TH' }
];

class MockTtsProvider extends BaseTtsProvider {
  constructor() {
    super('mock');
  }

  async listVoices() {
    return [...MOCK_VOICES];
  }

  async synthesizeClip({ text, voice = 'km-KH-PisethNeural', rate = '+0%', pitch = '+0Hz', outputPath, slotDuration = null }) {
    if (this.isCancelled) {
      throw new Error('TTS synthesis cancelled');
    }

    // Determine pitch / frequency based on gender / voice
    const isFemale = voice.toLowerCase().includes('sreymom') || voice.toLowerCase().includes('female') || voice.toLowerCase().includes('jenny');
    let freq = isFemale ? 340 : 220;

    // Apply pitch offset if specified
    const pitchMatch = String(pitch).match(/([+-]?\d+)/);
    if (pitchMatch) {
      freq += parseInt(pitchMatch[1], 10) * 10;
    }

    // Estimate duration from character count (~12 Khmer characters / sec)
    let duration = 1.0;
    if (text && text.trim().length > 0) {
      // Natural speech duration estimation (~12 chars/sec)
      duration = Math.max(0.6, Math.round((text.trim().length / 12) * 100) / 100);
    } else if (slotDuration && slotDuration > 0) {
      duration = slotDuration;
    }

    // Apply speed rate modifier if specified
    const rateMatch = String(rate).match(/([+-]?\d+)/);
    if (rateMatch) {
      const pct = parseInt(rateMatch[1], 10);
      const factor = 1.0 + (pct / 100);
      if (factor > 0.2) {
        duration = Math.max(0.2, duration / factor);
      }
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Produce synthetic audio file
    await ffmpegService.generateSineTone(outputPath, duration, freq);

    return {
      outputPath,
      duration: Math.round(duration * 100) / 100,
      status: 'success'
    };
  }
}

module.exports = MockTtsProvider;
