/**
 * Subtitle Parsing & Serialization Utility
 * Supports SRT and WebVTT formats with millisecond precision
 */

function timeStringToSeconds(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr || typeof timeStr !== 'string') return 0;

  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hours * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  return parseFloat(clean) || 0;
}

function secondsToSrtTime(totalSec) {
  const s = Math.max(0, Number(totalSec) || 0);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

function secondsToVttTime(totalSec) {
  const s = Math.max(0, Number(totalSec) || 0);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

function secondsToCompactTime(totalSec) {
  const s = Math.max(0, Number(totalSec) || 0);
  const mins = Math.floor(s / 60);
  const rem = (s % 60).toFixed(2);
  return `${String(mins).padStart(2, '0')}:${rem.padStart(5, '0')}`;
}

/**
 * Parse an SRT string into an array of subtitle objects
 */
function parseSrt(srtContent) {
  if (!srtContent) return [];
  // Normalize line endings and strip BOM
  const normalized = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.trim().split(/\n\s*\n/);
  const segments = [];
  let idCounter = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    // Line 0 is often sequential index: "1"
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIdx = 1;
    }

    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map(s => s.trim().split(' ')[0]);
    const startSec = timeStringToSeconds(startRaw);
    const endSec = timeStringToSeconds(endRaw);

    const textLines = lines.slice(timeLineIdx + 1);
    const text = textLines.join(' ').trim();

    if (text.length > 0 && endSec > startSec) {
      segments.push({
        id: idCounter++,
        s: Math.round(startSec * 100) / 100,
        e: Math.round(endSec * 100) / 100,
        t: text,
        sourceText: text,
        v: 0,
        sp: 1.0,
        ok: false,
        ck: false
      });
    }
  }

  return resolveOverlaps(segments);
}

/**
 * Parse a WebVTT string into an array of subtitle objects
 */
function parseVtt(vttContent) {
  if (!vttContent) return [];
  const normalized = vttContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip header
  const body = normalized.replace(/^WEBVTT[^\n]*\n+/i, '');
  const blocks = body.trim().split(/\n\s*\n/);
  const segments = [];
  let idCounter = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let timeLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [startRaw, endRawWithSettings] = timeLine.split('-->').map(s => s.trim());
    // Strip WebVTT cue settings like line:0% position:50%
    const endRaw = endRawWithSettings.split(/\s+/)[0];

    const startSec = timeStringToSeconds(startRaw);
    const endSec = timeStringToSeconds(endRaw);

    // Strip HTML/VTT tags like <v Speaker> or <b>
    const textLines = lines.slice(timeLineIdx + 1);
    const rawText = textLines.join(' ');
    const cleanText = rawText.replace(/<\/?[^>]+(>|$)/g, '').trim();

    if (cleanText.length > 0 && endSec > startSec) {
      segments.push({
        id: idCounter++,
        s: Math.round(startSec * 100) / 100,
        e: Math.round(endSec * 100) / 100,
        t: cleanText,
        sourceText: cleanText,
        v: 0,
        sp: 1.0,
        ok: false,
        ck: false
      });
    }
  }

  return resolveOverlaps(segments);
}

/**
 * Auto-detect and parse subtitle file
 */
function parseSubtitles(content) {
  if (!content) return [];
  if (content.trim().toUpperCase().startsWith('WEBVTT')) {
    return parseVtt(content);
  }
  return parseSrt(content);
}

/**
 * Serialize subtitle segments into SRT format
 */
function serializeToSrt(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '';
  const sorted = [...segments].sort((a, b) => a.s - b.s);

  return sorted.map((seg, idx) => {
    const num = idx + 1;
    const time = `${secondsToSrtTime(seg.s)} --> ${secondsToSrtTime(seg.e)}`;
    const text = String(seg.t || '').trim();
    return `${num}\n${time}\n${text}\n`;
  }).join('\n');
}

/**
 * Serialize subtitle segments into WebVTT format
 */
function serializeToVtt(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return 'WEBVTT\n\n';
  const sorted = [...segments].sort((a, b) => a.s - b.s);

  const cues = sorted.map((seg, idx) => {
    const time = `${secondsToVttTime(seg.s)} --> ${secondsToVttTime(seg.e)}`;
    const text = String(seg.t || '').trim();
    return `${idx + 1}\n${time}\n${text}`;
  }).join('\n\n');

  return `WEBVTT\n\n${cues}\n`;
}

/**
 * Detect overlapping subtitle segments in an array.
 * Returns a list of overlap records, each containing details about
 * the conflicting adjacent cues.
 *
 * @param {Array<object>} segments - Array of subtitle segments
 * @returns {Array<object>} Detected overlap records
 */
function detectOverlaps(segments) {
  if (!Array.isArray(segments) || segments.length < 2) return [];

  // Sort by start time for consistent sequential evaluation
  const sorted = [...segments].sort((a, b) => {
    const aS = Number(a.s != null ? a.s : a.start) || 0;
    const bS = Number(b.s != null ? b.s : b.start) || 0;
    return aS - bS;
  });

  const overlaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const nxt = sorted[i + 1];

    const curEnd = Number(cur.e != null ? cur.e : cur.end) || 0;
    const nxtStart = Number(nxt.s != null ? nxt.s : nxt.start) || 0;

    // Overlap threshold: 10 milliseconds (0.01s)
    if (curEnd > nxtStart + 0.01) {
      const dur = Math.round((curEnd - nxtStart) * 100) / 100;
      overlaps.push({
        index: i,
        prevId: cur.id,
        nextId: nxt.id,
        prevEnd: Math.round(curEnd * 100) / 100,
        nextStart: Math.round(nxtStart * 100) / 100,
        overlapDuration: dur
      });
    }
  }

  return overlaps;
}

/**
 * Automatically resolve overlapping subtitles.
 * Ensures each subtitle ends at or before the next subtitle begins,
 * while maintaining a minimum readable duration.
 *
 * @param {Array<object>} segments - Array of subtitle objects
 * @param {object} [options]
 * @param {number} [options.minGap=0.0] - Minimum gap between subtitles in seconds
 * @param {number} [options.minDuration=0.2] - Minimum segment duration in seconds
 * @returns {Array<object>} Resolved segments array
 */
function resolveOverlaps(segments, options = {}) {
  if (!Array.isArray(segments) || segments.length === 0) return segments;

  const minGap = options.minGap != null ? Math.max(0, Number(options.minGap)) : 0.0;
  const minDuration = options.minDuration != null ? Math.max(0.05, Number(options.minDuration)) : 0.2;

  // Sort by start time
  segments.sort((a, b) => {
    const aS = Number(a.s != null ? a.s : a.start) || 0;
    const bS = Number(b.s != null ? b.s : b.start) || 0;
    return aS - bS;
  });

  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i];
    let curStart = Number(cur.s != null ? cur.s : cur.start) || 0;
    let curEnd = Number(cur.e != null ? cur.e : cur.end) || 0;

    // Sanitize inverted duration
    if (curEnd <= curStart) {
      curEnd = curStart + minDuration;
    }

    if (i < segments.length - 1) {
      const nxt = segments[i + 1];
      let nxtStart = Number(nxt.s != null ? nxt.s : nxt.start) || 0;
      let nxtEnd = Number(nxt.e != null ? nxt.e : nxt.end) || 0;

      if (nxtEnd <= nxtStart) {
        nxtEnd = nxtStart + minDuration;
      }

      // Check if current overlaps with next (with minGap margin)
      const allowedCurEnd = nxtStart - minGap;
      if (curEnd > allowedCurEnd) {
        // If current segment can be trimmed without dropping below minDuration:
        if (allowedCurEnd >= curStart + minDuration) {
          curEnd = allowedCurEnd;
        } else {
          // Both segments overlap heavily or start near the same time:
          curEnd = curStart + minDuration;
          nxtStart = curEnd + minGap;
          if (nxtEnd <= nxtStart + minDuration) {
            nxtEnd = nxtStart + minDuration;
          }

          // Write updated next values
          if (nxt.s != null) nxt.s = Math.round(nxtStart * 100) / 100;
          if (nxt.e != null) nxt.e = Math.round(nxtEnd * 100) / 100;
          if (nxt.start != null) nxt.start = Math.round(nxtStart * 100) / 100;
          if (nxt.end != null) nxt.end = Math.round(nxtEnd * 100) / 100;
          if (nxt.startMs != null) nxt.startMs = Math.round(nxtStart * 1000);
          if (nxt.endMs != null) nxt.endMs = Math.round(nxtEnd * 1000);
        }
      }
    }

    // Write updated current values
    const roundS = Math.round(curStart * 100) / 100;
    const roundE = Math.round(curEnd * 100) / 100;

    if (cur.s != null) cur.s = roundS;
    if (cur.e != null) cur.e = roundE;
    if (cur.start != null) cur.start = roundS;
    if (cur.end != null) cur.end = roundE;
    if (cur.startMs != null) cur.startMs = Math.round(roundS * 1000);
    if (cur.endMs != null) cur.endMs = Math.round(roundE * 1000);
  }

  return segments;
}

// Universal module export
const SubtitleUtils = {
  timeStringToSeconds,
  secondsToSrtTime,
  secondsToVttTime,
  secondsToCompactTime,
  parseSrt,
  parseVtt,
  parseSubtitles,
  serializeToSrt,
  serializeToVtt,
  detectOverlaps,
  resolveOverlaps
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ...SubtitleUtils,
    SubtitleUtils
  };
}
