const FasterWhisperAsrProvider = require('./faster-whisper');
const GeminiAsrProvider = require('./gemini');
const CodecraftAsrProvider = require('./codecraft');
const GroqAsrProvider = require('./groq');
const HybridAsrProvider = require('./hybrid');
const MockAsrProvider = require('./mock');
const { smartSplit } = require('../../timing/smart-split');
const { resolveOverlaps } = require('../../../../shared/subtitle-utils');
const speakerDetectionService = require('./speaker-detect');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class AsrService {
  constructor() {
    this.providers = {
      'faster-whisper': new FasterWhisperAsrProvider(),
      'gemini': new GeminiAsrProvider(),
      'codecraft': new CodecraftAsrProvider(),
      'groq': new GroqAsrProvider(),
      'hybrid': new HybridAsrProvider(),
      'mock': new MockAsrProvider()
    };
    this.currentProvider = null;
    this.isCancelled = false;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['faster-whisper'];
  }

  isGeminiFailoverEligible(err) {
    if (!err || !err.message) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes('quota') ||
      msg.includes('rate-limited') ||
      msg.includes('rate limit') ||
      msg.includes('rate_limit') ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('daily_quota_exhausted') ||
      msg.includes('no gemini api keys') ||
      msg.includes('api_key_invalid') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('exhausted') ||
      msg.includes('503') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('504') ||
      msg.includes('high demand') ||
      msg.includes('overloaded') ||
      msg.includes('cooldown') ||
      msg.includes('service unavailable') ||
      msg.includes('gateway timeout') ||
      msg.includes('fetch failed') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('socket hang up') ||
      msg.includes('aborterror') ||
      msg.includes('[gemini_network_timeout]')
    );
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const engineName = options.engine || settings.asr?.engine || settings.asrEngine || 'faster-whisper';
    const provider = this.getProvider(engineName);
    this.currentProvider = provider;

    let lastPercent = 0;
    const progressWrapper = (prog) => {
      if (this.isCancelled) return;
      if (prog && prog.percent != null) {
        lastPercent = prog.percent;
      }
      if (typeof onProgress === 'function') {
        onProgress(prog);
      }
    };

    logger.info(`Running ASR with engine: ${provider.name} on ${audioPath}`);
    try {
      if (this.isCancelled) throw new Error('Transcription cancelled by user.');
      let segments = await provider.transcribe(audioPath, options, progressWrapper);

      if (this.isCancelled) throw new Error('Transcription cancelled by user.');

      // Apply smart splitting on Khmer & international punctuation (max 7s, max 90 chars)
      if (options.smartSplit !== false && Array.isArray(segments) && segments.length > 0) {
        segments = smartSplit(segments);
      }

      // Automatically resolve any overlapping subtitle segment boundaries
      if (Array.isArray(segments) && segments.length > 1) {
        segments = resolveOverlaps(segments);
      }

      // Optional speaker acoustic classification (female / male / unknown)
      if (options.detectSpeakers === true && Array.isArray(segments) && segments.length > 0 && !this.isCancelled) {
        progressWrapper({ percent: 96, message: 'Classifying speaker voices (male/female)...' });
        segments = await speakerDetectionService.detectVoices(audioPath, segments, options);
      }

      if (this.isCancelled) throw new Error('Transcription cancelled by user.');

      if (lastPercent < 100) {
        progressWrapper({
          percent: 100,
          message: `Transcription complete: ${segments.length} segments recognized.`
        });
      }

      return segments;
    } catch (err) {
      if (this.isCancelled) {
        throw new Error('Transcription cancelled by user.');
      }
      if (provider.name === 'gemini' && !this.isCancelled && this.isGeminiFailoverEligible(err)) {
        const isTimeout = err.message && (err.message.includes('timeout') || err.message.includes('timed out') || err.message.includes('[GEMINI_NETWORK_TIMEOUT]'));
        // Option A: Try CodeCraft Cloud Whisper if configured
        const codecraftKeyPool = require('../../codecraft-pool');
        if (codecraftKeyPool.hasKeys() || settingsService.get()?.codecraft?.apiKey) {
          logger.warn(`Gemini ASR failed due to ${isTimeout ? 'Network / API Timeout' : 'Quota / Key limit'} (${err.message}). Auto-falling back to CodeCraft Cloud Whisper...`);
          progressWrapper({ percent: 12, message: `Gemini ${isTimeout ? 'network timeout' : 'quota limit'}. Auto-switching to CodeCraft Cloud Whisper...` });
          try {
            const ccProvider = this.getProvider('codecraft');
            this.currentProvider = ccProvider;
            let ccSegments = await ccProvider.transcribe(audioPath, options, progressWrapper);
            if (this.isCancelled) throw new Error('Transcription cancelled by user.');
            if (options.smartSplit !== false) ccSegments = smartSplit(ccSegments);
            if (Array.isArray(ccSegments) && ccSegments.length > 1) ccSegments = resolveOverlaps(ccSegments);
            return ccSegments;
          } catch (ccErr) {
            logger.warn(`CodeCraft ASR fallback failed (${ccErr.message}); falling back to local Faster-Whisper...`);
          }
        }

        logger.warn(`Gemini ASR failed due to ${isTimeout ? 'Network / API Timeout' : 'Quota / Key limit'} (${err.message}). Automatically falling back to Faster-Whisper...`);
        progressWrapper({ percent: 15, message: `Gemini ${isTimeout ? 'network timeout' : 'quota limit'}. Auto-switching to Faster-Whisper (Local)...` });
        try {
          const fallbackProvider = this.getProvider('faster-whisper');
          this.currentProvider = fallbackProvider;
          let fallbackSegments = await fallbackProvider.transcribe(audioPath, options, progressWrapper);
          if (this.isCancelled) throw new Error('Transcription cancelled by user.');
          if (options.smartSplit !== false) {
            fallbackSegments = smartSplit(fallbackSegments);
          }
          if (Array.isArray(fallbackSegments) && fallbackSegments.length > 1) {
            fallbackSegments = resolveOverlaps(fallbackSegments);
          }
          if (lastPercent < 100) {
            progressWrapper({
              percent: 100,
              message: `Transcription complete: ${fallbackSegments.length} segments recognized.`
            });
          }
          return fallbackSegments;
        } catch (whisperErr) {
          if (this.isCancelled) throw new Error('Transcription cancelled by user.');
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
    this.isCancelled = true;
    if (this.currentProvider) {
      logger.info(`Cancelling active ASR provider: ${this.currentProvider.name}`);
      try {
        this.currentProvider.cancel();
      } catch (err) {
        logger.warn(`Error cancelling ASR provider: ${err.message}`);
      }
      this.currentProvider = null;
    }
  }
}

const asrService = new AsrService();
module.exports = asrService;
