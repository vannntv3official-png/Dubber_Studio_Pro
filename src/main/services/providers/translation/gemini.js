const BaseTranslationProvider = require('./base');
const keyPool = require('../../key-pool');
const settingsService = require('../../settings');
const logger = require('../../../utils/logger');

class GeminiTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('gemini');
    this.maxBatchRetries = 2;
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const rawModel = options.model || settings.geminiModel || 'gemini-3.8-flash';
    const model = rawModel.replace(/^models\//, ''); // strip prefix — URL already contains /models/
    const targetLang = options.targetLang || 'Khmer';
    const batchSize = Math.min(50, Math.max(10, options.batchSize || 30));
    const glossary = options.glossary || '';

    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    logger.info(`Starting Gemini Translation: total=${segments.length}, target=${targetLang}, model=${model}, batchSize=${batchSize}`);

    // Divide segments into batches
    const batches = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    const allResults = [];
    let processedCount = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (this.isCancelled) {
        throw new Error('Translation cancelled by user.');
      }

      const batch = batches[bIdx];
      const batchNum = bIdx + 1;

      if (typeof onProgress === 'function') {
        const pct = Math.round((processedCount / segments.length) * 100);
        onProgress({
          current: processedCount,
          total: segments.length,
          percent: pct,
          message: `Translating batch ${batchNum}/${batches.length} (${processedCount}/${segments.length} lines)...`
        });
      }

      // Process batch with context and retry
      const batchTranslations = await this.translateBatchWithRetry(batch, segments, {
        targetLang,
        model,
        glossary,
        batchNum,
        totalBatches: batches.length
      });

      allResults.push(...batchTranslations);
      processedCount += batch.length;
    }

    if (typeof onProgress === 'function') {
      onProgress({
        current: segments.length,
        total: segments.length,
        percent: 100,
        message: 'Translation complete.'
      });
    }

    logger.info(`Gemini translation finished: ${allResults.length} segments translated.`);
    return allResults;
  }

  async translateBatchWithRetry(batch, allSegments, config) {
    let pendingItems = [...batch];
    const resolvedMap = new Map();
    let attempt = 0;
    const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
    const maxBatchAttempts = Math.max(totalKeys * 2, 8);
    let lastError = null;

    while (pendingItems.length > 0 && attempt < maxBatchAttempts) {
      if (this.isCancelled) throw new Error('Translation cancelled by user.');
      attempt++;

      try {
        const batchResults = await this.callGeminiApiForBatch(pendingItems, allSegments, config);
        
        for (const item of batchResults) {
          if (item && item.id != null && typeof item.translatedText === 'string') {
            resolvedMap.set(item.id, item.translatedText.trim());
          }
        }

        // Check if any items are missing
        pendingItems = pendingItems.filter(seg => !resolvedMap.has(seg.id) || !resolvedMap.get(seg.id));

        if (pendingItems.length > 0) {
          logger.warn(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts}: ${pendingItems.length} items missing. Retrying...`);
        }
      } catch (err) {
        lastError = err;
        logger.error(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts} error: ${err.message}`);
        if (attempt >= maxBatchAttempts) {
          break;
        }

        let waitMs = 1500;
        const retryMatch = err.message.match(/retry in\s+([0-9.]+)\s*s/i) || err.message.match(/available in\s+([0-9]+)\s*s/i);
        if (retryMatch) {
          waitMs = Math.min(30000, Math.max(1000, Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500));
        } else {
          waitMs = 1000 * Math.min(attempt, 3);
        }
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    if (resolvedMap.size === 0 && batch.length > 0) {
      const errMsg = lastError?.message || 'Gemini translation failed: rate limit exceeded on all keys.';
      throw new Error(errMsg);
    }

    // Assemble final output in exact order
    return batch.map(seg => ({
      id: seg.id,
      translatedText: resolvedMap.get(seg.id) || seg.text
    }));
  }

  async callGeminiApiForBatch(items, allSegments, config) {
    const apiKey = keyPool.getNextKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`;

    // Build context-rich batch payload
    const allSegMap = new Map(allSegments.map(s => [s.id, s]));

    const contextItems = items.map(item => {
      const idx = allSegments.findIndex(s => s.id === item.id);
      const prev = idx > 0 ? allSegments[idx - 1].text : '';
      const next = idx < allSegments.length - 1 ? allSegments[idx + 1].text : '';
      const duration = Math.max(1.0, (Number(item.end || item.e || 0) - Number(item.start || item.s || 0)));
      // Khmer comfortable speech rate is ~12 characters per second
      const charBudget = Math.round(duration * 12);

      return {
        id: item.id,
        text: item.text || item.t || '',
        speaker: item.speaker || 'Speaker',
        gender: item.gender || 'unknown',
        durationSec: Math.round(duration * 10) / 10,
        charBudget,
        prevContext: prev,
        nextContext: next
      };
    });

    const systemPrompt = `You are an expert movie and television dubbing adapter and subtitle translator.
Your goal is to translate dialogue lines into natural, expressive, spoken ${config.targetLang}.

Dubbing Rules:
1. Translate for the EAR, not just the eye. The translation must sound natural and colloquial when spoken by voice actors.
2. Timing Budget: Each line has a "charBudget" and "durationSec". Keep the translation concise enough to fit naturally within the allotted time. Do not make it unnaturally verbose.
3. Emotional Tone & Consistency: Preserve the speaker's personality, humor, formality, and emotional state.
${config.glossary ? `4. Series Glossary & Character Names:\n${config.glossary}` : ''}
5. Exact ID match: Return a JSON array of objects with the exact input "id" and "translatedText".`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Translate the following ${contextItems.length} dialogue segments into ${config.targetLang}:\n` +
                    JSON.stringify(contextItems, null, 2)
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
              translatedText: { type: 'STRING' }
            },
            required: ['id', 'translatedText']
          }
        },
        temperature: 0.3
      }
    };

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
      let cooldownMs = response.status === 503 ? 10000 : 30000;
      const retryMatch = detailMsg.match(/retry in\s+([0-9.]+)\s*s/i);
      if (retryMatch) {
        cooldownMs = Math.min(60000, Math.max(1000, Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500));
      }
      keyPool.markCooldown(apiKey, cooldownMs);
      throw new Error(`Gemini rate limited (HTTP ${response.status}${detailMsg ? ': ' + detailMsg : ''})`);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${errText}`);
    }

    const json = await response.json();
    keyPool.markSuccess(apiKey);

    const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error('Gemini returned empty response for translation batch');
    }

    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      throw new Error('Gemini translation response schema violation');
    }

    return parsed;
  }
}

module.exports = GeminiTranslationProvider;
