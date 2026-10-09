const GeminiTranslationProvider = require('./gemini');
const MockTranslationProvider = require('./mock');
const logger = require('../../../utils/logger');

class TranslationService {
  constructor() {
    this.providers = {
      'gemini': new GeminiTranslationProvider(),
      'mock': new MockTranslationProvider()
    };
    this.currentProvider = null;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['gemini'];
  }

  async translate(segments, options = {}, onProgress = null) {
    const engineName = options.engine || 'gemini';
    const provider = this.getProvider(engineName);
    this.currentProvider = provider;

    logger.info(`Running Translation with engine: ${provider.name} for ${segments.length} segments`);
    try {
      const results = await provider.translate(segments, options, onProgress);
      return results;
    } finally {
      this.currentProvider = null;
    }
  }

  async condense(items, options = {}) {
    const engineName = options.engine || 'gemini';
    const provider = this.getProvider(engineName);
    this.currentProvider = provider;

    logger.info(`Running Condense with engine: ${provider.name} for ${Array.isArray(items) ? items.length : 1} items`);
    try {
      if (typeof provider.condense === 'function') {
        const results = await provider.condense(items, options);
        return results;
      }
      throw new Error(`Provider ${provider.name} does not support condense()`);
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
