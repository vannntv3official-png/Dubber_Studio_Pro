/**
 * CodeCraft AI Gateway Translation Provider
 * Connects to CodeCraft API (OpenAI-compatible gateway at https://codecraftapi.com/v1)
 * providing access to Claude (Sonnet/Haiku), GPT-4o, DeepSeek, and Gemini for
 * high-fidelity subtitle translation and dialogue line condensing.
 */

const BaseTranslationProvider = require('./base');
const settingsService = require('../../settings');
const codecraftKeyPool = require('../../codecraft-pool');
const pronunciationService = require('../../pronunciation');
const logger = require('../../../utils/logger');

class CodecraftTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('codecraft');
    this.abortController = null;
    this.maxBatchRetries = 3;
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    this.abortController = new AbortController();

    const settings = settingsService.get();
    const config = settings.codecraft || {};

    let apiKey = (options.apiKey || config.apiKey || '').trim();
    if (!apiKey && codecraftKeyPool.hasKeys()) {
      try {
        apiKey = codecraftKeyPool.getNextKey();
      } catch (_) {}
    }
    if (!apiKey) {
      throw new Error('CodeCraft API Key not configured. Please add your CodeCraft API key in Settings.');
    }

    const rawBaseUrl = (options.baseUrl || config.baseUrl || 'https://codecraftapi.com/v1').trim();
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    let model = (options.model || config.translationModel || 'gemini-3.7-flash').trim();
    if (model === 'gemini-3.8-flash' || model.startsWith('gemini-3.5')) {
      model = config.translationModel && config.translationModel !== 'gemini-3.8-flash'
        ? config.translationModel
        : 'gemini-3.7-flash';
    }
    const targetLang = options.targetLang || 'Khmer';
    const batchSize = Math.min(50, Math.max(10, options.batchSize || config.batchSize || 25));
    const tone = options.tone || 'cinema';

    logger.info(`CodeCraft Translation: Translating ${segments.length} segments with model '${model}' via ${baseUrl}`);

    // Assemble glossary & pronunciation dictionary
    const glossarySections = [];
    if (options.glossary && typeof options.glossary === 'string' && options.glossary.trim()) {
      glossarySections.push(`[Project Glossary & Custom Translations]:\n${options.glossary.trim()}`);
    }

    try {
      if (pronunciationService && typeof pronunciationService.getAll === 'function') {
        const pronRules = pronunciationService.getAll();
        if (Array.isArray(pronRules) && pronRules.length > 0) {
          const rulesFormatted = pronRules
            .filter(r => r && r.written && r.spoken)
            .map(r => `• "${r.written}" -> "${r.spoken}"`)
            .join('\n');
          if (rulesFormatted) {
            glossarySections.push(`[Pronunciation & Translation Rules]:\n${rulesFormatted}`);
          }
        }
      }
    } catch (_) {}

    const glossaryPrompt = glossarySections.length > 0
      ? `\n\nSTRICT GLOSSARY & TERMINOLOGY INSTRUCTIONS:\n${glossarySections.join('\n\n')}\n`
      : '';

    const results = [];
    const totalBatches = Math.ceil(segments.length / batchSize);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (this.isCancelled) {
        logger.info('CodeCraft translation cancelled by user.');
        break;
      }

      const start = batchIdx * batchSize;
      const end = Math.min(start + batchSize, segments.length);
      const batch = segments.slice(start, end);

      const pct = Math.round((batchIdx / totalBatches) * 100);
      if (typeof onProgress === 'function') {
        onProgress({
          current: start,
          total: segments.length,
          percent: pct,
          message: `CodeCraft (${model}): Translating batch ${batchIdx + 1} of ${totalBatches}...`
        });
      }

      const translatedBatch = await this._translateBatchWithRetry({
        batch,
        batchIdx,
        totalBatches,
        apiKey,
        baseUrl,
        model,
        targetLang,
        tone,
        glossaryPrompt
      });

      results.push(...translatedBatch);
    }

    if (typeof onProgress === 'function' && !this.isCancelled) {
      onProgress({
        current: segments.length,
        total: segments.length,
        percent: 100,
        message: `CodeCraft: Completed translating ${results.length} lines.`
      });
    }

    return results;
  }

  async _translateBatchWithRetry({ batch, batchIdx, totalBatches, apiKey, baseUrl, model, targetLang, tone, glossaryPrompt }) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxBatchRetries; attempt++) {
      if (this.isCancelled) break;

      let currentKey = apiKey;
      if (codecraftKeyPool.hasKeys()) {
        try {
          currentKey = codecraftKeyPool.getNextKey();
        } catch (_) {
          currentKey = apiKey;
        }
      }

      try {
        const systemPrompt = `You are a world-class professional subtitle translator and localization expert specializing in natural, fluent, emotionally engaging spoken ${targetLang} for cinema, television, and video dubbing.

Style Guidelines:
- Target Language: ${targetLang}
- Cinematic Tone: ${tone}
- Translate naturally into modern spoken ${targetLang} that actors would comfortably say out loud in dialogue.
- Maintain dialogue flow, character personality, and comedic/dramatic rhythm.
- Preserve all line IDs strictly.
- Return ONLY valid JSON formatted as an array of objects: [{"id": number, "translatedText": "..."}]. Do not enclose with backticks or markdown if possible.${glossaryPrompt}`;

        const dialogueLines = batch.map(seg => {
          const speakerInfo = seg.speaker ? ` [Speaker: ${seg.speaker}]` : '';
          return `ID ${seg.id}${speakerInfo}: "${seg.text || seg.t || ''}"`;
        }).join('\n');

        const userPrompt = `Translate the following dialogue lines into ${targetLang} according to the instructions:\n\n${dialogueLines}\n\nReturn strictly valid JSON: [{"id": <number>, "translatedText": "<translated string>"}]`;

        const requestBody = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        };

        const timeoutMs = 25000;
        const reqController = new AbortController();
        const timeoutId = setTimeout(() => reqController.abort(new Error(`CodeCraft request timed out after ${timeoutMs / 1000}s`)), timeoutMs);

        let response;
        try {
          response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentKey}`
            },
            body: JSON.stringify(requestBody),
            signal: reqController.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          if (response.status === 429 || response.status === 401) {
            codecraftKeyPool.markCooldown(currentKey, 45000);
          }
          const errText = await response.text();
          let msg = `HTTP ${response.status}`;
          try {
            const errObj = JSON.parse(errText);
            if (errObj.error?.message) msg = errObj.error.message;
          } catch (_) {
            if (errText) msg = errText.slice(0, 200);
          }

          if (/does not exist|do not have access to it/i.test(msg) && model !== 'gemini-3.7-flash') {
            logger.warn(`Model '${model}' not available on CodeCraft. Auto-fallback to 'gemini-3.7-flash'...`);
            model = 'gemini-3.7-flash';
            requestBody.model = 'gemini-3.7-flash';
            continue;
          }

          throw new Error(`CodeCraft API error (${msg})`);
        }

        const data = await response.json();
        codecraftKeyPool.markSuccess(currentKey);
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = this._parseJsonOutput(content);

        // Map parsed translations to original batch items
        const resultMap = new Map();
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id != null && item.translatedText != null) {
              resultMap.set(Number(item.id), String(item.translatedText).trim());
            }
          }
        }

        return batch.map(seg => ({
          id: seg.id,
          translatedText: resultMap.get(Number(seg.id)) || seg.text || seg.t || ''
        }));
      } catch (err) {
        if (this.isCancelled || err.name === 'AbortError') {
          return batch.map(seg => ({ id: seg.id, translatedText: seg.text || seg.t || '' }));
        }

        lastError = err;
        logger.warn(`CodeCraft translation batch ${batchIdx + 1} attempt ${attempt} failed: ${err.message}`);
        if (attempt < this.maxBatchRetries) {
          await new Promise(r => setTimeout(r, 1200 * attempt));
        }
      }
    }

    logger.error(`CodeCraft translation batch ${batchIdx + 1} failed after ${this.maxBatchRetries} attempts: ${lastError?.message}`);
    // Fallback: return original text for this batch so workflow is not aborted
    return batch.map(seg => ({ id: seg.id, translatedText: seg.text || seg.t || '' }));
  }

  async condense(items, options = {}) {
    this.isCancelled = false;
    const settings = settingsService.get();
    const config = settings.codecraft || {};

    let apiKey = (options.apiKey || config.apiKey || '').trim();
    if (!apiKey && codecraftKeyPool.hasKeys()) {
      try {
        apiKey = codecraftKeyPool.getNextKey();
      } catch (_) {}
    }
    if (!apiKey) {
      throw new Error('CodeCraft API Key not configured. Please add your CodeCraft API key in Settings.');
    }

    const rawBaseUrl = (options.baseUrl || config.baseUrl || 'https://codecraftapi.com/v1').trim();
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    let model = (options.model || config.translationModel || 'gemini-3.7-flash').trim();
    if (model === 'gemini-3.8-flash' || model.startsWith('gemini-3.5')) {
      model = config.translationModel && config.translationModel !== 'gemini-3.8-flash'
        ? config.translationModel
        : 'gemini-3.7-flash';
    }

    const list = Array.isArray(items) ? items : [items];
    if (list.length === 0) return [];

    logger.info(`CodeCraft Condense: Condensing ${list.length} lines with model '${model}'`);

    const promptItems = list.map(item => {
      const charCount = (item.text || item.t || '').length;
      const durationSec = (item.end || item.e || 0) - (item.start || item.s || 0);
      return `ID ${item.id}: "${item.text || item.t || ''}" (Current length: ${charCount} chars, Speech duration: ${durationSec.toFixed(1)}s)`;
    }).join('\n');

    const systemPrompt = `You are an expert subtitle timing and dialogue editor for video dubbing in Khmer.
Your goal is to shorten ("condense") spoken dialogue lines so they fit rapidly into limited audio duration without speaking too fast.
Guidelines:
- Maintain core meaning and natural Khmer phrasing.
- Remove redundant filler words, polite redundancies, or long descriptors.
- Provide a primary concise version ("condensedText") and optionally 1-2 alternative short versions ("alternatives").
- Output strictly JSON: [{"id": number, "condensedText": string, "alternatives": string[]}]`;

    const userPrompt = `Shorten the following dialogue lines concisely:\n\n${promptItems}\n\nReturn strictly valid JSON: [{"id": number, "condensedText": string, "alternatives": string[]}]`;

    if (this.isCancelled) {
      throw new Error('Translation cancelled by user.');
    }

    this.abortController = new AbortController();
    const timeout = setTimeout(() => {
      if (this.abortController) this.abortController.abort();
    }, 60000);

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3
        }),
        signal: this.abortController.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (this.isCancelled) {
      throw new Error('Translation cancelled by user.');
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CodeCraft condense request failed: ${errText.slice(0, 150)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = this._parseJsonOutput(content);

    const resultMap = new Map();
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && item.id != null) {
          resultMap.set(Number(item.id), {
            condensedText: item.condensedText || '',
            alternatives: Array.isArray(item.alternatives) ? item.alternatives : []
          });
        }
      }
    }

    return list.map(item => {
      const found = resultMap.get(Number(item.id));
      return {
        id: item.id,
        condensedText: found ? found.condensedText : (item.text || item.t || ''),
        alternatives: found ? found.alternatives : []
      };
    });
  }

  _parseJsonOutput(text) {
    if (!text || typeof text !== 'string') return [];
    try {
      // Direct parse
      return JSON.parse(text);
    } catch (_) {}

    // Extract between code block or brackets
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (_) {}
    }

    return [];
  }

  cancel() {
    this.isCancelled = true;
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (_) {}
    }
  }
}

module.exports = CodecraftTranslationProvider;
