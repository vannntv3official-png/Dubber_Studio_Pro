const BaseTranslationProvider = require('./base');
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

const TRANSLATION_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

class GeminiTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('gemini');
    this.maxBatchRetries = 2;
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const rawModel = options.model || settings.gemini?.translationModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, ''); // strip prefix — URL already contains /models/
    const targetLang = options.targetLang || 'Khmer';
    const batchSize = Math.min(50, Math.max(10, options.batchSize || 30));
    const glossary = options.glossary || '';

    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    logger.info(`Starting Gemini Translation: total=${segments.length}, target=${targetLang}, primaryModel=${primaryModel}, batchSize=${batchSize}`);

    // Build model fallback candidate list
    const candidateModels = [
      primaryModel,
      ...TRANSLATION_FALLBACK_MODELS.filter(m => m !== primaryModel)
    ];

    const translationState = {
      model: primaryModel,
      modelIdx: 0,
      candidateModels
    };

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
          message: `Translating batch ${batchNum}/${batches.length} (${processedCount}/${segments.length} lines) via ${translationState.model}...`
        });
      }

      // Process batch with context and retry
      const batchTranslations = await this.translateBatchWithRetry(batch, segments, {
        targetLang,
        glossary,
        batchNum,
        totalBatches: batches.length,
        state: translationState,
        onProgress
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

        // If daily quota exhausted on the current model, auto-switch to next fallback model
        if (err.message.includes('[DAILY_QUOTA_EXHAUSTED]') && config.state.modelIdx < config.state.candidateModels.length - 1) {
          config.state.modelIdx++;
          const nextModel = config.state.candidateModels[config.state.modelIdx];
          logger.info(`Translation batch ${config.batchNum}: Auto-switching from ${config.state.model} to fallback model: ${nextModel}`);
          config.state.model = nextModel;
          keyPool.resetCooldowns();
          attempt = 0;
          if (typeof config.onProgress === 'function') {
            config.onProgress({
              percent: Math.min(95, 20 + Math.round((config.batchNum / config.totalBatches) * 70)),
              message: `Daily quota reached on previous model. Auto-switching to ${nextModel}...`
            });
          }
          await new Promise(r => setTimeout(r, 600));
          continue;
        }

        if (attempt >= maxBatchAttempts) {
          break;
        }

        let waitMs = 1500;
        const retryMs = parseRetryDurationMs(err.message);
        if (retryMs && retryMs <= 30000) {
          waitMs = Math.max(1000, retryMs + 500);
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
    const currentModel = config.state.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    // Build context-rich batch payload
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

      const retryMs = parseRetryDurationMs(detailMsg);
      const isDailyQuota = detailMsg.includes('generate_content_free_tier_requests') ||
        detailMsg.includes('limit: 20') ||
        detailMsg.includes('Quota exceeded') ||
        (retryMs && retryMs > 300000);

      if (!isDailyQuota) {
        let cooldownMs = response.status === 503 ? 10000 : 30000;
        if (retryMs && retryMs <= 60000) {
          cooldownMs = Math.max(1000, retryMs + 500);
        }
        keyPool.markCooldown(apiKey, cooldownMs);
      }

      const quotaTag = isDailyQuota ? ' [DAILY_QUOTA_EXHAUSTED]' : '';
      throw new Error(`Gemini rate limited (HTTP ${response.status}${quotaTag}${detailMsg ? ': ' + detailMsg : ''})`);
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
