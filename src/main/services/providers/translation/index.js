const GeminiTranslationProvider = require('./gemini');
const CodecraftTranslationProvider = require('./codecraft');
const MockTranslationProvider = require('./mock');
const keyPool = require('../../key-pool');
const codecraftKeyPool = require('../../codecraft-pool');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class TranslationService {
  constructor() {
    this.providers = {
      'gemini': new GeminiTranslationProvider(),
      'codecraft': new CodecraftTranslationProvider(),
      'mock': new MockTranslationProvider()
    };
    this.currentProvider = null;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['gemini'];
  }

  async translate(segments, options = {}, onProgress = null) {
    const primaryEngine = (options.engine || 'gemini').toLowerCase();
    const provider = this.getProvider(primaryEngine);
    this.currentProvider = provider;

    logger.info(`Running Translation with engine: ${provider.name} for ${segments.length} segments`);
    try {
      const results = await provider.translate(segments, options, onProgress);
      return results;
    } catch (primaryErr) {
      if (provider.isCancelled) throw primaryErr;

      // Cross-engine auto-failover: Gemini <-> CodeCraft
      const isGeminiFailoverEligible = primaryEngine === 'gemini' && (
        // 1. Quota & Rate limits
        /quota|rate limit|cooling down|cooldown|429|resource_exhausted/i.test(primaryErr.message) ||
        // 2. Authentication & Key issues
        /No Gemini API keys|API key not valid|API_KEY_INVALID|PERMISSION_DENIED|ACCESS_TOKEN_TYPE_UNSUPPORTED|401|403/i.test(primaryErr.message) ||
        // 3. Network connection failures & DNS drops
        /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network|socket hang up|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT/i.test(primaryErr.message) ||
        // 4. API Timeouts & Abort errors
        /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|AbortError|aborted/i.test(primaryErr.message) ||
        // 5. Server outages & Overloads
        /500|502|503|504|Service Unavailable|Gateway Timeout|Bad Gateway|UNAVAILABLE|overloaded|Internal Server Error/i.test(primaryErr.message) ||
        // 6. Explicitly tagged errors
        primaryErr.message.includes('[GEMINI_NETWORK_TIMEOUT]') ||
        primaryErr.message.includes('[DAILY_QUOTA_EXHAUSTED]')
      );

      const isCodecraftFailoverEligible = primaryEngine === 'codecraft' && (
        /CodeCraft|cooling down|429|401|403|quota|timeout|timed out|network|fetch failed|ENOTFOUND|ECONNRESET|500|502|503|504/i.test(primaryErr.message)
      );

      if (isGeminiFailoverEligible && (codecraftKeyPool.hasKeys() || settingsService.get()?.codecraft?.apiKey)) {
        const failReason = /timeout|timed out|network|fetch failed|ENOTFOUND/i.test(primaryErr.message)
          ? 'Network / API Timeout'
          : 'Quota / Key limit';
        logger.warn(`Gemini translation failed due to ${failReason} (${primaryErr.message}). Automatically failing over to CodeCraft AI Gateway...`);
        if (typeof onProgress === 'function') {
          onProgress({ percent: 15, message: `Gemini ${failReason}. Auto-switching to CodeCraft AI Gateway...` });
        }
        try {
          const fallback = this.getProvider('codecraft');
          this.currentProvider = fallback;
          const fallbackOptions = { ...options, engine: 'codecraft' };
          delete fallbackOptions.model;
          const fallbackResults = await fallback.translate(segments, fallbackOptions, onProgress);
          return fallbackResults;
        } catch (fallbackErr) {
          logger.error(`CodeCraft fallback also failed: ${fallbackErr.message}`);
          throw new Error(`Gemini failed (${primaryErr.message}) and CodeCraft fallback failed: ${fallbackErr.message}`);
        }
      } else if (isCodecraftFailoverEligible && (keyPool.keys && keyPool.keys.length > 0)) {
        logger.warn(`CodeCraft translation failed (${primaryErr.message}). Automatically failing over to Google Gemini...`);
        if (typeof onProgress === 'function') {
          onProgress({ percent: 15, message: 'CodeCraft unavailable. Auto-switching to Google Gemini...' });
        }
        try {
          const fallback = this.getProvider('gemini');
          this.currentProvider = fallback;
          const fallbackOptions = { ...options, engine: 'gemini' };
          delete fallbackOptions.model;
          const fallbackResults = await fallback.translate(segments, fallbackOptions, onProgress);
          return fallbackResults;
        } catch (fallbackErr) {
          logger.error(`Gemini fallback also failed: ${fallbackErr.message}`);
          throw new Error(`CodeCraft failed (${primaryErr.message}) and Gemini fallback failed: ${fallbackErr.message}`);
        }
      }

      throw primaryErr;
    } finally {
      this.currentProvider = null;
    }
  }

  async condense(items, options = {}) {
    const primaryEngine = (options.engine || 'gemini').toLowerCase();
    const provider = this.getProvider(primaryEngine);
    this.currentProvider = provider;

    logger.info(`Running Condense with engine: ${provider.name} for ${Array.isArray(items) ? items.length : 1} items`);
    try {
      if (typeof provider.condense === 'function') {
        return await provider.condense(items, options);
      }
      throw new Error(`Provider ${provider.name} does not support condense()`);
    } catch (primaryErr) {
      if (provider.isCancelled) throw primaryErr;

      const isGeminiFailoverEligible = primaryEngine === 'gemini' && (
        /quota|rate limit|cooling down|cooldown|429|timeout|timed out|fetch failed|network|ECONNRESET|ENOTFOUND|500|502|503|504|GEMINI_NETWORK_TIMEOUT|No Gemini API keys|API key not valid|API_KEY_INVALID/i.test(primaryErr.message)
      );

      const isCodecraftFailoverEligible = primaryEngine === 'codecraft' && (
        /CodeCraft|cooling down|429|401|403|quota|timeout|timed out|network|fetch failed|ENOTFOUND|ECONNRESET|500|502|503|504/i.test(primaryErr.message)
      );

      // Failover condense to alternative engine
      if (isGeminiFailoverEligible && (codecraftKeyPool.hasKeys() || settingsService.get()?.codecraft?.apiKey)) {
        logger.warn(`Gemini condense failed (${primaryErr.message}). Failing over to CodeCraft AI...`);
        const fallback = this.getProvider('codecraft');
        this.currentProvider = fallback;
        const fallbackOptions = { ...options, engine: 'codecraft' };
        delete fallbackOptions.model;
        return await fallback.condense(items, fallbackOptions);
      } else if (isCodecraftFailoverEligible && keyPool.keys && keyPool.keys.length > 0) {
        logger.warn(`CodeCraft condense failed (${primaryErr.message}). Failing over to Gemini AI...`);
        const fallback = this.getProvider('gemini');
        this.currentProvider = fallback;
        const fallbackOptions = { ...options, engine: 'gemini' };
        delete fallbackOptions.model;
        return await fallback.condense(items, fallbackOptions);
      }
      throw primaryErr;
    } finally {
      this.currentProvider = null;
    }
  }

  cancel() {
    if (this.currentProvider) {
      logger.info(`Cancelling active translation provider: ${this.currentProvider.name}`);
      this.currentProvider.cancel();
      this.currentProvider = null;
    }
  }
}

const translationService = new TranslationService();
module.exports = translationService;
