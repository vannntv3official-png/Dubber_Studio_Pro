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

    let lastPercent = 0;
    const progressWrapper = (prog) => {
      if (prog && prog.percent != null) {
        lastPercent = prog.percent;
      }
      if (typeof onProgress === 'function') {
        onProgress(prog);
      }
    };

    logger.info(`Running ASR with engine: ${provider.name} on ${audioPath}`);
    try {
      let segments = await provider.transcribe(audioPath, options, progressWrapper);

      // Apply smart splitting on Khmer & international punctuation (max 7s, max 90 chars)
      if (options.smartSplit !== false && Array.isArray(segments) && segments.length > 0) {
        segments = smartSplit(segments);
      }

      // Optional speaker acoustic classification (female / male / unknown)
      if (options.detectSpeakers === true && Array.isArray(segments) && segments.length > 0) {
        progressWrapper({ percent: 96, message: 'Classifying speaker voices (male/female)...' });
        segments = await speakerDetectionService.detectVoices(audioPath, segments, options);
      }

      if (lastPercent < 100) {
        progressWrapper({
          percent: 100,
          message: `Transcription complete: ${segments.length} segments recognized.`
        });
      }

      return segments;
    } catch (err) {
      if (provider.name === 'gemini' && !this.isCancelled && (err.message.includes('quota') || err.message.includes('Quota') || err.message.includes('rate-limited') || err.message.includes('exhausted'))) {
        logger.warn(`Gemini ASR quota exhausted (${err.message}). Automatically falling back to Faster-Whisper...`);
        progressWrapper({ percent: 10, message: 'Gemini quota reached. Auto-switching to Faster-Whisper (Local)...' });
        try {
          const fallbackProvider = this.getProvider('faster-whisper');
          this.currentProvider = fallbackProvider;
          let fallbackSegments = await fallbackProvider.transcribe(audioPath, options, progressWrapper);
          if (options.smartSplit !== false) {
            fallbackSegments = smartSplit(fallbackSegments);
          }
          if (lastPercent < 100) {
            progressWrapper({
              percent: 100,
              message: `Transcription complete: ${fallbackSegments.length} segments recognized.`
            });
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
