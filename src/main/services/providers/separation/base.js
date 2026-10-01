/**
 * Base Abstract Separation Provider
 */

class BaseSeparationProvider {
  constructor(name) {
    this.name = name;
    this.isCancelled = false;
  }

  /**
   * Separate input audio file into vocals and accompaniment (BGM)
   * @param {string} audioPath - Input audio path
   * @param {string} outputDir - Directory to store separated stems
   * @param {function} onProgress - ({ percent, message })
   * @returns {Promise<{ vocalsPath: string, bgmPath: string }>}
   */
  async separate(audioPath, outputDir, onProgress = null) {
    throw new Error('separate() must be implemented by subclass');
  }

  cancel() {
    this.isCancelled = true;
  }

  reset() {
    this.isCancelled = false;
  }
}

module.exports = BaseSeparationProvider;
