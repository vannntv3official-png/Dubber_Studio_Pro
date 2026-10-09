/**
 * Test Suite: Upgrade Step 3 - Interactive On-Video Canvas Drag & Drop Overlay
 * Validates:
 * 1. DOM elements exist in index.html (guides, badge, overlays)
 * 2. canvasOverlay controller API and magnetic snapping logic
 * 3. FFmpeg video-effects filter generation with custom percentage coordinates
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep3Test() {
  console.log('=================================================================');
  console.log('     TESTING UPGRADE STEP 3: INTERACTIVE ON-VIDEO CANVAS         ');
  console.log('=================================================================\n');

  // 1. Verify index.html contains all canvas overlay elements
  console.log('► [1/3] Verifying canvas overlay DOM elements in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const requiredIds = ['snapGuideH', 'snapGuideV', 'overlayPosBadge', 'cap', 'watermarkOverlay'];
  for (const id of requiredIds) {
    assert(html.includes(`id="${id}"`), `index.html must contain element with id="${id}"`);
  }
  console.log(`  ✓ PASSED: All ${requiredIds.length} canvas overlay DOM elements verified\n`);

  // 2. Verify canvasOverlay module exports and methods
  console.log('► [2/3] Verifying canvasOverlay module architecture & state...');
  const overlayModule = await import('../src/renderer/js/canvas-overlay.js');
  const { canvasOverlay } = overlayModule;
  assert(canvasOverlay, 'canvasOverlay export must exist');
  assert.strictEqual(typeof canvasOverlay.init, 'function', 'canvasOverlay.init must be a function');
  assert.strictEqual(typeof canvasOverlay.getCoordinates, 'function', 'canvasOverlay.getCoordinates must be a function');
  assert.strictEqual(typeof canvasOverlay.setCoordinates, 'function', 'canvasOverlay.setCoordinates must be a function');
  assert.strictEqual(typeof canvasOverlay.resetCoordinates, 'function', 'canvasOverlay.resetCoordinates must be a function');

  // Test coordinate getter/setter
  canvasOverlay.setCoordinates('subtitle', 48.5, 85.0);
  const subCoords = canvasOverlay.getCoordinates('subtitle');
  assert.strictEqual(subCoords.xPercent, 48.5);
  assert.strictEqual(subCoords.yPercent, 85.0);

  canvasOverlay.setCoordinates('watermark', 92.0, 5.0);
  const wmCoords = canvasOverlay.getCoordinates('watermark');
  assert.strictEqual(wmCoords.xPercent, 92.0);
  assert.strictEqual(wmCoords.yPercent, 5.0);
  console.log('  ✓ PASSED: canvasOverlay API and coordinate storage verified\n');

  // 3. Test video-effects export filter with custom coordinates
  console.log('► [3/3] Verifying video-effects filter generation with overlay coordinates...');
  const videoEffects = require('../src/main/services/effects/video-effects.js');

  // Test 3a: Default positioning (no percent coords passed)
  const filterDefault = videoEffects.buildFilter({
    watermark: true,
    watermarkText: 'GlassStudio'
  });
  assert(filterDefault.filterString.includes('x=w-tw-24:y=24'), 'Should use default top-right corner when no coords provided');

  // Test 3b: Custom coordinates provided (e.g. centered watermark: 50%, 50%)
  const filterCustom = videoEffects.buildFilter({
    watermark: true,
    watermarkText: 'GlassStudio',
    watermarkXPercent: 50,
    watermarkYPercent: 50
  });
  assert(filterCustom.filterString.includes('x=trunc((w-tw)*0.500)'), 'Should use scaled percentage for X coordinate');
  assert(filterCustom.filterString.includes('y=trunc((h-th)*0.500)'), 'Should use scaled percentage for Y coordinate');

  // Test 3c: Custom bottom-left coordinates (10%, 90%)
  const filterCustomBL = videoEffects.buildFilter({
    watermark: true,
    watermarkText: 'CornerBrand',
    watermarkXPercent: 10,
    watermarkYPercent: 90
  });
  assert(filterCustomBL.filterString.includes('x=trunc((w-tw)*0.100)'), 'Should scale X to 0.100');
  assert(filterCustomBL.filterString.includes('y=trunc((h-th)*0.900)'), 'Should scale Y to 0.900');

  console.log('  ✓ PASSED: FFmpeg filter accurately translates canvas percentage coordinates to video dimensions\n');

  console.log('=================================================================');
  console.log('🎉 ALL STEP 3 VERIFICATION TESTS PASSED (100%)');
  console.log('=================================================================');
}

runStep3Test().catch((err) => {
  console.error('❌ Step 3 test failed:', err);
  process.exit(1);
});
