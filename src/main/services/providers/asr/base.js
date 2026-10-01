class BaseAsrProvider {
  constructor(name) {
    this.name = name;
    this.isCancelled = false;
  }

  /**
   * Transcribe an audio file
   * @param {string} audioPath - Path to 16kHz mono WAV file
   * @param {object} options - Options (language, model, etc.)
   * @param {function} onProgress - Progress callback ({ percent, message })
   * @returns {Promise<Array<{id: number, start: number, end: number, text: string, speaker: string, gender: string}>>}
   */
  async transcribe(audioPath, options = {}, onProgress = null) {
    throw new Error('transcribe() must be implemented by subclass');
  }

  cancel() {
    this.isCancelled = true;
  }
}

module.exports = BaseAsrProvider;
