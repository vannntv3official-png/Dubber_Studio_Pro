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
const CambAiTtsProvider = require('./camb-ai');
const MmsTtsProvider = require('./mms-tts');
const MockTtsProvider = require('./mock');
const { calculateAutoFit, calculateSyncEnd } = require('../../timing/auto-fit');
const ffmpegService = require('../../ffmpeg');
const settingsService = require('../../settings');
const pronunciationService = require('../../pronunciation');
const logger = require('../../../utils/logger');

class TtsService {
  constructor() {
    const mmsProvider = new MmsTtsProvider();
    const cambaiProvider = new CambAiTtsProvider();
    this.providers = {
      'edge-tts': new EdgeTtsProvider(),
      'camb-ai': cambaiProvider,
      'cambai': cambaiProvider,
      'camb.ai': cambaiProvider,
      'facebook/mms-tts': mmsProvider,
      'mms-tts': mmsProvider,
      'mock': new MockTtsProvider()
    };
    this.currentProvider = null;
    this.isCancelled = false;
  }

  getProvider(name) {
    const key = (name || settingsService.get()?.tts?.engine || 'edge-tts').toLowerCase();
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
   * Estimates natural speech duration and predicts native neural rate for Edge-TTS.
   * Direct neural speedup preserves authentic vocal timbre and prosody, avoiding
   * the robotic or metallic phase-vocoder artifacts of heavy FFmpeg atempo chaining.
   */
  computeSmartNeuralRate(text, slotDuration, presetRate = '+0%', segmentSpeed = 1.0, autoFitMode = 'med') {
    let baseOffset = 0;
    const match = String(presetRate).match(/([+-]?\d+)/);
    if (match) baseOffset = parseInt(match[1], 10);
    const userSpeedOffset = Math.round(((Number(segmentSpeed) || 1.0) - 1.0) * 100);

    let totalOffset = baseOffset + userSpeedOffset;

    if (autoFitMode !== 'off' && slotDuration > 0 && text) {
      const isKhmer = /[\u1780-\u17FF]/.test(text);
      const visibleChars = [...text.replace(/\s+/g, '')].length;
      const charsPerSec = isKhmer ? 13.0 : 15.0;
      const estimatedSec = Math.max(0.5, visibleChars / charsPerSec);

      if (estimatedSec > slotDuration * 1.05) {
        const neededMultiplier = estimatedSec / slotDuration;
        const maxRateMultiplier = autoFitMode === 'low' ? 1.15 : (autoFitMode === 'high' ? 1.50 : 1.30);
        const clampedMultiplier = Math.min(maxRateMultiplier, neededMultiplier);
        const autoSpeedOffset = Math.round((clampedMultiplier - 1.0) * 100);
        totalOffset += autoSpeedOffset;
      }
    }

    totalOffset = Math.max(-50, Math.min(100, totalOffset));
    return (totalOffset >= 0 ? `+${totalOffset}%` : `${totalOffset}%`);
  }

  /**
   * Smooths Khmer text pacing for Edge-TTS by ensuring natural breathing pauses
   * at phrase boundaries. Prevents monotone breathless rushing.
   */
  smoothKhmerPacing(text) {
    if (!text || typeof text !== 'string') return text;
    if (!/[\u1780-\u17FF]/.test(text)) return text;

    let smoothed = text.trim().replace(/\s+/g, ' ');
    const hasPunctuation = /[។៕!?,、]/.test(smoothed);
    if (!hasPunctuation && smoothed.length > 28) {
      smoothed = smoothed.replace(/(.{10,38}?)\s*(ហើយ|ប៉ុន្តែ|ពីព្រោះ|ព្រោះ|ដូច្នេះ|បន្ទាប់មក|ប្រសិនបើ|បើ|ទោះបី|ចំណែក|រីឯ|ម៉្យាងទៀត|ដូចនេះ)/gu, '$1, $2');
    }
    return smoothed;
  }

  /**
   * Synthesize a single clip (or test phrase)
   */
  async synthesizeSingle({ text, voice, rate = '+0%', pitch = '+0Hz', volume = '+0%', engine = null, projectDir = null }) {
    if (!text || !text.trim()) {
      throw new Error('Cannot synthesize empty text');
    }
    let effectiveEngine = engine || settingsService.get()?.tts?.engine || 'edge-tts';
    let provider = this.getProvider(effectiveEngine);

    if (provider.name === 'camb-ai') {
      const cambApiKey = (settingsService.get()?.cambai?.apiKey || '').trim();
      if (!cambApiKey) {
        logger.warn('Camb.ai single preview requested but no API key configured. Auto-falling back to Microsoft Edge-TTS...');
        provider = this.getProvider('edge-tts');
        effectiveEngine = 'edge-tts';
      }
    }

    let clipVoice = voice;
    const isCambVoice = /^(147\d{3}|[0-9]{5,8})$/.test(String(clipVoice || '').trim());

    if (provider.name === 'edge-tts') {
      if (isCambVoice || !clipVoice || !String(clipVoice).includes('-')) {
        const isFemale = String(clipVoice).includes('147321') || String(clipVoice).includes('147323') || String(clipVoice).toLowerCase().includes('female') || String(clipVoice).toLowerCase().includes('sreymom');
        clipVoice = isFemale ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
      }
    } else if (provider.name === 'camb-ai') {
      if (String(clipVoice).includes('km-KH') || !isCambVoice) {
        const isFemale = String(clipVoice).toLowerCase().includes('sreymom') || String(clipVoice).toLowerCase().includes('female');
        clipVoice = isFemale ? 147321 : 147320;
      }
    }

    const cacheDir = this.getCacheDir(projectDir);

    // Apply Khmer natural pacing and pronunciation dictionary replacements
    const smoothedText = this.smoothKhmerPacing(text);
    const spokenText = pronunciationService.apply(smoothedText, 'km');
    const dictHash = pronunciationService.getHash();
    const hash = this.computeHash(spokenText, clipVoice, rate, pitch, volume, dictHash);
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
      voice: clipVoice,
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
  async listVoices(engine = null) {
    const effectiveEngine = engine || settingsService.get()?.tts?.engine || 'edge-tts';
    const provider = this.getProvider(effectiveEngine);
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
    let engine = options.engine || settingsService.get()?.tts?.engine || 'edge-tts';
    let provider = this.getProvider(engine);

    if (provider.name === 'camb-ai') {
      const cambApiKey = (settingsService.get()?.cambai?.apiKey || '').trim();
      if (!cambApiKey) {
        logger.warn('Camb.ai engine selected but no API key configured. Auto-falling back to Microsoft Edge-TTS for batch synthesis.');
        provider = this.getProvider('edge-tts');
        engine = 'edge-tts';
      }
    }

    this.currentProvider = provider;
    provider.reset();

    const currentSettings = settingsService.get();
    const presets = currentSettings.voicePresets || {};
    const autoFitMode = options.autoFitMode || 'med';
    const syncEnd = options.syncEnd !== false;
    const cacheDir = this.getCacheDir(options.projectDir);
    let maxConcurrency = Math.min(8, Math.max(1, options.concurrency || currentSettings.concurrency || 4));

    // Camb.ai strictly allows only 1 concurrent API request per account (max_concurrent_api_requests_per_account = 1)
    const hasCambaiVoice = (provider.name === 'camb-ai');

    if (hasCambaiVoice) {
      maxConcurrency = 1;
    }

    logger.info(`Starting TTS Batch Synthesis: ${segments.length} segments, engine=${provider.name}, concurrency=${maxConcurrency}, autoFit=${autoFitMode}`);

    const total = segments.length;
    const results = new Array(total);
    let completedCount = 0;

    // Worker pool queue
    let queueIdx = 0;

    const processSegment = async (seg, idx) => {
      if (this.isCancelled) return null;

      const segId = seg.id;
      const rawText = (seg.t || '').trim();
      const smoothedText = this.smoothKhmerPacing(rawText);
      const text = pronunciationService.apply(smoothedText, 'km');
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
      const effectiveRate = this.computeSmartNeuralRate(text, slotDuration, preset.rate, seg.sp, autoFitMode);
      const pitch = preset.pitch || '+0Hz';
      const volume = preset.volume || '+0%';

      // Determine appropriate provider and voice mapping
      let clipProvider = provider;
      let clipVoice = voice;

      const isCambVoice = /^(147\d{3}|[0-9]{5,8})$/.test(String(voice || '').trim());

      if (provider.name === 'edge-tts') {
        clipProvider = provider;
        // Edge-TTS strictly uses neural voice names. If a numeric Camb.ai voice ID was saved in presets, sanitize it to Edge-TTS.
        if (isCambVoice || !clipVoice || !String(clipVoice).includes('-')) {
          const isFemale = (preset.gender === 'F') || (seg.gender === 'female') || String(voice).includes('147321') || String(voice).includes('147323') || String(preset.name || '').toLowerCase().includes('sreymom');
          clipVoice = isFemale ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
        }
      } else if (provider.name === 'camb-ai') {
        clipProvider = provider;
        // Camb.ai uses numeric IDs. If an Edge-TTS voice name is present, map it to Camb.ai voice ID.
        if (String(voice).includes('km-KH') || !isCambVoice) {
          const isFemale = (preset.gender === 'F') || (seg.gender === 'female') || String(voice).toLowerCase().includes('sreymom');
          clipVoice = isFemale ? 147321 : 147320;
        }
      }

      const hash = this.computeHash(text, clipVoice, effectiveRate, pitch, volume, dictHash);
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
          try {
            const synRes = await clipProvider.synthesizeClip({
              text,
              voice: clipVoice,
              rate: effectiveRate,
              pitch,
              volume,
              outputPath: rawAudioPath,
              slotDuration
            });
            rawDuration = synRes.duration || slotDuration;
          } catch (clipErr) {
            // If Camb.ai fails during synthesis, emergency failover to Edge-TTS
            if (clipProvider.name === 'camb-ai') {
              logger.warn(`Camb.ai synthesis failed for segment ${segId} (${clipErr.message}). Failing over to Edge-TTS...`);
              const edgeProvider = this.getProvider('edge-tts');
              const fallbackVoice = (String(clipVoice).includes('147321') || String(clipVoice).includes('147323') || String(clipVoice).toLowerCase().includes('female'))
                ? 'km-KH-SreymomNeural'
                : 'km-KH-PisethNeural';
              const fallbackRes = await edgeProvider.synthesizeClip({
                text,
                voice: fallbackVoice,
                rate: effectiveRate,
                pitch,
                volume,
                outputPath: rawAudioPath,
                slotDuration
              });
              rawDuration = fallbackRes.duration || slotDuration;
            } else {
              throw clipErr;
            }
          }
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
        const alignMode = options.alignMode || 'natural';

        const sync = calculateSyncEnd({
          start: Number(seg.s) || 0,
          end: Number(seg.e) || 0,
          clipDuration: finalDuration,
          prevEnd,
          nextStart,
          syncEnd,
          alignMode
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
          if (curIdx >= total) break;
          const seg = segments[curIdx];
          const res = await processSegment(seg, curIdx);
          if (res) results[curIdx] = res;
        }
      };
      workers.push(worker());
    }

    try {
      await Promise.all(workers);
      const validResults = results.filter(Boolean);
      validResults.sort((a, b) => a.id - b.id);
      logger.info(`Batch TTS completed: ${validResults.length}/${total} processed.`);
      return validResults;
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
