const fs = require('fs');
const BaseAsrProvider = require('./base');
const keyPool = require('../../key-pool');
const settingsService = require('../../settings');
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

const ASR_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

class GeminiAsrProvider extends BaseAsrProvider {
  constructor() {
    super('gemini');
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const rawModel = options.geminiModel || settings.gemini?.transcriptionModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, ''); // strip prefix — URL already contains /models/

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileSize = fs.statSync(audioPath).size;
    logger.info(`Starting Gemini ASR: primaryModel=${primaryModel}, size=${Math.round(fileSize / 1024)}KB`);

    if (typeof onProgress === 'function') {
      onProgress({ percent: 10, message: 'Gemini ASR: Preparing audio buffer...' });
    }

    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    if (this.isCancelled) throw new Error('Transcription cancelled by user.');

    // Model fallback chain: try primary model, then auto-fallback to models with higher free-tier quota
    const candidateModels = [
      primaryModel,
      ...ASR_FALLBACK_MODELS.filter(m => m !== primaryModel)
    ];

    let lastCandidateError = null;

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      if (this.isCancelled) throw new Error('Transcription cancelled by user.');
      const model = candidateModels[mIdx];

      if (typeof onProgress === 'function') {
        const msg = mIdx === 0
          ? `Gemini ASR: Sending audio to ${model}...`
          : `Gemini ASR: Fallback to model ${model} with higher free quota...`;
        onProgress({ percent: Math.min(85, 25 + mIdx * 15), message: msg });
      }

      const isTranscribeSpecialist = model.includes('transcribe');
      const systemPrompt = isTranscribeSpecialist
        ? `You are an expert audio transcription and speaker diarization system.
Transcribe all speech verbatim from the provided audio file into concise subtitle segments with speaker labels, speaker gender, and word-level timestamps.
For each segment:
- "start": start time in seconds (float)
- "end": end time in seconds (float)
- "text": accurate verbatim spoken text
- "speaker": speaker label (e.g. "Speaker 1", "Speaker 2")
- "gender": speaker gender ("male", "female", or "unknown")
- "words": array of word-level timestamps [{"word": "string", "start": float, "end": float}]

Split speech naturally at pauses, sentence boundaries, and speaker turn transitions. Do not overlap segments.`
        : `You are a professional audio transcriber and diarization assistant.
Transcribe the speech in the provided audio file into concise subtitle segments with speaker diarization and word timestamps.
For each segment:
- "start": timestamp in seconds (float)
- "end": timestamp in seconds (float)
- "text": the spoken dialogue (accurate verbatim text)
- "speaker": speaker label (e.g. "Speaker 1", "Speaker 2")
- "gender": speaker gender ("male", "female", or "unknown")
- "words": array of words with individual timestamps [{"word": "string", "start": float, "end": float}]

Split dialogue naturally on pauses and sentence boundaries. Avoid overlapping segments.`;

      const requestBody = {
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Please transcribe all spoken dialogue in this audio file with timestamps, speaker labels, genders, and word-level timestamps.'
              },
              {
                inline_data: {
                  mime_type: 'audio/wav',
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
                gender: { type: 'STRING', enum: ['male', 'female', 'unknown'] },
                words: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      word: { type: 'STRING' },
                      start: { type: 'NUMBER' },
                      end: { type: 'NUMBER' }
                    },
                    required: ['word', 'start', 'end']
                  }
                }
              },
              required: ['start', 'end', 'text', 'speaker', 'gender']
            }
          },
          temperature: 0.1
        }
      };

      const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
      const maxAttempts = Math.max(totalKeys * 2, 4);

      let attempts = 0;
      let modelDailyQuotaExhausted = false;

      while (attempts < maxAttempts) {
        if (this.isCancelled) throw new Error('Transcription cancelled by user.');
        attempts++;

        let apiKey;
        try {
          apiKey = keyPool.getNextKey();
        } catch (poolErr) {
          logger.warn(`Gemini ASR attempt ${attempts}: ${poolErr.message}`);
          if (attempts < maxAttempts) {
            if (typeof onProgress === 'function') {
              onProgress({ percent: 35, message: `All Gemini keys in cooldown. Waiting 2s (attempt ${attempts}/${maxAttempts})...` });
            }
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          lastCandidateError = poolErr;
          break;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
          if (typeof onProgress === 'function') {
            onProgress({ percent: Math.min(85, 40 + Math.round((attempts / maxAttempts) * 45)), message: `Gemini ASR: Processing transcription via ${model} (attempt ${attempts}/${maxAttempts})...` });
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });

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

            if (isDailyQuota) {
              logger.warn(`Model ${model} daily free-tier quota reached on key ${maskedKey}.`);
              // If there are other fallback models to try, switch immediately
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

            if (typeof onProgress === 'function') {
              onProgress({
                percent: Math.min(85, 30 + Math.round((attempts / maxAttempts) * 50)),
                message: `Gemini key rate-limited (${response.status}). Trying next key (${attempts}/${maxAttempts})...`
              });
            }
            continue; // Try next key
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          keyPool.markSuccess(apiKey);

          if (typeof onProgress === 'function') {
            onProgress({ percent: 90, message: 'Gemini ASR: Parsing segments...' });
          }

          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error('Gemini returned an empty response');
          }

          const parsed = JSON.parse(rawText);
          if (!Array.isArray(parsed)) {
            throw new Error('Gemini response schema violation: expected array of segments');
          }

          const segments = parsed.map((item, idx) => ({
            id: idx + 1,
            start: Math.round(Number(item.start) * 1000) / 1000,
            end: Math.round(Number(item.end) * 1000) / 1000,
            text: String(item.text || '').trim(),
            speaker: String(item.speaker || 'Speaker 1'),
            gender: String(item.gender || 'unknown').toLowerCase(),
            words: Array.isArray(item.words) ? item.words.map(w => ({
              word: String(w.word || '').trim(),
              start: Math.round(Number(w.start) * 1000) / 1000,
              end: Math.round(Number(w.end) * 1000) / 1000
            })).filter(w => w.word.length > 0 && w.end >= w.start) : undefined
          })).filter(s => s.text.length > 0 && s.end > s.start);

          if (typeof onProgress === 'function') {
            onProgress({ percent: 100, message: `Gemini ASR complete with ${model}.` });
          }

          logger.info(`Gemini ASR complete using ${model}: ${segments.length} segments`);
          return segments;

        } catch (err) {
          logger.error(`Gemini ASR model ${model} attempt ${attempts} error: ${err.message}`);
          lastCandidateError = err;
          if (attempts >= maxAttempts) {
            break;
          }
          await new Promise(r => setTimeout(r, 1000 * Math.min(attempts, 2)));
        }
      }

      if (modelDailyQuotaExhausted && mIdx < candidateModels.length - 1) {
        const nextModel = candidateModels[mIdx + 1];
        logger.info(`Auto-switching from ${model} to fallback model: ${nextModel}`);
        if (typeof onProgress === 'function') {
          onProgress({ percent: 35, message: `Daily quota reached on ${model}. Switching to ${nextModel}...` });
        }
        keyPool.resetCooldowns();
        continue;
      }
    }

    throw new Error(
      `All Gemini cloud models exhausted due to free-tier quota limits (tested: ${candidateModels.join(', ')}). ` +
      `Please switch ASR Engine to 'Faster-Whisper (Local)' which runs offline with no quotas, or add new Gemini API keys.`
    );
  }
}

module.exports = GeminiAsrProvider;
