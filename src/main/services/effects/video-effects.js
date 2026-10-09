/**
 * Video Overlay Effects Module
 * Generates FFmpeg video filter complexes for:
 * 1. Hard-sub blurring / masking (masking original foreign subtitles)
 * 2. Watermark overlay (text or image)
 * 3. Crop / Color filters
 */

class VideoEffects {
  /**
   * Builds the FFmpeg filter complex string for video overlays
   *
   * @param {object} options
   * @param {boolean} [options.blurHardSubs=false] - Whether to blur the subtitle banner
   * @param {object} [options.blurBox] - Custom blur coordinates { x, y, w, h }
   * @param {boolean} [options.watermark=false] - Whether to apply watermark
   * @param {string} [options.watermarkText='AI Dubbing Studio'] - Text for watermark
   * @param {string} [options.watermarkImage=null] - Image path for watermark
   * @returns {object} { needsReencode: boolean, filterString: string|null, outputLabel: string }
   */
  buildFilter({ blurHardSubs = false, blurBox = null, watermark = false, watermarkText = 'AI Dubbing Studio', watermarkImage = null }) {
    if (!blurHardSubs && !watermark) {
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

      // Semi-transparent clean top-right text watermark
      const drawTextFilter = `drawtext=text='${safeText}':x=w-tw-24:y=24:fontsize=20:fontcolor=white@0.8:shadowcolor=black@0.6:shadowx=2:shadowy=2`;
      filters.push(`[${currentV}]${drawTextFilter}[${wmOut}]`);

      currentV = wmOut;
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
