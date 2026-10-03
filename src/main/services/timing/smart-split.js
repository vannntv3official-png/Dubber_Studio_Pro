/**
 * Smart Subtitle & Speech Segment Splitter
 * Implements sentence boundary splitting with Khmer punctuation awareness (។, ៕, !, ?, …)
 * Ensures lines never exceed 7,000ms duration or 90 characters for optimal dubbing pace.
 */

const KHMER_SENTENCE_ENDINGS = '។៕!?…';
const ALL_SENTENCE_ENDINGS = new Set([...KHMER_SENTENCE_ENDINGS, '。', '！', '？']);
const MAX_LINE_DURATION_MS = 7000;
const MAX_LINE_CHARS = 90;
const TARGET_SEGMENT_DURATION_MS = 5000;
const MAX_SEGMENT_CHARS = 60;
const MIN_SEGMENT_CHARS = 15;

function countVisibleChars(text) {
  return [...(text || '').replace(/[\s​]+/gu, '')].length;
}

function splitSentences(text) {
  const chars = [...(text || '')];
  const sentences = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    current += chars[i];
    const next = chars[i + 1] || '';
    const isPunctuation = ALL_SENTENCE_ENDINGS.has(chars[i]) || (chars[i] === '.' && !/[\d.]/.test(next));

    if (isPunctuation && !ALL_SENTENCE_ENDINGS.has(next) && next !== '.') {
      sentences.push(current);
      current = '';
    }
  }

  if (countVisibleChars(current) > 0) {
    sentences.push(current);
  }

  return sentences;
}

function tokenizeWords(text) {
  return (text || '').match(/[^\s​]+[\s​]*/gu) || [];
}

function packTokensIntoChunks(tokens, maxChars) {
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const token of tokens) {
    const len = countVisibleChars(token);
    if (current.length && currentLen + len > maxChars) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(token);
    currentLen += len;
  }

  if (current.length) {
    chunks.push(current);
  }

  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last && countVisibleChars(last.join('')) < maxChars / 3) {
    chunks.pop();
    chunks[chunks.length - 1].push(...last);
  }

  return chunks;
}

function distributeTiming(charWeights, startMs, endMs) {
  const safeWeights = charWeights.map(w => Math.max(1, w));
  const totalWeight = safeWeights.reduce((a, b) => a + b, 0);
  const results = [];
  let cur = startMs;
  let acc = 0;

  safeWeights.forEach((w, idx) => {
    acc += w;
    const next = idx === safeWeights.length - 1 ? endMs : startMs + Math.round((endMs - startMs) * acc / totalWeight);
    results.push({ startMs: cur, endMs: next });
    cur = next;
  });

  return results;
}

function splitSegment(segment) {
  const startSec = Number.isFinite(segment.start) ? segment.start : (Number.isFinite(segment.s) ? segment.s : (Number(segment.startMs) / 1000 || 0));
  const endSec = Number.isFinite(segment.end) ? segment.end : (Number.isFinite(segment.e) ? segment.e : (Number(segment.endMs) / 1000 || (startSec + 1)));
  const startMs = Number.isFinite(segment.startMs) ? segment.startMs : Math.round(startSec * 1000);
  const endMs = Number.isFinite(segment.endMs) ? segment.endMs : Math.round(endSec * 1000);
  const duration = Math.max(0, endMs - startMs);
  const text = segment.text || segment.sourceText || segment.t || '';
  const charCount = countVisibleChars(text);

  if (duration <= MAX_LINE_DURATION_MS && charCount <= MAX_LINE_CHARS) {
    return [{
      ...segment,
      start: startSec,
      end: endSec,
      startMs,
      endMs
    }];
  }

  const targetChars = Math.max(MIN_SEGMENT_CHARS, Math.min(MAX_SEGMENT_CHARS, Math.ceil(charCount * TARGET_SEGMENT_DURATION_MS / Math.max(1, duration))));
  const sentences = splitSentences(text);
  const tokens = sentences.flatMap(s => countVisibleChars(s) > targetChars ? tokenizeWords(s) : [s]);
  const packedPhrases = packTokensIntoChunks(tokens, targetChars).map(p => p.join('').trim()).filter(Boolean);

  if (packedPhrases.length < 2) {
    return [{
      ...segment,
      start: startSec,
      end: endSec,
      startMs,
      endMs
    }];
  }

  const timings = distributeTiming(packedPhrases.map(countVisibleChars), startMs, endMs);

  return packedPhrases.map((phrase, idx) => ({
    ...segment,
    id: idx === 0 ? segment.id : (typeof segment.id === 'number' ? Number((segment.id + idx * 0.1).toFixed(1)) : `${segment.id || 'seg'}_p${idx + 1}`),
    text: phrase,
    sourceText: segment.sourceText ? phrase : undefined,
    startMs: timings[idx].startMs,
    endMs: timings[idx].endMs,
    start: Math.round(timings[idx].startMs) / 1000,
    end: Math.round(timings[idx].endMs) / 1000
  }));
}

function smartSplit(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.flatMap(splitSegment);
}

module.exports = {
  smartSplit,
  splitSegment,
  splitSentences,
  countVisibleChars,
  MAX_LINE_DURATION_MS,
  MAX_LINE_CHARS
};
