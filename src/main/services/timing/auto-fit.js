/**
 * Timing & Auto-Fit Engine
 * Calculates speech duration alignment, auto-fit tempo adjustments,
 * FFmpeg atempo filter chaining, and sync-end alignment.
 */

// Max tempo adjustment ranges per mode: [minRate, maxRate]
// e.g., Low allows ±15% (0.85x to 1.15x)
const AUTO_FIT_MODES = {
  off: { name: 'Off', minRate: 1.0, maxRate: 1.0 },
  low: { name: 'Low', minRate: 0.85, maxRate: 1.15 },
  med: { name: 'Med', minRate: 0.70, maxRate: 1.30 },
  high: { name: 'High', minRate: 0.50, maxRate: 2.00 }
};

/**
 * Builds an FFmpeg atempo filter chain string.
 * FFmpeg's `atempo` filter only accepts values strictly within [0.5, 2.0].
 * Values outside this range must be broken into a chained series of filters:
 * e.g., ratio 3.0 -> 'atempo=2.0000,atempo=1.5000' (2.0 * 1.5 = 3.0)
 * e.g., ratio 0.2 -> 'atempo=0.5000,atempo=0.5000,atempo=0.8000' (0.5 * 0.5 * 0.8 = 0.2)
 *
 * @param {number} speedRatio - Multiplier for audio playback speed (tempo)
 * @returns {Array<string>} Array of atempo filter arguments (e.g. ['atempo=2.0000', 'atempo=1.5000'])
 */
function buildAtempoChain(speedRatio) {
  if (typeof speedRatio !== 'number' || isNaN(speedRatio) || speedRatio <= 0) {
    return [];
  }

  // If within 0.5% of normal speed (1.0), no filter needed
  if (Math.abs(speedRatio - 1.0) < 0.005) {
    return [];
  }

  const chain = [];
  let remaining = speedRatio;

  if (remaining > 2.0) {
    while (remaining > 2.0) {
      chain.push('atempo=2.0000');
      remaining /= 2.0;
    }
    if (Math.abs(remaining - 1.0) >= 0.005) {
      chain.push(`atempo=${remaining.toFixed(4)}`);
    }
  } else if (remaining < 0.5) {
    while (remaining < 0.5) {
      chain.push('atempo=0.5000');
      remaining /= 0.5;
    }
    if (Math.abs(remaining - 1.0) >= 0.005) {
      chain.push(`atempo=${remaining.toFixed(4)}`);
    }
  } else {
    chain.push(`atempo=${remaining.toFixed(4)}`);
  }

  return chain;
}

/**
 * Calculates auto-fit tempo adjustment and overflow status for a clip within its subtitle slot.
 *
 * @param {object} params
 * @param {number} params.clipDuration - Natural duration of the synthesized audio in seconds
 * @param {number} params.slotDuration - Subtitle slot duration (end - start) in seconds
 * @param {string} [params.mode='med'] - Auto-fit mode ('off'|'low'|'med'|'high')
 * @param {number} [params.userSpeed=1.0] - Per-segment user speed multiplier
 * @returns {object} {
 *   appliedTempo: number,      // Final tempo multiplier applied to the clip
 *   finalDuration: number,     // Expected audio duration after tempo adjustment
 *   overflow: boolean,         // Whether audio exceeds slot duration
 *   overflowDelta: number,     // Number of seconds audio exceeds slot (0 if fits)
 *   atempoChain: Array<string> // FFmpeg filter expressions
 * }
 */
function calculateAutoFit({ clipDuration, slotDuration, mode = 'med', userSpeed = 1.0 }) {
  const normMode = (mode || 'med').toLowerCase();
  const config = AUTO_FIT_MODES[normMode] || AUTO_FIT_MODES.med;

  const validSlot = Math.max(0.1, Number(slotDuration) || 0.1);
  const validClip = Math.max(0.1, Number(clipDuration) || 0.1);

  // If clip is already shorter than or equal to the slot, no auto speedup needed
  let requiredTempo = 1.0;
  if (validClip > validSlot) {
    requiredTempo = validClip / validSlot;
  }

  // Clamp required tempo to mode's allowed maximum
  let appliedTempo = 1.0;
  if (normMode !== 'off') {
    appliedTempo = Math.min(config.maxRate, Math.max(config.minRate, requiredTempo));
  }

  // Calculate resulting duration after tempo scaling
  const finalDuration = Math.round((validClip / appliedTempo) * 1000) / 1000;
  const delta = Math.round((finalDuration - validSlot) * 100) / 100;
  const overflow = delta > 0.05; // 50ms tolerance threshold

  const atempoChain = buildAtempoChain(appliedTempo);

  return {
    appliedTempo: Math.round(appliedTempo * 1000) / 1000,
    finalDuration,
    overflow,
    overflowDelta: overflow ? delta : 0,
    atempoChain
  };
}

/**
 * Calculates start and end timestamps considering the "Sync End" setting.
 * When syncEnd is true:
 * - Clips end at or before segment.end without overflowing into the next segment.
 *
 * @param {object} params
 * @param {number} params.start - Segment start time in seconds
 * @param {number} params.end - Segment end time in seconds
 * @param {number} params.clipDuration - Duration of the audio clip in seconds
 * @param {number} [params.prevEnd=0] - End time of preceding segment
 * @param {number} [params.nextStart=null] - Start time of following segment
 * @param {boolean} [params.syncEnd=true] - Whether Sync End is enabled
 * @param {boolean} [params.syncEnd=true] - Whether Sync End is enabled
 * @param {string} [params.alignMode='anchor_end'] - Alignment mode ('anchor_end'|'natural'|'anchor_start')
 * @returns {object} { clipStart: number, clipEnd: number, trimmed: boolean }
 */
function calculateSyncEnd({ start, end, clipDuration, prevEnd = 0, nextStart = null, syncEnd = true, alignMode = 'anchor_end' }) {
  const slotDuration = end - start;

  if (!syncEnd) {
    const clipStart = start;
    let clipEnd = Math.round((clipStart + clipDuration) * 1000) / 1000;
    if (nextStart !== null && clipEnd > nextStart) {
      clipEnd = Math.max(clipStart + 0.1, nextStart);
      return { clipStart, clipEnd, trimmed: true };
    }
    return {
      clipStart,
      clipEnd,
      trimmed: false
    };
  }

  // When Sync End is active:
  let clipStart = start;
  let clipEnd = start + clipDuration;

  if (alignMode === 'natural' || alignMode === 'anchor_start') {
    // Natural lip-sync onset: dialogue starts at video cue onset, avoids awkward dead silence
    clipStart = start;
    clipEnd = clipStart + clipDuration;

    if (nextStart !== null && clipEnd > nextStart) {
      clipEnd = Math.max(clipStart + 0.1, nextStart);
      return {
        clipStart: Math.round(clipStart * 1000) / 1000,
        clipEnd: Math.round(clipEnd * 1000) / 1000,
        trimmed: true
      };
    }
  } else if (clipDuration <= slotDuration) {
    // Fits inside slot: anchor to end of slot (classic anchor_end)
    clipStart = Math.max(start, end - clipDuration);
    clipEnd = clipStart + clipDuration;
  } else {
    // Audio exceeds slot: anchor start, ensure it doesn't bleed past next segment start if known
    clipStart = start;
    clipEnd = clipStart + clipDuration;

    if (nextStart !== null && clipEnd > nextStart) {
      // Must trim or clamp to nextStart to avoid overlapping next speech
      clipEnd = Math.max(clipStart + 0.1, nextStart);
      return {
        clipStart: Math.round(clipStart * 1000) / 1000,
        clipEnd: Math.round(clipEnd * 1000) / 1000,
        trimmed: true
      };
    }
  }

  return {
    clipStart: Math.round(clipStart * 1000) / 1000,
    clipEnd: Math.round(clipEnd * 1000) / 1000,
    trimmed: false
  };
}

module.exports = {
  AUTO_FIT_MODES,
  buildAtempoChain,
  calculateAutoFit,
  calculateSyncEnd
};
