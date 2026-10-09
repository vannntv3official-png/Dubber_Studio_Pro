/**
 * Test Suite: Upgrade Step 7 - Interactive Audio Waveform Scrubbing Bar & Zoom
 * Validates:
 * 1. DOM elements in index.html (tlOverviewBar, tlOverviewCanvas, tlOverviewWindow, tlOverviewPlayhead, tlOverviewBadge, zoomFitBtn)
 * 2. CSS styles in timeline.css (.tl-overview-bar, .tl-overview-canvas, .tl-overview-window, .tl-overview-playhead, .tl-overview-badge)
 * 3. Timeline methods (getMinPxPerSec, applyZoom, resetZoomToFit, drawOverviewWaveform, updateOverviewWindow, updateOverviewPlayhead, buildWaveformSvg)
 * 4. Player responsive playhead scrub updates when paused
 * 5. Bilingual locale keys in en.json and km.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep7Test() {
  console.log('=================================================================');
  console.log('   TESTING UPGRADE STEP 7: INTERACTIVE WAVEFORM SCRUBBING & ZOOM ');
  console.log('=================================================================\n');

  // 1. Verify index.html contains zoomFitBtn and tlOverviewBar is cleanly removed per user request
  console.log('► [1/5] Verifying DOM elements in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="zoomFitBtn"'), 'index.html must contain id="zoomFitBtn"');
  assert(!html.includes('id="tlOverviewBar"'), 'index.html must NOT contain id="tlOverviewBar" (removed per user request)');
  console.log('  ✓ PASSED: zoomFitBtn confirmed and tlOverviewBar confirmed removed\n');

  // 2. Verify CSS styles in timeline.css
  console.log('► [2/5] Verifying CSS styles in timeline.css...');
  const cssPath = path.join(__dirname, '../src/renderer/styles/timeline.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('.tl-overview-bar'), 'timeline.css must contain .tl-overview-bar');
  assert(css.includes('.tl-overview-canvas'), 'timeline.css must contain .tl-overview-canvas');
  assert(css.includes('.tl-overview-window'), 'timeline.css must contain .tl-overview-window');
  assert(css.includes('.tl-overview-window-handle'), 'timeline.css must contain .tl-overview-window-handle');
  assert(css.includes('.tl-overview-playhead'), 'timeline.css must contain .tl-overview-playhead');
  assert(css.includes('.tl-overview-badge'), 'timeline.css must contain .tl-overview-badge');
  console.log('  ✓ PASSED: All overview bar and window styles verified\n');

  // 3. Verify Timeline module methods
  console.log('► [3/5] Verifying Timeline overview & zoom methods...');
  const timelineModule = await import('../src/renderer/js/timeline.js');
  const { timeline } = timelineModule;

  assert.strictEqual(typeof timeline.getMinPxPerSec, 'function', 'timeline.getMinPxPerSec must be a function');
  assert.strictEqual(typeof timeline.applyZoom, 'function', 'timeline.applyZoom must be a function');
  assert.strictEqual(typeof timeline.resetZoomToFit, 'function', 'timeline.resetZoomToFit must be a function');
  assert.strictEqual(typeof timeline.drawOverviewWaveform, 'function', 'timeline.drawOverviewWaveform must be a function');
  assert.strictEqual(typeof timeline.updateOverviewWindow, 'function', 'timeline.updateOverviewWindow must be a function');
  assert.strictEqual(typeof timeline.updateOverviewPlayhead, 'function', 'timeline.updateOverviewPlayhead must be a function');
  assert.strictEqual(typeof timeline.initOverviewBar, 'function', 'timeline.initOverviewBar must be a function');

  // Test SVG waveform builder
  const mockPeaks = [0.1, 0.4, 0.8, 0.5, 0.2, 0.9, 0.3];
  const svg = timeline.buildWaveformSvg(mockPeaks, '#a78bfa', 30);
  assert(svg.includes('<svg class="track-waveform-svg"'), 'buildWaveformSvg must return valid SVG');
  assert(svg.includes('stroke-dasharray="2,2"'), 'buildWaveformSvg must contain center reference line');
  assert(svg.includes('fill="#a78bfa"'), 'buildWaveformSvg must contain waveform path');
  console.log('  ✓ PASSED: Timeline module methods and SVG waveform verified\n');

  // 4. Verify Player responsiveness when scrubbing/paused
  console.log('► [4/5] Verifying Player instant seek on playhead change...');
  const playerModule = await import('../src/renderer/js/player.js');
  const { player } = playerModule;

  // Mock video element
  let seekTarget = -1;
  player.hasRealVideo = true;
  player.isPlaying = false;
  player.videoEl = {
    get currentTime() { return 10.0; },
    set currentTime(val) { seekTarget = val; }
  };

  // When paused, seeking to 10.1 (within 0.3s) should update currentTime immediately!
  player.syncPlayhead(10.1);
  assert.strictEqual(seekTarget, 10.1, 'Paused scrubbing must immediately update videoEl.currentTime without 0.3s lag');
  console.log('  ✓ PASSED: Player instant scrubbing response confirmed\n');

  // 5. Verify Bilingual locale strings
  console.log('► [5/5] Verifying bilingual locale keys...');
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/en.json'), 'utf8'));
  const km = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/km.json'), 'utf8'));

  assert(en.zoomFit && km.zoomFit, 'zoomFit key must exist in en and km locales');
  assert(en.scrubOverview && km.scrubOverview, 'scrubOverview key must exist in en and km locales');
  console.log('  ✓ PASSED: Bilingual locale strings validated\n');

  console.log('=================================================================');
  console.log('   🎉 UPGRADE STEP 7 WAVEFORM & ZOOM TEST PASSED 100%            ');
  console.log('=================================================================');
}

runStep7Test().catch(err => {
  console.error('\n❌ UPGRADE STEP 7 TEST FAILED:', err);
  process.exit(1);
});
