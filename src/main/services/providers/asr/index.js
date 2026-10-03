const FasterWhisperAsrProvider = require('./faster-whisper');
const GeminiAsrProvider = require('./gemini');
const GroqAsrProvider = require('./groq');
const HybridAsrProvider = require('./hybrid');
const MockAsrProvider = require('./mock');
const { smartSplit } = require('../../timing/smart-split');
const speakerDetectionService = require('./speaker-detect');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class AsrService {
  constructor() {
    this.providers = {
      'faster-whisper': new FasterWhisperAsrProvider(),
      'gemini': new GeminiAsrProvider(),
      'groq': new GroqAsrProvider(),
      'hybrid': new HybridAsrProvider(),
      'mock': new MockAsrProvider()
    };
    this.currentProvider = null;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['faster-whisper'];
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    const settings = settingsService.get();
    const engineName = options.engine || settings.asrEngine || settings.asr?.engine || 'gemini';
    const provider = this.getProvider(engineName);
    this.currentProvider = provider;

    logger.info(`Running ASR with engine: ${provider.name} on ${audioPath}`);
    try {
      let segments = await provider.transcribe(audioPath, options, onProgress);

      // Apply smart splitting on Khmer & international punctuation (max 7s, max 90 chars)
      if (options.smartSplit !== false && Array.isArray(segments) && segments.length > 0) {
        segments = smartSplit(segments);
      }

      // Optional speaker acoustic classification (female / male / unknown)
      if (options.detectSpeakers === true && Array.isArray(segments) && segments.length > 0) {
        if (typeof onProgress === 'function') {
          onProgress({ percent: 92, message: 'Classifying speaker voices (male/female)...' });
        }
        segments = await speakerDetectionService.detectVoices(audioPath, segments, options);
      }

      return segments;
    } catch (err) {
      if (provider.name === 'gemini' && !this.isCancelled && (err.message.includes('quota') || err.message.includes('Quota') || err.message.includes('rate-limited') || err.message.includes('exhausted'))) {
        logger.warn(`Gemini ASR quota exhausted (${err.message}). Automatically falling back to Faster-Whisper...`);
        if (typeof onProgress === 'function') {
          onProgress({ percent: 10, message: 'Gemini quota reached. Auto-switching to Faster-Whisper (Local)...' });
        }
        try {
          const fallbackProvider = this.getProvider('faster-whisper');
          this.currentProvider = fallbackProvider;
          let fallbackSegments = await fallbackProvider.transcribe(audioPath, options, onProgress);
          if (options.smartSplit !== false) {
            fallbackSegments = smartSplit(fallbackSegments);
          }
          return fallbackSegments;
        } catch (whisperErr) {
          logger.error(`Faster-Whisper fallback failed: ${whisperErr.message}`);
          throw new Error(`Gemini quota exhausted and Faster-Whisper fallback failed: ${whisperErr.message}`);
        }
      }
      throw err;
    } finally {
      this.currentProvider = null;
    }
  }

  cancel() {
    if (this.currentProvider) {
      logger.info(`Cancelling active ASR provider: ${this.currentProvider.name}`);
      this.currentProvider.cancel();
      this.currentProvider = null;
    }
  }
}

const asrService = new AsrService();
module.exports = asrService;
