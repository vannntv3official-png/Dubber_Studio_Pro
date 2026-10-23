const BaseAsrProvider = require('./base');
const sidecarManager = require('../../sidecar-manager');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class FasterWhisperAsrProvider extends BaseAsrProvider {
  constructor() {
    super('faster-whisper');
    this.activeJobId = null;
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();

    const modelSize = options.modelSize || settings.asr?.whisperModel || settings.whisperModel || 'base';
    const device = options.device || settings.asr?.whisperDevice || settings.whisperDevice || 'auto';
    const computeType = options.computeType || settings.asr?.whisperComputeType || settings.whisperComputeType || 'auto';
    const language = options.language || settings.asr?.whisperLanguage || settings.whisperLanguage || 'auto';
    const beamSize = options.beamSize || settings.asr?.beamSize || 5;
    const downloadRoot = options.downloadRoot || settingsService.getModelsDir();

    logger.info(`Starting Faster-Whisper ASR: model=${modelSize}, device=${device}, lang=${language}`);

    if (typeof onProgress === 'function') {
      onProgress({ percent: 5, message: `Faster-Whisper: Initializing ${modelSize} model...` });
    }

    const payload = {
      audio_path: audioPath,
      model_size: modelSize,
      device: device,
      compute_type: computeType,
      language: language === 'auto' ? null : language,
      beam_size: beamSize,
      vad_filter: options.vadFilter !== false,
      download_root: downloadRoot
    };

    this.activeJobId = `whisper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await sidecarManager.transcribeWhisper(payload, (prog) => {
        if (typeof onProgress === 'function') {
          onProgress(prog);
        }
      }, this.activeJobId);

      if (this.isCancelled || (res && res.cancelled)) {
        throw new Error('Transcription cancelled by user.');
      }

      if (!res || !Array.isArray(res.segments)) {
        throw new Error('Faster-Whisper returned invalid result format');
      }

      logger.info(`Faster-Whisper finished: ${res.segments.length} segments, lang: ${res.detected_language}`);
      return res.segments;
    } finally {
      this.activeJobId = null;
    }
  }

  cancel() {
    this.isCancelled = true;
    if (this.activeJobId) {
      sidecarManager.cancel(this.activeJobId);
      this.activeJobId = null;
    }
  }
}

module.exports = FasterWhisperAsrProvider;
