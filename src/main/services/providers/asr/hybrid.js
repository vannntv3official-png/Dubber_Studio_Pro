const fs = require('fs');
const BaseAsrProvider = require('./base');
const FasterWhisperAsrProvider = require('./faster-whisper');
const keyPool = require('../../key-pool');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class HybridAsrProvider extends BaseAsrProvider {
  constructor() {
    super('hybrid');
    this.whisperProvider = new FasterWhisperAsrProvider();
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;

    // Step 1: Run Faster-Whisper for high-accuracy local timestamps (0% - 60%)
    if (typeof onProgress === 'function') {
      onProgress({ percent: 5, message: 'Hybrid ASR: Step 1/2 - Running Faster-Whisper for timestamps...' });
    }

    const whisperSegments = await this.whisperProvider.transcribe(audioPath, options, (prog) => {
      if (typeof onProgress === 'function') {
        const scaled = Math.min(60, Math.round((prog.percent / 100) * 60));
        onProgress({ percent: scaled, message: `Hybrid ASR: Step 1/2 - ${prog.message}` });
      }
    });

    if (this.isCancelled) throw new Error('Transcription cancelled by user.');

    if (!whisperSegments || whisperSegments.length === 0) {
      return [];
    }

    // Step 2: Diarize speakers and refine text with Gemini (60% - 100%)
    if (typeof onProgress === 'function') {
      onProgress({ percent: 65, message: 'Hybrid ASR: Step 2/2 - Identifying speakers & gender with Gemini...' });
    }

    try {
      const refinedSegments = await this.refineWithGemini(audioPath, whisperSegments, onProgress);
      return refinedSegments;
    } catch (err) {
      logger.warn(`Hybrid step 2 (Gemini diarization) failed: ${err.message}. Falling back to Whisper segments.`);
      if (typeof onProgress === 'function') {
        onProgress({ percent: 100, message: 'Hybrid ASR: Completed with local timestamps.' });
      }
      return whisperSegments;
    }
  }

  async refineWithGemini(audioPath, segments, onProgress) {
    const settings = settingsService.get();
    const rawModel = settings.geminiModel || 'gemini-3.8-flash';
    const model = rawModel.replace(/^models\//, ''); // strip prefix — URL already contains /models/

    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `You are an expert audio diarizer. You are provided with an audio file and a timestamped transcript produced by Whisper.
Your task:
1. For each segment, identify the speaker (e.g. "Speaker 1", "Speaker 2") and speaker gender ("male", "female", "unknown").
2. Correct any obvious misheard words in "text" if applicable.
3. PRESERVE the exact "id", "start", and "end" timestamps for each segment. Do not add or remove segments.

Input Segments:
${JSON.stringify(segments.map(s => ({ id: s.id, start: s.start, end: s.end, text: s.text })))}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
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
              id: { type: 'INTEGER' },
              start: { type: 'NUMBER' },
              end: { type: 'NUMBER' },
              text: { type: 'STRING' },
              speaker: { type: 'STRING' },
              gender: { type: 'STRING', enum: ['male', 'female', 'unknown'] }
            },
            required: ['id', 'start', 'end', 'text', 'speaker', 'gender']
          }
        },
        temperature: 0.1
      }
    };

    const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
    const maxAttempts = Math.max(totalKeys * 2, 6);

    let attempts = 0;
    while (attempts < maxAttempts) {
      if (this.isCancelled) throw new Error('Refine cancelled by user.');
      attempts++;

      let apiKey;
      try {
        apiKey = keyPool.getNextKey();
      } catch (poolErr) {
        logger.warn(`Hybrid refine attempt ${attempts}: ${poolErr.message}`);
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        throw poolErr;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        if (typeof onProgress === 'function') {
          onProgress({ percent: 80, message: `Hybrid ASR: Aligning diarized speakers (attempt ${attempts}/${maxAttempts})...` });
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          logger.warn(`Hybrid refine hit HTTP ${response.status} with key ${maskedKey}${detailMsg ? ': ' + detailMsg : ''}. Placing in cooldown.`);
          const cooldownMs = response.status === 503 ? 15000 : 45000;
          keyPool.markCooldown(apiKey, cooldownMs);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
        }

        const result = await response.json();
        keyPool.markSuccess(apiKey);

        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response from Gemini');

        const parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed)) throw new Error('Invalid schema returned');

        // Merge diarization results back into original segments to guarantee timestamps and counts
        const idMap = new Map(parsed.map(p => [p.id, p]));

        const merged = segments.map(orig => {
          const enriched = idMap.get(orig.id);
          return {
            id: orig.id,
            start: orig.start,
            end: orig.end,
            text: enriched?.text || orig.text,
            speaker: enriched?.speaker || 'Speaker 1',
            gender: enriched?.gender || 'unknown'
          };
        });

        if (typeof onProgress === 'function') {
          onProgress({ percent: 100, message: 'Hybrid ASR: Complete.' });
        }

        return merged;

      } catch (err) {
        logger.error(`Hybrid refine attempt ${attempts} error: ${err.message}`);
        if (attempts >= maxAttempts) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 1000 * Math.min(attempts, 3)));
      }
    }

    throw new Error(`Hybrid refine failed after ${attempts} attempts across ${totalKeys} configured keys`);
  }

  cancel() {
    this.isCancelled = true;
    this.whisperProvider.cancel();
  }
}

module.exports = HybridAsrProvider;
