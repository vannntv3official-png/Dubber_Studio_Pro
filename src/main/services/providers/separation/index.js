/**
 * Audio Separation Service Coordinator
 */

const MockSeparationProvider = require('./mock');
const DemucsSeparationProvider = require('./local');
const logger = require('../../../utils/logger');

class SeparationService {
  constructor() {
    this.providers = {
      'mock': new MockSeparationProvider(),
      'demucs': new DemucsSeparationProvider()
    };
    this.activeProvider = null;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['demucs'];
  }

  async separate(audioPath, outputDir, options = {}, onProgress = null) {
    const engine = options.engine || 'demucs';
    const provider = this.getProvider(engine);
    this.activeProvider = provider;
    provider.reset();

    logger.info(`Starting audio separation with engine: ${provider.name}`);
    try {
      return await provider.separate(audioPath, outputDir, onProgress);
    } finally {
      this.activeProvider = null;
    }
  }

  cancel() {
    if (this.activeProvider) {
      this.activeProvider.cancel();
    }
  }
}

const separationService = new SeparationService();
module.exports = separationService;
