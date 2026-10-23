const BaseTranslationProvider = require('./base');
const keyPool = require('../../key-pool');
const settingsService = require('../../settings');
const pronunciationService = require('../../pronunciation');
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
  'gemini-3.1-pro-preview'
];

class GeminiTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('gemini');
    this.maxBatchRetries = 3;
    this.activeControllers = new Set();
  }

  cancel() {
    super.cancel();
    for (const controller of this.activeControllers) {
      try { controller.abort(); } catch (_) {}
    }
    this.activeControllers.clear();
  }

  _parseJsonArray(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return null;
    const cleanContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const direct = JSON.parse(cleanContent);
      if (Array.isArray(direct)) return direct;
    } catch (_) {}

    // Regex match outermost array: [ ... ]
    const bracketMatch = cleanContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (bracketMatch) {
      try {
        const fromMatch = JSON.parse(bracketMatch[0]);
        if (Array.isArray(fromMatch)) return fromMatch;
      } catch (_) {}
    }

    // Try stripping invalid control characters
    try {
      const sanitized = cleanContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''));
      const repaired = JSON.parse(sanitized);
      if (Array.isArray(repaired)) return repaired;
    } catch (_) {}

    return null;
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    this.activeControllers.clear();

    keyPool.ensureKeysLoaded();
    if (!keyPool.keys || keyPool.keys.length === 0) {
      throw new Error('No Gemini API keys configured. Please add an API key in Settings (⚙️).');
    }

    const settings = settingsService.get();
    const rawModel = options.model || settings.gemini?.translationModel || settings.geminiModel || 'gemini-3.8-flash';
    const primaryModel = rawModel.replace(/^models\//, '');
    const targetLang = options.targetLang || 'Khmer';
    const batchSize = Math.min(50, Math.max(10, options.batchSize || 30));
    const tone = options.tone || options.genre || 'cinema';

    // Auto-assemble comprehensive glossary from user project, pronunciation dictionary, and cast
    const glossarySections = [];
    if (options.glossary && typeof options.glossary === 'string' && options.glossary.trim()) {
      glossarySections.push(`[Project Glossary & Custom Translations]:\n${options.glossary.trim()}`);
    }

    // Auto-inject user's Pronunciation Dictionary rules from Settings
    try {
      if (pronunciationService && typeof pronunciationService.getAll === 'function') {
        const pronRules = pronunciationService.getAll();
        if (Array.isArray(pronRules) && pronRules.length > 0) {
          const rulesFormatted = pronRules
            .filter(r => r && r.written && r.spoken)
            .map(r => `  * "${r.written}" -> "${r.spoken}"`)
            .join('\n');
          if (rulesFormatted) {
            glossarySections.push(`[User Phonetic & Proper Noun Rules (Always follow these exact word mappings)]:\n${rulesFormatted}`);
          }
        }
      }
    } catch (e) {
      logger.warn(`Could not load pronunciation rules for translation: ${e.message}`);
    }

    // Auto-inject Cast Character Mappings & Vocal Roles
    if (Array.isArray(options.cast) && options.cast.length > 0) {
      const castFormatted = options.cast
        .filter(c => c && (c.name || c.speaker))
        .map(c => `  * ${c.speaker || c.id || 'Speaker'}: ${c.name || ''} (${c.gender || c.vocalType || 'voice'}${c.role ? `, ${c.role}` : ''})`)
        .join('\n');
      if (castFormatted) {
        glossarySections.push(`[Character Cast & Interpersonal Dynamics]:\n${castFormatted}`);
      }
    }

    const combinedGlossary = glossarySections.join('\n\n');

    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    logger.info(`Starting Gemini Translation: total=${segments.length}, target=${targetLang}, primaryModel=${primaryModel}, batchSize=${batchSize}, tone=${tone}`);

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

    const configuredConcurrency = Math.max(1, Math.min(6, Number(settings.gemini?.maxConcurrency) || 3));
    const maxConcurrency = Math.min(batches.length, configuredConcurrency);
    logger.info(`Gemini Translation: Dispatching ${batches.length} batch(es) with concurrency ${maxConcurrency}...`);
    const batchResults = new Array(batches.length);
    let queueIdx = 0;
    let processedCount = 0;

    const worker = async () => {
      while (queueIdx < batches.length) {
        if (this.isCancelled) {
          throw new Error('Translation cancelled by user.');
        }

        const curBatchIdx = queueIdx++;
        if (curBatchIdx >= batches.length) break;

        const batch = batches[curBatchIdx];
        const batchTranslations = await this.translateBatchWithRetry(batch, segments, {
          targetLang,
          glossary: combinedGlossary,
          tone,
          batchNum: curBatchIdx + 1,
          totalBatches: batches.length,
          state: translationState,
          onProgress
        });

        batchResults[curBatchIdx] = batchTranslations;
        processedCount += batch.length;

        if (typeof onProgress === 'function') {
          const percent = Math.min(95, Math.round((processedCount / segments.length) * 100));
          onProgress({
            current: processedCount,
            total: segments.length,
            percent,
            message: `Translating batch ${curBatchIdx + 1}/${batches.length} (${processedCount}/${segments.length})...`
          });
        }
      }
    };

    const workers = [];
    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (this.isCancelled) {
      throw new Error('Translation cancelled by user.');
    }
    const allResults = batchResults.flat();

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
    let consecutiveNetworkErrors = 0;
    const totalKeys = (keyPool.keys && keyPool.keys.length > 0) ? keyPool.keys.length : 1;
    const maxBatchAttempts = Math.min(Math.max(totalKeys, 2), 4);
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

        pendingItems = pendingItems.filter(seg => !resolvedMap.has(String(seg.id)));

        if (pendingItems.length > 0) {
          logger.warn(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts}: ${pendingItems.length} items missing. Retrying...`);
        }
      } catch (err) {
        lastError = err;
        logger.error(`Batch ${config.batchNum} attempt ${attempt}/${maxBatchAttempts} error: ${err.message}`);

        if (this.isCancelled) throw new Error('Translation cancelled by user.');

        // Fast-fail non-retryable errors immediately to avoid hanging the UI
        if (err.message.includes('No Gemini API keys') ||
            err.message.includes('API key not valid') ||
            err.message.includes('API_KEY_INVALID') ||
            err.message.includes('PERMISSION_DENIED')) {
          throw err;
        }

        // Fast-fail persistent network drops, 503 high demand spikes, or timeouts to trigger cross-engine failover
        const isNetworkOrTimeout = err.message.includes('[GEMINI_NETWORK_TIMEOUT]') ||
          /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timed out|timeout|AbortError|503|overloaded|high demand/i.test(err.message);

        if (isNetworkOrTimeout) {
          consecutiveNetworkErrors++;
          if (consecutiveNetworkErrors >= 2 || attempt >= Math.min(totalKeys, 3)) {
            logger.warn(`Gemini network/timeout/503 error persisted across ${consecutiveNetworkErrors} attempt(s). Triggering immediate failover.`);
            throw new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini connection failed, overloaded, or timed out: ${err.message}`);
          }
        } else {
          consecutiveNetworkErrors = 0;
        }

        if (err.message.includes('[DAILY_QUOTA_EXHAUSTED]')) {
          if (config.state.modelIdx < 1 && config.state.modelIdx < config.state.candidateModels.length - 1) {
            config.state.modelIdx++;
            const nextModel = config.state.candidateModels[config.state.modelIdx];
            logger.info(`Translation batch ${config.batchNum}: Auto-switching from ${config.state.model} to fallback model: ${nextModel}`);
            config.state.model = nextModel;
            keyPool.resetCooldowns();
            attempt = 0;
            if (typeof config.onProgress === 'function') {
              config.onProgress({
                percent: Math.min(95, 20 + Math.round((config.batchNum / config.totalBatches) * 70)),
                message: `Quota reached on previous model. Auto-switching to ${nextModel}...`
              });
            }
            await new Promise(r => setTimeout(r, 600));
            continue;
          } else {
            // Already tried fallback model or all models exhausted, fast-fail immediately to trigger CodeCraft failover
            throw new Error(`[DAILY_QUOTA_EXHAUSTED] All Gemini model quotas exhausted: ${err.message}`);
          }
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

    const firstIdx = allSegments.findIndex(s => String(s.id) === String(items[0]?.id));
    const lastIdx = allSegments.findIndex(s => String(s.id) === String(items[items.length - 1]?.id));
    const sceneBefore = (firstIdx > 0 && allSegments[firstIdx - 1]?.text) ? allSegments[firstIdx - 1].text : '';
    const sceneAfter = (lastIdx >= 0 && lastIdx < allSegments.length - 1 && allSegments[lastIdx + 1]?.text) ? allSegments[lastIdx + 1].text : '';

    const contextItems = items.map((item, i) => {
      const duration = Math.max(1.0, (Number(item.end || item.e || 0) - Number(item.start || item.s || 0)));
      const charBudget = Math.round(duration * 12);

      return {
        id: i + 1,
        origId: String(item.id),
        text: item.text || item.t || '',
        speaker: item.speaker || 'Speaker',
        gender: item.gender || item.vocalType || 'unknown',
        durationSec: Math.round(duration * 10) / 10,
        charBudget
      };
    });

    const isKhmer = !config.targetLang || config.targetLang.toLowerCase().includes('khmer') || config.targetLang.toLowerCase() === 'km';

    let toneInstruction = '';
    if (config.tone === 'comedy') {
      toneInstruction = '\nGENRE TONE (COMEDY / ACTION): Use punchy, humorous, colloquial expressions with lively street cinema energy. Keep insults or exclamations witty and energetic.';
    } else if (config.tone === 'romance') {
      toneInstruction = '\nGENRE TONE (ROMANCE / MELODRAMA): Use gentle, tender, emotionally expressive dialogue (e.g. sweet បង/អូន, ស្រទន់, រំជួលចិត្ត). Avoid harsh street slang.';
    } else if (config.tone === 'historical') {
      toneInstruction = '\nGENRE TONE (HISTORICAL / MARTIAL ARTS): Use classic period dialogue, respectful Khmer vocabulary (e.g. លោកម្ចាស់, មេទ័ព, ទូលបង្គំ, ម្ចាស់បង), and martial arts cinema flavor.';
    } else if (config.tone === 'documentary') {
      toneInstruction = '\nGENRE TONE (DOCUMENTARY / FORMAL): Use clear, articulate, professional Khmer spoken narration. Maintain accuracy and dignity.';
    }

    const systemPrompt = isKhmer ? `You are an elite master movie dubbing adapter and dialogue writer for Khmer cinema and drama dubbing (អ្នកនិពន្ធ និងបកប្រែពាក្យសំដីបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).
Your task is to translate source dialogue lines into vibrant, natural, emotionally authentic spoken Khmer (ភាសានិយាយបញ្ចូលសំឡេងរស់រវើក) specifically crafted for voice actors and TTS engines.
${toneInstruction}

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
   - Use provided "speaker", "gender", and dialogue flow to infer exact interpersonal relationships:
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

5. CONVERSATION FLOW:
   - Lines are in sequential dialogue order. Maintain conversational continuity across turns.
   - Translate ONLY the specified line. Never combine lines or change line order.

6. NAMES & GLOSSARY:
   - Strictly follow all provided Project Glossary rules, Pronunciation Rules, and Character Cast mappings below.
   - Transcribe foreign/character names into standard phonetic Khmer script accurately and keep them consistent.
   - Never leave any line untranslated.
${config.glossary ? `\nSeries Glossary, Pronunciation Rules & Character Names:\n${config.glossary}` : ''}

7. EXACT 1-TO-1 MAPPING:
   - Return exactly one translated output line for each numeric id (${contextItems.length} lines in, ${contextItems.length} lines out).`
: `You are an expert dubbing translator and dialogue adapter.
Translate dialogue lines into natural, concise spoken ${config.targetLang} for dubbing.
${toneInstruction}

Dubbing Rules:
1. Spoken Phrasing: Translate for the ear, natural colloquial speech that sounds like a real person talking. Never translate literally.
2. Context Awareness: Use 'speaker' and conversational sequence for tone and relationship flow.
3. Timing Budget: Prefer wording that can be spoken naturally inside each line's durationSec and charBudget.
4. Invariant 1-to-1 Mapping: Return exactly one translation per numeric id (${contextItems.length} lines in, ${contextItems.length} lines out).
${config.glossary ? `\nSeries Glossary, Pronunciation Rules & Names:\n${config.glossary}` : ''}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Translate every line into natural, authentic spoken ${config.targetLang}.\n` +
                    (sceneBefore ? `Preceding dialogue context: "${sceneBefore}"\n` : '') +
                    (sceneAfter ? `Following dialogue context: "${sceneAfter}"\n` : '') +
                    `Dialogue lines to translate (in chronological order):\n` +
                    JSON.stringify(contextItems.map(c => {
                      const item = {
                        id: c.id,
                        speaker: c.speaker,
                        text: c.text,
                        durationSec: c.durationSec,
                        charBudget: c.charBudget
                      };
                      if (c.gender && c.gender !== 'unknown') item.gender = c.gender;
                      return item;
                    }))
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
        temperature: 0.25,
        ...(currentModel.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {})
      }
    };

    const controller = new AbortController();
    this.activeControllers.add(controller);
    const timeoutMs = 25000;
    const timeoutId = setTimeout(() => controller.abort(new Error(`Gemini API request timed out after ${timeoutMs / 1000}s`)), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (fetchErr) {
      if (this.isCancelled) throw new Error('Translation cancelled by user.');
      if (controller.signal.aborted) {
        throw new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini API request timed out after ${timeoutMs / 1000}s`);
      }
      throw new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini network connection failed: ${fetchErr.message}`);
    } finally {
      clearTimeout(timeoutId);
      this.activeControllers.delete(controller);
    }

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

    const parsed = this._parseJsonArray(rawContent);
    if (!parsed || !Array.isArray(parsed)) {
      throw new Error(`Gemini translation response JSON parse failed or output is not an array: ${rawContent.slice(0, 150)}`);
    }

    const numericMap = new Map();
    contextItems.forEach((c, idx) => {
      numericMap.set(c.id, c.origId);
      numericMap.set(String(c.id), c.origId);
      numericMap.set(c.origId, c.origId);
      numericMap.set(String(c.origId), c.origId);
      numericMap.set(idx + 1, c.origId);
      numericMap.set(String(idx + 1), c.origId);
    });

    return parsed.map((item, idx) => {
      const resolvedId = numericMap.get(item.id) ??
                         numericMap.get(Number(item.id)) ??
                         numericMap.get(String(item.id)) ??
                         contextItems[idx]?.origId ??
                         String(item.id);
      return {
        id: resolvedId,
        translatedText: item.translatedText
      };
    });
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
        if (modelName.startsWith('gemini-3')) {
          requestBody.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
        } else {
          delete requestBody.generationConfig.thinkingConfig;
        }
        const controller = new AbortController();
        this.activeControllers.add(controller);
        const timeoutMs = 25000;
        const timeoutId = setTimeout(() => controller.abort(new Error(`Gemini API request timed out after ${timeoutMs / 1000}s`)), timeoutMs);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        let response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
        } catch (fetchErr) {
          if (this.isCancelled) throw new Error('Condense cancelled by user.');
          if (controller.signal.aborted) {
            throw new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini condense timed out after ${timeoutMs / 1000}s`);
          }
          throw new Error(`[GEMINI_NETWORK_TIMEOUT] Gemini condense connection failed: ${fetchErr.message}`);
        } finally {
          clearTimeout(timeoutId);
          this.activeControllers.delete(controller);
        }

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

        const parsed = this._parseJsonArray(rawContent);
        if (!parsed || !Array.isArray(parsed)) {
          throw new Error(`Gemini condense response JSON parse failed or output is not an array: ${rawContent.slice(0, 150)}`);
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
