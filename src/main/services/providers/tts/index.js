/**
 * TTS Service Coordinator
 * Orchestrates voice presets, audio caching, concurrency limiting,
 * Auto-Fit tempo adjustments, Sync-End alignment, and progress streaming.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const EdgeTtsProvider = require('./edge-tts');
const MockTtsProvider = require('./mock');
const { calculateAutoFit, calculateSyncEnd } = require('../../timing/auto-fit');
const ffmpegService = require('../../ffmpeg');
const settingsService = require('../../settings');
const pronunciationService = require('../../pronunciation');
const logger = require('../../../utils/logger');

class TtsService {
  constructor() {
    this.providers = {
      'edge-tts': new EdgeTtsProvider(),
      'mock': new MockTtsProvider()
    };
    this.currentProvider = null;
    this.isCancelled = false;
  }

  getProvider(name) {
    const key = (name || '').toLowerCase();
    return this.providers[key] || this.providers['edge-tts'];
  }

  /**
   * Resolves the cache directory for TTS audio clips
   */
  getCacheDir(customDir = null) {
    if (customDir && fs.existsSync(customDir)) {
      const dir = path.join(customDir, 'tts-cache');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    }

    try {
      const settingsService = require('../../settings');
      const customCache = settingsService.get()?.general?.cacheFolder;
      if (customCache) {
        if (!fs.existsSync(customCache)) fs.mkdirSync(customCache, { recursive: true });
        return customCache;
      }
    } catch (_) {}

    let baseDir;
    try {
      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      } else {
        baseDir = path.join(__dirname, '../../../../.data');
      }
    } catch (_) {
      baseDir = path.join(__dirname, '../../../../.data');
    }

    const dir = path.join(baseDir, 'tts-cache');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Generates a deterministic hash for a speech request
   */
  computeHash(text, voice, rate, pitch, volume, dictHash = '') {
    const raw = `${text || ''}|${voice || ''}|${rate || ''}|${pitch || ''}|${volume || ''}|${dictHash || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Formats rate adjustment percentage
   * Combines preset rate and segment speed (e.g. speed 1.1x -> +10%)
   */
  computeEffectiveRate(presetRate = '+0%', segmentSpeed = 1.0) {
    let presetOffset = 0;
    const match = String(presetRate).match(/([+-]?\d+)/);
    if (match) presetOffset = parseInt(match[1], 10);

    const speedOffset = Math.round(((Number(segmentSpeed) || 1.0) - 1.0) * 100);
    const totalOffset = presetOffset + speedOffset;

    return (totalOffset >= 0 ? `+${totalOffset}%` : `${totalOffset}%`);
  }

  /**
   * Synthesize a single clip (or test phrase)
   */
  async synthesizeSingle({ text, voice, rate = '+0%', pitch = '+0Hz', volume = '+0%', engine = 'edge-tts', projectDir = null }) {
    const provider = this.getProvider(engine);
    const cacheDir = this.getCacheDir(projectDir);

    // Apply pronunciation dictionary replacements and include hash in cache key
    const spokenText = pronunciationService.apply(text, 'km');
    const dictHash = pronunciationService.getHash();
    const hash = this.computeHash(spokenText, voice, rate, pitch, volume, dictHash);
    const cachedPath = path.join(cacheDir, `${hash}.mp3`);

    // Check cache
    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 0) {
      let duration = 1.0;
      try {
        const meta = await ffmpegService.probeMedia(cachedPath);
        duration = meta.duration || 1.0;
      } catch (_) {}
      return {
        outputPath: cachedPath,
        duration,
        cached: true
      };
    }

    const result = await provider.synthesizeClip({
      text: spokenText,
      voice,
      rate,
      pitch,
      volume,
      outputPath: cachedPath
    });

    return result;
  }

  /**
   * List available voices
   */
  async listVoices(engine = 'edge-tts') {
    const provider = this.getProvider(engine);
    return await provider.listVoices();
  }

  /**
   * Synthesize a batch of subtitle segments with concurrency limiting and Auto-Fit
   *
   * @param {Array<object>} segments - Array of { id, s, e, t, v, sp }
   * @param {object} options - { engine, autoFitMode, syncEnd, projectDir, concurrency }
   * @param {function} onProgress - ({ current, total, percent, segmentId, status, duration, overflow })
   */
  async synthesizeBatch(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    const engine = options.engine || 'edge-tts';
    const provider = this.getProvider(engine);
    this.currentProvider = provider;
    provider.reset();

    const currentSettings = settingsService.get();
    const presets = currentSettings.voicePresets || {};
    const autoFitMode = options.autoFitMode || 'med';
    const syncEnd = options.syncEnd !== false;
    const cacheDir = this.getCacheDir(options.projectDir);
    const maxConcurrency = Math.min(8, Math.max(1, options.concurrency || currentSettings.concurrency || 4));

    logger.info(`Starting TTS Batch Synthesis: ${segments.length} segments, engine=${provider.name}, concurrency=${maxConcurrency}, autoFit=${autoFitMode}`);

    const results = [];
    let completedCount = 0;
    const total = segments.length;

    // Worker pool queue
    let queueIdx = 0;

    const processSegment = async (seg, idx) => {
      if (this.isCancelled) return null;

      const segId = seg.id;
      const rawText = (seg.t || '').trim();
      const text = pronunciationService.apply(rawText, 'km');
      const dictHash = pronunciationService.getHash();
      const slotDuration = Math.max(0.1, (Number(seg.e) || 0) - (Number(seg.s) || 0));

      if (!rawText) {
        completedCount++;
        return {
          id: segId,
          ok: false,
          error: 'Empty text'
        };
      }

      // Voice preset mapping
      // Voice indices 0..4 map to A1..A5
      const presetKeys = ['A1', 'A2', 'A3', 'A4', 'A5'];
      const presetKey = presetKeys[seg.v] || 'A1';
      const preset = presets[presetKey] || presets.A1 || {
        baseVoice: 'km-KH-PisethNeural',
        rate: '+0%',
        pitch: '+0Hz',
        volume: '+0%'
      };

      const voice = seg.customVoice || preset.baseVoice;
      const effectiveRate = this.computeEffectiveRate(preset.rate, seg.sp);
      const pitch = preset.pitch || '+0Hz';
      const volume = preset.volume || '+0%';

      const hash = this.computeHash(text, voice, effectiveRate, pitch, volume, dictHash);
      const rawAudioPath = path.join(cacheDir, `${hash}.mp3`);
      const fittedAudioPath = path.join(cacheDir, `${hash}_fitted.wav`);

      let audioPath = rawAudioPath;
      let rawDuration = 1.0;
      let wasCached = false;

      try {
        // Step 1: Synthesize or load from cache
        if (fs.existsSync(rawAudioPath) && fs.statSync(rawAudioPath).size > 0) {
          wasCached = true;
          try {
            const meta = await ffmpegService.probeMedia(rawAudioPath);
            rawDuration = meta.duration || 1.0;
          } catch (_) {}
        } else {
          const synRes = await provider.synthesizeClip({
            text,
            voice,
            rate: effectiveRate,
            pitch,
            volume,
            outputPath: rawAudioPath,
            slotDuration
          });
          rawDuration = synRes.duration || slotDuration;
        }

        if (this.isCancelled) return null;

        // Step 2: Auto-Fit Timing calculation
        const fit = calculateAutoFit({
          clipDuration: rawDuration,
          slotDuration,
          mode: autoFitMode,
          userSpeed: seg.sp || 1.0
        });

        // Step 3: Apply atempo retiming if tempo adjustment is needed
        let finalAudioPath = rawAudioPath;
        let finalDuration = rawDuration;

        if (fit.atempoChain.length > 0) {
          try {
            await ffmpegService.applyAtempo(rawAudioPath, fittedAudioPath, fit.appliedTempo);
            finalAudioPath = fittedAudioPath;
            finalDuration = fit.finalDuration;
          } catch (atempoErr) {
            logger.warn(`Failed to apply atempo for segment ${segId}: ${atempoErr.message}`);
          }
        }

        // Step 4: Sync End calculation
        const prevEnd = idx > 0 ? (Number(segments[idx - 1].e) || 0) : 0;
        const nextStart = idx < total - 1 ? (Number(segments[idx + 1].s) || null) : null;

        const sync = calculateSyncEnd({
          start: Number(seg.s) || 0,
          end: Number(seg.e) || 0,
          clipDuration: finalDuration,
          prevEnd,
          nextStart,
          syncEnd
        });

        completedCount++;
        const percent = Math.round((completedCount / total) * 100);

        const segResult = {
          id: segId,
          ok: true,
          audioPath: finalAudioPath,
          rawAudioPath,
          duration: finalDuration,
          rawDuration,
          overflow: fit.overflow,
          overflowDelta: fit.overflowDelta,
          appliedTempo: fit.appliedTempo,
          clipStart: sync.clipStart,
          clipEnd: sync.clipEnd,
          cached: wasCached
        };

        if (onProgress) {
          onProgress({
            current: completedCount,
            total,
            percent,
            segmentId: segId,
            status: fit.overflow ? 'overflow' : 'ready',
            duration: finalDuration,
            audioPath: finalAudioPath,
            overflow: fit.overflow,
            overflowDelta: fit.overflowDelta
          });
        }

        return segResult;
      } catch (err) {
        completedCount++;
        logger.error(`Synthesis failed for segment ${segId}: ${err.message}`);
        return {
          id: segId,
          ok: false,
          error: err.message
        };
      }
    };

    // Concurrency runner
    const workers = [];
    for (let w = 0; w < maxConcurrency; w++) {
      const worker = async () => {
        while (queueIdx < total && !this.isCancelled) {
          const curIdx = queueIdx++;
          const seg = segments[curIdx];
          const res = await processSegment(seg, curIdx);
          if (res) results.push(res);
        }
      };
      workers.push(worker());
    }

    try {
      await Promise.all(workers);
      results.sort((a, b) => a.id - b.id);
      logger.info(`Batch TTS completed: ${results.length}/${total} processed.`);
      return results;
    } finally {
      this.currentProvider = null;
    }
  }

  cancel() {
    this.isCancelled = true;
    if (this.currentProvider) {
      this.currentProvider.cancel();
    }
  }
}

const ttsService = new TtsService();
module.exports = ttsService;
