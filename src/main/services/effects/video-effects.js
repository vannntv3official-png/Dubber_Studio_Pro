/**
 * Video Overlay Effects Module
 * Generates FFmpeg video filter complexes for:
 * 1. Hard-sub blurring / masking (masking original foreign subtitles)
 * 2. Animated / Static Watermark overlay (diagonal sweep, DVD bounce, etc.)
 * 3. Scrolling Sponsor Marquee Ticker (top/bottom banner)
 * 4. Photo / Logo overlay with positioning and timing
 * 5. Subtitle burn-in with custom Khmer typography styling
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
   * @param {string} [options.watermarkMotion='static'] - Motion preset
   * @param {number} [options.watermarkOpacity=0.8] - Opacity 0..1
   * @param {number} [options.watermarkFontSize=20] - Font size
   * @param {string} [options.watermarkImage=null] - Image path for watermark
   * @param {object} [options.sponsorTicker=null] - Scrolling sponsor ticker config
   * @param {object} [options.photoLogo=null] - Photo/logo overlay config
   * @returns {object} { needsReencode: boolean, filterString: string|null, outputLabel: string }
   */
  buildFilter({
    blurHardSubs = false,
    blurBox = null,
    watermark = false,
    watermarkText = 'AI Dubbing Studio',
    watermarkMotion = 'static',
    watermarkOpacity = 0.8,
    watermarkFontSize = 20,
    watermarkImage = null,
    sponsorTicker = null,
    photoLogo = null
  } = {}) {
    const hasSponsor = sponsorTicker && sponsorTicker.enabled && (sponsorTicker.textTop || sponsorTicker.textBottom);
    const hasPhoto = photoLogo && photoLogo.enabled && photoLogo.imagePath;

    if (!blurHardSubs && !watermark && !hasSponsor && !hasPhoto) {
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

    // 2. Photo / Logo Image Overlay
    if (hasPhoto) {
      const imgOut = `v_img${filterIdx}`;
      const safePath = photoLogo.imagePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const scalePercent = photoLogo.scale ? (photoLogo.scale / 100) : 0.25;
      const opacity = photoLogo.opacity !== undefined ? (photoLogo.opacity / 100) : 1;

      let posExpr = 'x=W-w-24:y=24';
      switch (photoLogo.position) {
        case 'top-left': posExpr = 'x=24:y=24'; break;
        case 'top-right': posExpr = 'x=W-w-24:y=24'; break;
        case 'bottom-left': posExpr = 'x=24:y=H-h-24'; break;
        case 'bottom-right': posExpr = 'x=W-w-24:y=H-h-24'; break;
        case 'center': posExpr = 'x=(W-w)/2:y=(H-h)/2'; break;
      }

      let enableExpr = '';
      if (photoLogo.endSec && photoLogo.endSec > (photoLogo.startSec || 0)) {
        enableExpr = `:enable='between(t,${photoLogo.startSec || 0},${photoLogo.endSec})'`;
      }

      const movieLabel = `img_in${filterIdx}`;
      const scaledLabel = `img_scaled${filterIdx}`;
      filters.push(
        `movie='${safePath}'[${movieLabel}]`,
        photoLogo.chromaKey
          ? `[${movieLabel}]colorkey=0x00FF00:${((photoLogo.chromaSimilarity || 15) / 100).toFixed(2)}:0.1,scale=trunc(iw*${scalePercent}/2)*2:-2,format=rgba,colorchannelmixer=aa=${opacity}[${scaledLabel}]`
          : `[${movieLabel}]scale=trunc(iw*${scalePercent}/2)*2:-2,format=rgba,colorchannelmixer=aa=${opacity}[${scaledLabel}]`,
        `[${currentV}][${scaledLabel}]overlay=${posExpr}${enableExpr}[${imgOut}]`
      );

      currentV = imgOut;
      filterIdx++;
    }

    // 3. Watermark Overlay (Text Motion)
    if (watermark) {
      const wmOut = `v_wm${filterIdx}`;
      const safeText = (watermarkText || 'AI Dubbing Studio').replace(/[:'\\]/g, '\\$&');
      const op = Math.max(0.1, Math.min(1, watermarkOpacity));
      const fs = watermarkFontSize || 20;

      let xExpr = 'w-tw-24';
      let yExpr = '24';
      let extra = '';

      switch (watermarkMotion) {
        case 'diagonal':
          xExpr = "'mod(t*65, w+tw)-tw'";
          yExpr = "'mod(t*45, h+th)-th'";
          break;
        case 'bounce':
          xExpr = "'abs(mod(t*90, (w-tw)*2) - (w-tw))'";
          yExpr = "'abs(mod(t*60, (h-th)*2) - (h-th))'";
          break;
        case 'torso':
          xExpr = "'mod(t*75, w+tw)-tw'";
          yExpr = "'(h-th)*0.5 + sin(t*2)*15'";
          break;
        case 'hop':
          xExpr = "'(w-tw)*0.5'";
          yExpr = "'(h-th)*0.5'";
          extra = ":enable='gte(mod(t,6),3)'";
          break;
        case 'lissajous':
          xExpr = "'(w-tw)/2 + (w-tw)/2.6 * sin(t*0.4)'";
          yExpr = "'(h-th)/2 + (h-th)/2.6 * cos(t*0.6)'";
          break;
        case 'static':
        default:
          xExpr = 'w-tw-24';
          yExpr = '24';
          break;
      }

      const drawTextFilter = `drawtext=text='${safeText}':x=${xExpr}:y=${yExpr}:fontsize=${fs}:fontcolor=white@${op}:shadowcolor=black@0.6:shadowx=2:shadowy=2:borderw=1:bordercolor=black@0.4${extra}`;
      filters.push(`[${currentV}]${drawTextFilter}[${wmOut}]`);

      currentV = wmOut;
      filterIdx++;
    }

    // 4. Scrolling Sponsor Marquee Ticker
    if (hasSponsor) {
      const tickerOut = `v_ticker${filterIdx}`;
      const text = sponsorTicker.textTop || sponsorTicker.textBottom || '';
      const safeTickerText = text.replace(/[:'\\]/g, '\\$&');
      const isTop = sponsorTicker.position === 'top';
      const speed = sponsorTicker.speed === 'fast' ? 140 : (sponsorTicker.speed === 'slow' ? 60 : 90);
      const boxH = 44;

      const boxY = isTop ? '0' : `ih-${boxH}`;
      const textY = isTop ? '12' : `h-${boxH - 12}`;
      const xTicker = `'w - mod(t*${speed}, w+tw)'`;

      const boxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${boxH}:color=black@0.75:t=fill`;
      const textFilter = `drawtext=text='${safeTickerText}':fontsize=20:fontcolor=white:x=${xTicker}:y=${textY}:shadowcolor=black@0.8:shadowx=1:shadowy=1`;

      filters.push(
        `[${currentV}]${boxFilter},${textFilter}[${tickerOut}]`
      );

      currentV = tickerOut;
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
