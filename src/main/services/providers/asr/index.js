const FasterWhisperAsrProvider = require('./faster-whisper');
const GeminiAsrProvider = require('./gemini');
const HybridAsrProvider = require('./hybrid');
const MockAsrProvider = require('./mock');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class AsrService {
  constructor() {
    this.providers = {
      'faster-whisper': new FasterWhisperAsrProvider(),
      'gemini': new GeminiAsrProvider(),
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
    const engineName = options.engine || settings.asrEngine || 'faster-whisper';
    const provider = this.getProvider(engineName);
    this.currentProvider = provider;

    logger.info(`Running ASR with engine: ${provider.name} on ${audioPath}`);
    try {
      const segments = await provider.transcribe(audioPath, options, onProgress);
      return segments;
    } catch (err) {
      if (provider.name === 'gemini' && !this.isCancelled && (err.message.includes('quota') || err.message.includes('Quota') || err.message.includes('rate-limited') || err.message.includes('exhausted'))) {
        logger.warn(`Gemini ASR quota exhausted (${err.message}). Automatically falling back to Faster-Whisper (Local)...`);
        if (typeof onProgress === 'function') {
          onProgress({ percent: 10, message: 'Gemini quota reached. Auto-switching to Faster-Whisper (Local)...' });
        }
        try {
          const fallbackProvider = this.getProvider('faster-whisper');
          this.currentProvider = fallbackProvider;
          return await fallbackProvider.transcribe(audioPath, options, onProgress);
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
