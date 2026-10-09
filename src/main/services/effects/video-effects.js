/**
 * Video Overlay Effects Module
 * Generates FFmpeg video filter complexes for:
 * 1. Hard-sub blurring / masking (masking original foreign subtitles)
 * 2. Watermark overlay (text or image)
 * 3. Crop / Color filters
 */

const SUBTITLE_PRESETS = {
  'tiktok-yellow': {
    name: 'TikTok Bold Yellow',
    fontName: 'Arial',
    fontSize: 52,
    primaryColor: '&H0000FFFF&', // Yellow (BGR)
    outlineColor: '&H00000000&',
    backColor: '&H80000000&',
    bold: 1,
    outline: 4,
    shadow: 2,
    marginV: 65,
    cssClass: 'sub-preset-tiktok'
  },
  'neon-cyan': {
    name: 'Neon Glow Cyberpunk',
    fontName: 'Arial',
    fontSize: 52,
    primaryColor: '&H00F8BD38&', // Cyan
    outlineColor: '&H007A1D2A&',
    backColor: '&H80000000&',
    bold: 1,
    outline: 3,
    shadow: 4,
    marginV: 65,
    cssClass: 'sub-preset-neon'
  },
  'cinema-white': {
    name: 'Netflix Cinema White',
    fontName: 'Arial',
    fontSize: 46,
    primaryColor: '&H00FFFFFF&',
    outlineColor: '&H00000000&',
    backColor: '&H80000000&',
    bold: 0,
    outline: 2,
    shadow: 1,
    marginV: 55,
    cssClass: 'sub-preset-cinema'
  },
  'fire-punch': {
    name: 'Fire Punch Orange',
    fontName: 'Arial',
    fontSize: 52,
    primaryColor: '&H001673F9&',
    outlineColor: '&H00122D7C&',
    backColor: '&H80000000&',
    bold: 1,
    outline: 4,
    shadow: 2,
    marginV: 65,
    cssClass: 'sub-preset-fire'
  }
};

function secondsToAssTime(sec) {
  const totalMs = Math.round(Math.max(0, Number(sec) || 0) * 100);
  const cs = totalMs % 100;
  const totalS = Math.floor(totalMs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function generateAssFileContent(segments, presetKey = 'tiktok-yellow') {
  const preset = SUBTITLE_PRESETS[presetKey] || SUBTITLE_PRESETS['tiktok-yellow'];

  const header = `[Script Info]
Title: AI Dubbing Studio Export
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${preset.fontName},${preset.fontSize},${preset.primaryColor},&H000000FF,${preset.outlineColor},${preset.backColor},${preset.bold},0,0,0,100,100,0,0,1,${preset.outline},${preset.shadow},2,30,30,${preset.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = (segments || [])
    .filter(s => s && (s.t || s.text))
    .map(s => {
      const start = secondsToAssTime(s.s ?? s.start ?? 0);
      const end = secondsToAssTime(s.e ?? s.end ?? 0);
      const rawText = (s.t || s.text || '').replace(/\r?\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${rawText}`;
    });

  return header + lines.join('\n') + '\n';
}

class VideoEffects {
  constructor() {
    this.SUBTITLE_PRESETS = SUBTITLE_PRESETS;
    this.generateAssFileContent = generateAssFileContent;
    this.secondsToAssTime = secondsToAssTime;
  }

  /**
   * Builds the FFmpeg filter complex string for video overlays
   *
   * @param {object} options
   * @param {boolean} [options.blurHardSubs=false] - Whether to blur the subtitle banner
   * @param {object} [options.blurBox] - Custom blur coordinates { x, y, w, h }
   * @param {boolean} [options.watermark=false] - Whether to apply watermark
   * @param {string} [options.watermarkText='AI Dubbing Studio'] - Text for watermark
   * @param {string} [options.watermarkImage=null] - Image path for watermark
   * @param {number} [options.watermarkXPercent=null] - X coordinate percentage (0-100)
   * @param {number} [options.watermarkYPercent=null] - Y coordinate percentage (0-100)
   * @param {boolean} [options.burnSubtitles=false] - Whether to burn styled subtitles
   * @param {string} [options.subtitleFilePath=null] - Path to .ass file
   * @returns {object} { needsReencode: boolean, filterString: string|null, outputLabel: string }
   */
  buildFilter({
    blurHardSubs = false,
    blurBox = null,
    watermark = false,
    watermarkText = 'AI Dubbing Studio',
    watermarkImage = null,
    watermarkXPercent = null,
    watermarkYPercent = null,
    burnSubtitles = false,
    subtitleFilePath = null
  }) {
    if (!blurHardSubs && !watermark && !burnSubtitles) {
      return {
        needsReencode: false,
        filterString: null,
        outputLabel: null
      };
    }

    const filters = [];
    let currentV = '0:v';
    let filterIdx = 1;

    // 1. Blur Hard-subtitles Region
    if (blurHardSubs) {
      // Default: bottom 14% of the video where dialogue subtitles usually appear
      const wExpr = blurBox?.w || 'iw';
      const hExpr = blurBox?.h || 'ih*0.14';
      const xExpr = blurBox?.x || '0';
      const yExpr = blurBox?.y || 'ih*0.86';
      const overlayY = blurBox?.y ? blurBox.y : 'H-h';
      const overlayX = blurBox?.x ? blurBox.x : '0';

      const splitA = `v_sp${filterIdx}_a`;
      const splitB = `v_sp${filterIdx}_b`;
      const blurOut = `v_blur${filterIdx}`;
      const maskOut = `v_masked${filterIdx}`;

      filters.push(
        `[${currentV}]split=2[${splitA}][${splitB}]`,
        `[${splitB}]crop=${wExpr}:${hExpr}:${xExpr}:${yExpr},avgblur=sizeX=12:sizeY=12[${blurOut}]`,
        `[${splitA}][${blurOut}]overlay=${overlayX}:${overlayY}[${maskOut}]`
      );

      currentV = maskOut;
      filterIdx++;
    }

    // 2. Watermark Overlay
    if (watermark) {
      const wmOut = `v_wm${filterIdx}`;
      const safeText = (watermarkText || 'AI Dubbing Studio').replace(/[:'\\]/g, '\\$&');

      let xExpr = 'w-tw-24';
      let yExpr = '24';
      if (typeof watermarkXPercent === 'number' && typeof watermarkYPercent === 'number') {
        const xPct = Math.max(0, Math.min(100, watermarkXPercent)) / 100;
        const yPct = Math.max(0, Math.min(100, watermarkYPercent)) / 100;
        xExpr = `trunc((w-tw)*${xPct.toFixed(3)})`;
        yExpr = `trunc((h-th)*${yPct.toFixed(3)})`;
      }

      // Semi-transparent text watermark with shadow
      const drawTextFilter = `drawtext=text='${safeText}':x=${xExpr}:y=${yExpr}:fontsize=20:fontcolor=white@0.8:shadowcolor=black@0.6:shadowx=2:shadowy=2`;
      filters.push(`[${currentV}]${drawTextFilter}[${wmOut}]`);

      currentV = wmOut;
      filterIdx++;
    }

    // 3. Subtitle Burn-In Filter (ASS / Subtitles)
    if (burnSubtitles && subtitleFilePath) {
      const subOut = `v_sub${filterIdx}`;
      const safePath = subtitleFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filters.push(`[${currentV}]subtitles=filename='${safePath}'[${subOut}]`);
      currentV = subOut;
      filterIdx++;
    }

    return {
      needsReencode: true,
      filterString: filters.join(';'),
      outputLabel: `[${currentV}]`
    };
  }
}

const videoEffects = new VideoEffects();
module.exports = videoEffects;
