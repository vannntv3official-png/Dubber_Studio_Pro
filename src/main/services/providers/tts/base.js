/**
 * Base Abstract TTS Provider
 * All TTS implementations (Edge-TTS, Mock, etc.) must implement this interface.
 */

class BaseTtsProvider {
  constructor(name) {
    this.name = name;
    this.isCancelled = false;
  }

  /**
   * Synthesize a single speech clip
   * @param {object} params
   * @param {string} params.text - Dialogue text to speak
   * @param {string} params.voice - Voice identifier (e.g. 'km-KH-PisethNeural')
   * @param {string} [params.rate='+0%'] - Speed rate adjustment (e.g. '+10%', '-5%')
   * @param {string} [params.pitch='+0Hz'] - Pitch adjustment (e.g. '+5Hz', '-4Hz')
   * @param {string} [params.volume='+0%'] - Volume adjustment
   * @param {string} params.outputPath - Target audio file path (.mp3 or .wav)
   * @returns {Promise<{ outputPath: string, duration?: number }>}
   */
  async synthesizeClip(params) {
    throw new Error('synthesizeClip() must be implemented by subclass');
  }

  /**
   * List available voices for this provider
   * @returns {Promise<Array<{ name: string, short_name: string, gender: string, locale: string }>>}
   */
  async listVoices() {
    throw new Error('listVoices() must be implemented by subclass');
  }

  cancel() {
    this.isCancelled = true;
  }

  reset() {
    this.isCancelled = false;
  }
}

module.exports = BaseTtsProvider;
