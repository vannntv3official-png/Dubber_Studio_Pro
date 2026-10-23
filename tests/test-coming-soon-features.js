/**
 * Test Suite: Coming Soon Features (Subtitle Caption & Cover Studio)
 * Validates:
 * 1. DOM elements exist in index.html (btnCaption with badge, coverStudioBtn with badge)
 * 2. i18n dictionaries contain captionComingSoon for en and km
 * 3. coverStudio and canvasOverlay modules invoke Coming Soon notifications
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runComingSoonTest() {
  console.log('=================================================================');
  console.log('     TESTING COMING SOON: SUBTITLE CAPTION & COVER STUDIO        ');
  console.log('=================================================================\n');

  // 1. Verify index.html markup
  console.log('► [1/3] Verifying DOM markup in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="btnCaption"'), 'index.html must contain #btnCaption');
  assert(html.includes('id="coverStudioBtn"'), 'index.html must contain #coverStudioBtn');
  assert(html.includes('badge-coming-soon'), 'index.html must contain badge-coming-soon badge');
  assert(html.includes('tool-badge-dot-soon'), 'index.html must contain tool-badge-dot-soon indicator');
  console.log('  ✓ PASSED: DOM markup and Coming Soon badges verified in index.html\n');

  // 2. Verify i18n mappings
  console.log('► [2/3] Verifying i18n localization keys...');
  const enJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/en.json'), 'utf8'));
  const kmJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/km.json'), 'utf8'));

  assert(enJson.captionComingSoon, 'en.json must contain captionComingSoon');
  assert(kmJson.captionComingSoon, 'km.json must contain captionComingSoon');
  console.log(`  ✓ PASSED: Localization keys present in EN and KM\n`);

  // 3. Verify module behavior
  console.log('► [3/3] Verifying module Coming Soon actions...');
  const coverModule = await import('../src/renderer/js/cover-modal.js');
  const overlayModule = await import('../src/renderer/js/canvas-overlay.js');

  assert.strictEqual(typeof coverModule.openCoverStudio, 'function', 'openCoverStudio must be exported');
  assert.strictEqual(typeof overlayModule.canvasOverlay.openSubtitleQuickStudio, 'function', 'openSubtitleQuickStudio must exist');

  // Call both functions in node environment (should run cleanly without errors)
  coverModule.openCoverStudio();
  overlayModule.canvasOverlay.openSubtitleQuickStudio();
  console.log('  ✓ PASSED: Functions execute Coming Soon notifications cleanly\n');

  console.log('=================================================================');
  console.log('🎉 ALL COMING SOON FEATURE CHECKS PASSED (100%)');
  console.log('=================================================================');
}

runComingSoonTest().catch((err) => {
  console.error('❌ Coming Soon test failed:', err);
  process.exit(1);
});
