/**
 * Gemini Cloud ASR Provider
 * Fast, chunked audio transcription via Google Gemini with intelligent slicing,
 * lightweight MP3 compression (~85% smaller payload), boundary deduplication,
 * and resilient per-chunk multi-key rotation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const BaseAsrProvider = require('./base');
const keyPool = require('../../key-pool');
const settingsService = require('../../settings');
const ffmpegService = require('../../ffmpeg');
const { resolveOverlaps } = require('../../../../shared/subtitle-utils');
const logger = require('../../../utils/logger');

function parseRetryDurationMs(text) {
  if (!text || typeof text !== 'string') return null;
  const compoundMatch = text.match(/(?:retry in|available in)\s+(?:(\d+)h)?(?:(\d+)m)?(?:([0-9.]+)s)?/i);
  if (compoundMatch && (compoundMatch[1] || compoundMatch[2] || compoundMatch[3])) {
    const hours = parseInt(compoundMatch[1] || '0', 10);
    const mins = parseInt(compoundMatch[2] || '0', 10);
    const secs = parseFloat(compoundMatch[3] || '0');
    return Math.ceil((hours * 3600 + mins * 60 + secs) * 1000);
  }
  const simpleMatch = text.match(/(?:retry in|available in)\s+([0-9.]+)\s*s/i);
  if (simpleMatch) {
    return Math.ceil(parseFloat(simpleMatch[1]) * 1000);
  }
  return null;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createAudioChunks(totalDurationSec, chunkDurationSec = 90, paddingSec = 3) {
  if (totalDurationSec <= chunkDurationSec + paddingSec) {
    return [{
      index: 0,
      coreStartSec: 0,
      coreEndSec: totalDurationSec,
      paddedStartSec: 0,
      paddedEndSec: totalDurationSec,
      durationSec: totalDurationSec
    }];
  }

  const numChunks = Math.ceil(totalDurationSec / chunkDurationSec);
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const coreStartSec = i * chunkDurationSec;
    const coreEndSec = Math.min(totalDurationSec, coreStartSec + chunkDurationSec);
    const paddedStartSec = Math.max(0, coreStartSec - paddingSec);
    const paddedEndSec = Math.min(totalDurationSec, coreEndSec + paddingSec);
    chunks.push({
      index: i,
      coreStartSec,
      coreEndSec,
      paddedStartSec,
      paddedEndSec,
      durationSec: paddedEndSec - paddedStartSec
    });
  }
  return chunks;
}

const ASR_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview'
];

class GeminiAsrProvider extends BaseAsrProvider {
  constructor() {
    super('gemini');
    this.activeAbortController = null;
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    this.activeAbortController = typeof globalThis.AbortController !== 'undefined'
      ? new globalThis.AbortController()
      : null;
    const settings = settingsService.get();
    const rawModel = options.geminiModel || settings.gemini?.transcriptionModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, '');

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // 1. Probe total duration of audio
    let durationSec = 0;
    try {
      const probe = await ffmpegService.probeMedia(audioPath);
      durationSec = parseFloat(probe.duration || 0);
    } catch (probeErr) {
      logger.warn(`ffprobe failed to probe ${audioPath}: ${probeErr.message}`);
    }

    if (!durationSec || durationSec <= 0) {
      try {
        const stats = fs.statSync(audioPath);
        durationSec = Math.max(1, Math.round(stats.size / 32000));
      } catch (_) {
        durationSec = 60;
      }
    }

    const chunks = createAudioChunks(durationSec, 90, 3);
    const totalChunks = chunks.length;
    logger.info(`Gemini ASR: Total duration ${durationSec.toFixed(1)}s split into ${totalChunks} chunk(s)`);

    // 2. Prepare temporary workspace for audio slices
    const candidateModels = [primaryModel, ...ASR_FALLBACK_MODELS.filter(m => m !== primaryModel)];
    const collectedSegments = [];
    const expectedLang = options.language || settings.language;
    const langPrompt = expectedLang ? `\nExpected primary language: ${expectedLang}. Keep words spoken in other languages exactly as heard.` : '';

    let tempDir = null;
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-asr-'));
      const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
      const configuredConcurrency = Math.max(1, Math.min(6, Number(settings.gemini?.maxConcurrency) || 3));
      const concurrency = Math.min(totalChunks, configuredConcurrency);
      logger.info(`Gemini ASR: Processing ${totalChunks} chunk(s) with concurrency ${concurrency} (${totalKeys} key(s) in pool, maxConcurrency=${configuredConcurrency})...`);

      const chunkResults = new Array(totalChunks);
      let completedCount = 0;
      let cursor = 0;

      const worker = async () => {
        while (cursor < totalChunks) {
          if (this.isCancelled) throw new Error('Transcription cancelled by user.');
          const cIdx = cursor++;
          if (cIdx >= totalChunks) break;
          const chunk = chunks[cIdx];

          const timeLabel = `${formatTime(chunk.coreStartSec)} - ${formatTime(chunk.coreEndSec)}`;
          if (typeof onProgress === 'function') {
            const currentPct = Math.min(88, Math.max(5, Math.round((completedCount / totalChunks) * 88)));
            onProgress({
              percent: currentPct,
              message: totalChunks > 1
                ? `Gemini ASR: Processing part ${cIdx + 1}/${totalChunks} (${timeLabel})...`
                : 'Gemini ASR: Transcribing speech audio...'
            });
          }

          const segs = await this.transcribeSingleChunk({
            chunk,
            cIdx,
            totalChunks,
            audioPath,
            tempDir,
            candidateModels,
            langPrompt
          });

          chunkResults[cIdx] = segs;
          completedCount++;

          if (typeof onProgress === 'function') {
            const currentPct = Math.min(88, Math.round((completedCount / totalChunks) * 88));
            onProgress({
              percent: currentPct,
              message: totalChunks > 1
                ? `Gemini ASR: Completed part ${completedCount}/${totalChunks} (${timeLabel})...`
                : 'Gemini ASR: Transcribing speech audio...'
            });
          }
        }
      };

      const workers = [];
      for (let w = 0; w < concurrency; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      // Collate in original chronological order
      for (let i = 0; i < totalChunks; i++) {
        if (chunkResults[i]) {
          collectedSegments.push(...chunkResults[i]);
        }
      }

      // Sort and resolve any boundary overlaps
      collectedSegments.sort((a, b) => a.start - b.start);
      const cleanSegments = resolveOverlaps(collectedSegments);
      const finalSegments = cleanSegments.map((s, idx) => ({
        id: idx + 1,
        start: s.start,
        end: s.end,
        text: s.text,
        speaker: s.speaker,
        gender: s.gender
      }));

      if (typeof onProgress === 'function') {
        onProgress({ percent: 100, message: `Gemini ASR complete: ${finalSegments.length} segments recognized.` });
      }

      logger.info(`Gemini ASR finished successfully: ${finalSegments.length} total segments`);
      return finalSegments;

    } finally {
      this.activeAbortController = null;
      try {
        if (tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }

  async transcribeSingleChunk({
    chunk,
    cIdx,
    totalChunks,
    audioPath,
    tempDir,
    candidateModels,
    langPrompt
  }) {
    if (this.isCancelled) throw new Error('Transcription cancelled by user.');
    const isLastChunk = cIdx === totalChunks - 1;

    // Compress and slice to lightweight MP3 (~85% payload reduction)
    const chunkMp3Path = path.join(tempDir, `chunk_${chunk.index}.mp3`);
    await ffmpegService.sliceAndCompressAudio(
      audioPath,
      chunkMp3Path,
      chunk.paddedStartSec,
      chunk.durationSec
    );

    if (this.isCancelled) throw new Error('Transcription cancelled by user.');

    const chunkBuffer = fs.readFileSync(chunkMp3Path);
    const base64Audio = chunkBuffer.toString('base64');
    try { fs.unlinkSync(chunkMp3Path); } catch (_) {}

    const chunkDurationStr = chunk.durationSec.toFixed(1);
    const systemPrompt = `You are an expert audio transcription system.${langPrompt}
Transcribe the spoken dialogue in this audio clip.
This clip is exactly ${chunkDurationStr} seconds long; every timestamp must lie between 0 and that duration.
Return every spoken line with start and end times in SECONDS measured from the start of this clip.
Rules:
- Timestamps are decimal seconds, for example "start": 12.4, "end": 15.85. Never use minute:second notation.
- Transcribe every spoken phrase from the start to the end of the clip.
- Keep the original language and spelling. Do not translate.
- Break lines at natural sentence or phrase boundaries (typically 2-6 seconds).
- Identify speaker ("Speaker 1", "Speaker 2", etc.) and vocal gender ("male", "female", "unknown").
- If nothing is spoken in this clip, return an empty array.`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Transcribe all spoken dialogue in this clip with accurate timestamps, speaker labels, and genders.'
            },
            {
              inline_data: {
                mime_type: 'audio/mp3',
                data: base64Audio
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              start: { type: 'NUMBER' },
              end: { type: 'NUMBER' },
              text: { type: 'STRING' },
              speaker: { type: 'STRING' },
              gender: { type: 'STRING', enum: ['male', 'female', 'unknown'] }
            },
            required: ['start', 'end', 'text', 'speaker', 'gender']
          }
        },
        temperature: 0.1
      }
    };

    let chunkSuccess = false;
    let lastChunkError = null;
    const chunkSegments = [];

    for (let mIdx = 0; mIdx < candidateModels.length && !chunkSuccess; mIdx++) {
      const model = candidateModels[mIdx];
      // Low thinking level minimizes latency for JSON transcription
      if (model.startsWith('gemini-3')) {
        requestBody.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
      } else {
        delete requestBody.generationConfig.thinkingConfig;
      }
      const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
      const maxAttempts = Math.max(totalKeys * 2, 4);
      let attempts = 0;
      let modelDailyQuotaExhausted = false;

      while (attempts < maxAttempts && !chunkSuccess) {
        if (this.isCancelled) throw new Error('Transcription cancelled by user.');
        attempts++;

        let apiKey;
        try {
          apiKey = keyPool.getNextKey();
        } catch (poolErr) {
          logger.warn(`Gemini ASR chunk ${cIdx + 1} attempt ${attempts}: ${poolErr.message}`);
          if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          lastChunkError = poolErr;
          break;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const timeoutMs = 45000;
        const reqAbortController = new AbortController();
        const timeoutId = setTimeout(() => {
          reqAbortController.abort(new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini ASR request timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);

        if (this.activeAbortController) {
          this.activeAbortController.signal.addEventListener('abort', () => {
            reqAbortController.abort();
          }, { once: true });
        }

        let response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: reqAbortController.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        try {

          if (this.isCancelled) throw new Error('Transcription cancelled by user.');

          if (response.status === 429 || response.status === 503) {
            let detailMsg = '';
            try {
              const errJson = await response.json();
              detailMsg = errJson.error?.message || '';
            } catch (_) {
              try { detailMsg = await response.text(); } catch (_) {}
            }
            const maskedKey = keyPool.maskKey(apiKey);
            logger.warn(`Gemini ASR hit HTTP ${response.status} with key ${maskedKey}${detailMsg ? ': ' + detailMsg : ''}.`);

            const retryMs = parseRetryDurationMs(detailMsg);
            const isDailyQuota = detailMsg.includes('generate_content_free_tier_requests') ||
              detailMsg.includes('limit: 20') ||
              detailMsg.includes('Quota exceeded') ||
              (retryMs && retryMs > 300000);

            const isServerHighDemand = response.status === 503 ||
              detailMsg.includes('high demand') ||
              detailMsg.includes('overloaded');

            if (isDailyQuota || isServerHighDemand) {
              if (isServerHighDemand) {
                logger.warn(`Model ${model} experiencing high demand at Google (${response.status}). Auto-switching to fallback model...`);
              } else {
                logger.warn(`Model ${model} daily free-tier quota reached on key ${maskedKey}.`);
              }
              if (mIdx < candidateModels.length - 1) {
                modelDailyQuotaExhausted = true;
                break;
              }
            }

            let cooldownMs = response.status === 503 ? 10000 : 30000;
            if (retryMs && retryMs <= 60000) {
              cooldownMs = Math.max(1000, retryMs + 500);
            }
            keyPool.markCooldown(apiKey, cooldownMs);
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          keyPool.markSuccess(apiKey);

          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error('Gemini returned an empty response');
          }

          const parsed = JSON.parse(rawText);
          if (!Array.isArray(parsed)) {
            throw new Error('Gemini response schema violation: expected array of segments');
          }

          // Shift timestamps and filter out items outside core window
          for (const item of parsed) {
            const startRaw = Number(item.start);
            const endRaw = Number(item.end);
            if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) continue;

            const absStart = Math.max(0, Math.round((startRaw + chunk.paddedStartSec) * 1000) / 1000);
            const absEnd = Math.max(absStart + 0.1, Math.round((endRaw + chunk.paddedStartSec) * 1000) / 1000);
            const text = String(item.text || '').trim();
            if (!text) continue;

            // Core boundary formula to eliminate duplicates and gaps
            const isCore = absStart >= chunk.coreStartSec && (isLastChunk ? absStart <= chunk.coreEndSec : absStart < chunk.coreEndSec);
            if (isCore || totalChunks === 1) {
              chunkSegments.push({
                start: absStart,
                end: absEnd,
                text,
                speaker: String(item.speaker || 'Speaker 1'),
                gender: String(item.gender || 'unknown').toLowerCase()
              });
            }
          }

          chunkSuccess = true;
          logger.info(`Gemini ASR chunk ${cIdx + 1}/${totalChunks} complete (${parsed.length} parsed items, ${chunkSegments.length} in core window)`);
          break;

        } catch (err) {
          if (this.isCancelled || (err.name === 'AbortError' && !err.message.includes('[GEMINI_NETWORK_TIMEOUT]'))) {
            throw new Error('Transcription cancelled by user.');
          }
          logger.error(`Gemini ASR chunk ${cIdx + 1} model ${model} attempt ${attempts} error: ${err.message}`);
          lastChunkError = err;
          if (attempts >= maxAttempts) break;
          await new Promise(r => setTimeout(r, 1000 * Math.min(attempts, 2)));
        }
      }

      if (this.isCancelled) throw new Error('Transcription cancelled by user.');

      if (modelDailyQuotaExhausted && mIdx < candidateModels.length - 1) {
        const nextModel = candidateModels[mIdx + 1];
        logger.info(`Auto-switching from ${model} to fallback model: ${nextModel}`);
        keyPool.resetCooldowns();
      }
    }

    if (!chunkSuccess) {
      throw new Error(
        `Failed to transcribe chunk ${cIdx + 1}/${totalChunks} with Gemini: ${lastChunkError ? lastChunkError.message : 'Unknown error'}. ` +
        `Please switch ASR Engine to 'Faster-Whisper (Local)' which runs offline, or verify Gemini API keys.`
      );
    }

    return chunkSegments;
  }

  cancel() {
    this.isCancelled = true;
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (_) {}
      this.activeAbortController = null;
    }
  }
}

module.exports = GeminiAsrProvider;
