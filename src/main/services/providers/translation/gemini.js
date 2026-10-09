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

const TRANSLATION_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

class GeminiTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('gemini');
    this.maxBatchRetries = 3;
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const rawModel = options.model || settings.gemini?.translationModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, '');
    const targetLang = options.targetLang || 'Khmer';
    const batchSize = Math.min(50, Math.max(10, options.batchSize || 30));
    const glossary = options.glossary || '';

    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    logger.info(`Starting Gemini Translation: total=${segments.length}, target=${targetLang}, primaryModel=${primaryModel}, batchSize=${batchSize}`);

    const candidateModels = [
      primaryModel,
      ...TRANSLATION_FALLBACK_MODELS.filter(m => m !== primaryModel)
    ];

    const translationState = {
      model: candidateModels[0],
      modelIdx: 0,
      candidateModels
    };

    const batches = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    const allResults = [];
    let processedCount = 0;

    for (let batchNum = 0; batchNum < batches.length; batchNum++) {
      if (this.isCancelled) {
        throw new Error('Translation cancelled by user.');
      }

      const batch = batches[batchNum];
      if (typeof onProgress === 'function') {
        const percent = Math.min(95, Math.round((processedCount / segments.length) * 100));
        onProgress({
          current: processedCount,
          total: segments.length,
          percent,
          message: `Translating batch ${batchNum + 1}/${batches.length} (${processedCount}/${segments.length})...`
        });
      }

      const batchTranslations = await this.translateBatchWithRetry(batch, segments, {
        targetLang,
        glossary,
        batchNum: batchNum + 1,
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
            resolvedMap.set(String(item.id), item.translatedText.trim());
          }
        }

        pendingItems = pendingItems.filter(seg => !resolvedMap.has(String(seg.id)) || !resolvedMap.get(String(seg.id)));

        if (pendingItems.length > 0) {
          logger.warn(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts}: ${pendingItems.length} items missing. Retrying...`);
        }
      } catch (err) {
        lastError = err;
        logger.error(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts} error: ${err.message}`);

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

    return batch.map(seg => ({
      id: seg.id,
      translatedText: resolvedMap.get(String(seg.id)) || seg.text
    }));
  }

  async callGeminiApiForBatch(items, allSegments, config) {
    const apiKey = keyPool.getNextKey();
    const currentModel = config.state.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    const contextItems = items.map((item, i) => {
      const idx = allSegments.findIndex(s => String(s.id) === String(item.id));
      const prev = idx > 0 ? allSegments[idx - 1].text : '';
      const next = idx < allSegments.length - 1 ? allSegments[idx + 1].text : '';
      const duration = Math.max(1.0, (Number(item.end || item.e || 0) - Number(item.start || item.s || 0)));
      const charBudget = Math.round(duration * 12);

      return {
        id: i + 1,
        origId: String(item.id),
        text: item.text || item.t || '',
        speaker: item.speaker || 'Speaker',
        gender: item.gender || item.vocalType || 'unknown',
        durationSec: Math.round(duration * 10) / 10,
        charBudget,
        prevContext: prev,
        nextContext: next
      };
    });

    const isKhmer = !config.targetLang || config.targetLang.toLowerCase().includes('khmer') || config.targetLang.toLowerCase() === 'km';

    const systemPrompt = isKhmer ? `You are an elite master movie dubbing adapter and dialogue writer for Khmer cinema and drama dubbing (អ្នកនិពន្ធ និងបកប្រែពាក្យសំដីបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).
Your task is to translate source dialogue lines into vibrant, natural, emotionally authentic spoken Khmer (ភាសានិយាយបញ្ចូលសំឡេងរស់រវើក) specifically crafted for voice actors and TTS engines.

CRITICAL KHMER DUBBING PRINCIPLES:
1. PURE SPOKEN KHMER (ភាសានិយាយពិតៗ - មិនមែនភាសាសៀវភៅ):
   - Strictly NEVER translate literally or use bookish/mechanical grammar.
   - BAN literary question markers: NEVER start sentences with "តើ...?" or use "កំពុងតែ...".
   - Use natural movie conversational endings and question forms:
     * Instead of "តើអ្នកកំពុងធ្វើអ្វី?" -> "កំពុងធ្វើអីហ្នឹង?"
     * Instead of "តើអ្នកពិតជាគិតដូច្នោះឬ?" -> "គិតចឹងមែន?"
     * Instead of "ខ្ញុំមិនដឹងអំពីបញ្ហានេះទេ" -> "ខ្ញុំអត់ដឹងផង!"
     * Instead of "តើយើងត្រូវទៅទីណា?" -> "ទៅណាឥឡូវ?"
     * Instead of "សូមរង់ចាំបន្តិច" -> "ចាំបន្តិចសិន!"

2. NATURAL PRONOUNS & RELATIONSHIPS (សព្វនាម និងឋានានុក្រមតួអង្គ):
   - AVOID generic "អ្នក / ខ្ញុំ" unless talking to a complete stranger or formal narrator.
   - Infer relationship from context and speaker presentation:
     * Lovers/Spouses: "បង / អូន"
     * Friends/Peers: "ឯង / ខ្ញុំ" or "គ្នា / ឯង"
     * Elders/Parents: "ម៉ាក់ / ប៉ា / ពូ / មីង / តា / យាយ / កូន"
     * Superior/Gang/Boss: "មេ / បងធំ / ខ្ញុំ"
     * Historical/Royal: "លោកម្ចាស់ / ទូលបង្គំ / ម្ចាស់បង"

3. AUTHENTIC MOVIE EXCLAMATIONS & EMOTIONS (សូរសព្ទអារម្មណ៍ និងពាក្យឧទាន):
   - Translate exclamations with real Khmer dubbing punch:
     * "Damn it! / Shoot!" -> "ចង្រៃយក!", "ងាប់គាំង!"
     * "Oh my god! / Oh no!" -> "ងាប់ហើយ!", "វីវរហើយ!", "ព្រះអើយ!"
     * "What the heck?" -> "ស្អីគេហ្នឹង?", "ឆ្កួតមែន!"
     * "Help me!" -> "ជួយផង!", "ជួយខ្ញុំផង!"
     * "Hurry up!" -> "លឿនឡើង!", "ប្រញាប់ឡើង!"
     * "Relax / Calm down" -> "ចិត្តត្រជាក់ៗ!", "កុំភ័យ!"

4. STRICT TIMING & CHAR BUDGET (កំណត់ប្រវែងតួអក្សរយ៉ាងម៉ឺងម៉ាត់):
   - Spoken Khmer takes ~12-14 characters per second (including vowels and subscripts).
   - Each line MUST fit within its specified 'charBudget' and 'durationSec'.
   - If a line has a short duration, use tight, punchy, concise words so the voice finishes before the video cue ends!

5. NAMES & GLOSSARY:
   - Transcribe foreign/character names into standard phonetic Khmer script accurately and keep them consistent.
   - Never leave any line untranslated.
${config.glossary ? `\nSeries Glossary & Character Names:\n${config.glossary}` : ''}

6. EXACT 1-TO-1 MAPPING:
   - Return exactly one translated output line for each numeric id (${contextItems.length} lines in, ${contextItems.length} lines out).`
: `You are an expert dubbing translator and dialogue adapter.
Translate dialogue lines into natural, concise spoken ${config.targetLang} for dubbing.

Dubbing Rules:
1. Spoken Phrasing: Translate for the ear, natural colloquial speech that sounds like a real person talking. Never translate literally.
2. Timing Budget: Prefer wording that can be spoken naturally inside each line's durationSec and charBudget.
3. Invariant 1-to-1 Mapping: Return exactly one translation per numeric id (${contextItems.length} lines in, ${contextItems.length} lines out).
${config.glossary ? `4. Series Glossary & Names:\n${config.glossary}` : ''}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Translate every line into natural, concise spoken ${config.targetLang}:\n` +
                    JSON.stringify(contextItems.map(c => ({ id: c.id, text: c.text, durationSec: c.durationSec, charBudget: c.charBudget })))
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
        temperature: 0.25
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

    const numericMap = new Map(contextItems.map(c => [c.id, c.origId]));
    return parsed.map(item => ({
      id: numericMap.get(item.id) || String(item.id),
      translatedText: item.translatedText
    }));
  }

  async condense(items, options = {}) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const rawModel = options.model || settings.gemini?.translationModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, '');
    const candidateModels = [
      primaryModel,
      ...TRANSLATION_FALLBACK_MODELS.filter(m => m !== primaryModel)
    ];

    const inputList = Array.isArray(items) ? items : [items];
    if (inputList.length === 0) return [];

    const apiKey = keyPool.getNextKey() || keyPool.getKey('gemini');
    if (!apiKey) {
      throw new Error('No Gemini API key available. Please configure an API key in Settings.');
    }

    const payloadItems = inputList.map((item, idx) => {
      const dur = typeof item.durationSec === 'number' ? item.durationSec : (Number(item.e || item.end || 0) - Number(item.s || item.start || 0)) || 2.0;
      const budget = Math.max(8, Math.round(dur * 12));
      return {
        id: idx + 1,
        origId: item.id != null ? item.id : idx + 1,
        text: item.text || item.t || '',
        sourceText: item.sourceText || '',
        durationSec: Math.round(dur * 10) / 10,
        charBudget: budget
      };
    });

    const systemPrompt = `You are an elite master movie dialogue adapter and cinema dubbing script doctor for Khmer cinema (អ្នកនិពន្ធ និងសម្រួលពាក្យពេចន៍បញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).
The provided Khmer dialogue line(s) are too long for their speech timing budget (exceeding speech duration).
Your task is to condense, shorten, and punch up the spoken Khmer line so it takes fewer syllables to speak, while strictly preserving the emotional intensity, natural flow, and core meaning.

CRITICAL RULES:
1. PURE SPOKEN KHMER (ភាសានិយាយពិតៗ):
   - Cut wordy literary prefixes like "តើ", "កំពុងតែ", "សូមមេត្តា".
   - Replace long phrases with punchy colloquial cinema speech:
     * "តើអ្នកកំពុងធ្វើអ្វីនៅទីនេះ?" -> "ធ្វើអីហ្នឹង?"
     * "ខ្ញុំមិនដឹងអំពីបញ្ហានេះទេ" -> "អត់ដឹងផង!"
     * "តើអ្នកពិតជាគិតដូច្នោះឬ?" -> "គិតចឹងមែន?"
     * "សូមរង់ចាំខ្ញុំបន្តិចសិន" -> "ចាំបន្តិច!"
2. FIT TIMING BUDGET:
   - Output length MUST fit strictly within 'charBudget' (~12 chars per second).
3. NATURAL CINEMA DUBBING:
   - Keep natural pronouns and emotional punch.
4. JSON RESPONSE:
   - Return a JSON array with one object per id:
     - id: integer
     - condensedText: string (the best shortened spoken Khmer line)
     - alternatives: array of strings (1-2 other concise spoken variations)`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Condense and shorten these Khmer dubbing lines to fit speech timing:\n' +
                    JSON.stringify(payloadItems.map(p => ({
                      id: p.id,
                      text: p.text,
                      sourceText: p.sourceText,
                      durationSec: p.durationSec,
                      charBudget: p.charBudget
                    })))
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
              condensedText: { type: 'STRING' },
              alternatives: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['id', 'condensedText']
          }
        },
        temperature: 0.2
      }
    };

    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const json = await response.json();
        keyPool.markSuccess(apiKey);

        const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawContent) {
          throw new Error('Gemini returned empty response for condense request');
        }

        const parsed = JSON.parse(rawContent);
        if (!Array.isArray(parsed)) {
          throw new Error('Gemini response is not an array');
        }

        const idMap = new Map(payloadItems.map(p => [p.id, p.origId]));
        return parsed.map(item => ({
          id: idMap.get(item.id) || item.id,
          condensedText: item.condensedText,
          alternatives: item.alternatives || []
        }));
      } catch (err) {
        lastError = err;
        logger.warn(`Condense failed on model ${modelName}: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('Gemini condense failed across all candidate models');
  }
}

module.exports = GeminiTranslationProvider;
