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
  },
  'anime-gold': {
    name: 'Anime Golden Glow',
    fontName: 'Arial',
    fontSize: 52,
    primaryColor: '&H0015CAF8&',
    outlineColor: '&H000F3578&',
    backColor: '&H80000000&',
    bold: 1,
    outline: 4,
    shadow: 3,
    marginV: 65,
    cssClass: 'sub-preset-anime'
  },
  'cyberpunk-magenta': {
    name: 'Cyberpunk Magenta',
    fontName: 'Arial',
    fontSize: 52,
    primaryColor: '&H005E3FF4&',
    outlineColor: '&H0019054C&',
    backColor: '&H80000000&',
    bold: 1,
    outline: 4,
    shadow: 4,
    marginV: 65,
    cssClass: 'sub-preset-cyberpunk'
  },
  'minimal-glass': {
    name: 'Frosted Glass Pill',
    fontName: 'Arial',
    fontSize: 48,
    primaryColor: '&H00FFFFFF&',
    outlineColor: '&H00202020&',
    backColor: '&H90000000&',
    bold: 0,
    outline: 2,
    shadow: 1,
    marginV: 55,
    cssClass: 'sub-preset-glass'
  },
  'classic-cc': {
    name: 'Classic Closed Caption',
    fontName: 'Courier New',
    fontSize: 48,
    primaryColor: '&H00FFFFFF&',
    outlineColor: '&H00000000&',
    backColor: '&H00000000&',
    bold: 1,
    outline: 3,
    shadow: 0,
    marginV: 60,
    cssClass: 'sub-preset-classic'
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

function generateAssFileContent(segments, presetKey = 'tiktok-yellow', options = {}) {
  const preset = SUBTITLE_PRESETS[presetKey] || SUBTITLE_PRESETS['tiktok-yellow'];

  // Font size scale factor
  const scaleMultipliers = { sm: 0.8, md: 1.0, lg: 1.25, xl: 1.5 };
  let scaleFactor = 1.0;
  if (typeof options.subtitleScalePct === 'number' && options.subtitleScalePct > 0) {
    scaleFactor = options.subtitleScalePct / 100;
  } else if (typeof options.subtitleScale === 'string' && scaleMultipliers[options.subtitleScale]) {
    scaleFactor = scaleMultipliers[options.subtitleScale];
  } else if (typeof options.fontSizeScale === 'number') {
    scaleFactor = options.fontSizeScale;
  }
  const effectiveFontSize = Math.round(preset.fontSize * scaleFactor);

  // Position override if user repositioned subtitle via drag & drop
  const customX = options.subtitleXPercent ?? options.subtitleOverlay?.xPercent;
  const customY = options.subtitleYPercent ?? options.subtitleOverlay?.yPercent;
  const hasCustomPos = (typeof customX === 'number' && typeof customY === 'number') &&
    (Math.abs(customX - 50) > 0.5 || Math.abs(customY - 86) > 0.5);

  const isBilingual = Boolean(options.bilingual || options.bilingualSubtitles);

  const header = `[Script Info]
Title: AI Dubbing Studio Export
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${preset.fontName},${effectiveFontSize},${preset.primaryColor},&H000000FF,${preset.outlineColor},${preset.backColor},${preset.bold},0,0,0,100,100,0,0,1,${preset.outline},${preset.shadow},2,30,30,${preset.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = (segments || [])
    .filter(s => s && (s.t || s.text))
    .map(s => {
      const start = secondsToAssTime(s.s ?? s.start ?? 0);
      const end = secondsToAssTime(s.e ?? s.end ?? 0);
      const rawText = (s.t || s.text || '').replace(/\r?\n/g, '\\N');

      let formattedText = rawText;

      // Bilingual dual-subtitle formatting: Khmer + Original text
      if (isBilingual && (s.sourceText || s.origText)) {
        const secText = (s.sourceText || s.origText || '').replace(/\r?\n/g, ' ');
        const secFontSize = Math.round(effectiveFontSize * 0.72);
        formattedText = `${rawText}\\N{\\fs${secFontSize}\\c&H00D5D5D5&}${secText}`;
      }

      // Exact drag-and-drop position alignment
      if (hasCustomPos) {
        const posX = Math.round((Math.max(5, Math.min(95, customX)) / 100) * 1920);
        const posY = Math.round((Math.max(5, Math.min(95, customY)) / 100) * 1080);
        formattedText = `{\\an2\\pos(${posX},${posY})}${formattedText}`;
      }

      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${formattedText}`;
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
      // In FFmpeg overlay filter, input dimensions are W and H (or main_w, main_h)
      // Whereas crop filter uses iw and ih. Replace iw/ih with W/H for the overlay filter:
      const overlayY = blurBox?.y ? String(blurBox.y).replace(/\bih\b/g, 'H').replace(/\biw\b/g, 'W') : 'H-h';
      const overlayX = blurBox?.x ? String(blurBox.x).replace(/\biw\b/g, 'W').replace(/\bih\b/g, 'H') : '0';

      const splitA = `v_sp${filterIdx}_a`;
      const splitB = `v_sp${filterIdx}_b`;
      const blurOut = `v_blur${filterIdx}`;
      const maskOut = `v_masked${filterIdx}`;

      const intensity = blurBox?.intensity ? Math.max(4, Math.min(48, Math.round(blurBox.intensity))) : 12;
      const tint = typeof blurBox?.tint === 'number' ? Math.max(0, Math.min(1, blurBox.tint)) : 0;
      let blurChain = `crop=${wExpr}:${hExpr}:${xExpr}:${yExpr},avgblur=sizeX=${intensity}:sizeY=${intensity}`;
      if (tint > 0.04) {
        blurChain += `,drawbox=x=0:y=0:w=iw:h=ih:color=black@${tint.toFixed(2)}:t=fill`;
      }

      filters.push(
        `[${currentV}]split=2[${splitA}][${splitB}]`,
        `[${splitB}]${blurChain}[${blurOut}]`,
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
