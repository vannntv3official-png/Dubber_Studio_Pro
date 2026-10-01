class BaseTranslationProvider {
  constructor(name) {
    this.name = name;
    this.isCancelled = false;
  }

  /**
   * Translate segments
   * @param {Array<{id: number, text: string, start?: number, end?: number, speaker?: string, gender?: string}>} segments
   * @param {object} options - { targetLang, model, batchSize, glossary }
   * @param {function} onProgress - ({ current, total, percent, message })
   * @returns {Promise<Array<{id: number, translatedText: string}>>}
   */
  async translate(segments, options = {}, onProgress = null) {
    throw new Error('translate() must be implemented by subclass');
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = BaseTranslationProvider;
