/**
 * Test Suite: Upgrade Step 6 - TikTok / Reels Viral Subtitle Presets
 * Validates:
 * 1. DOM elements in index.html (subtitlePresetSelect, exportBurnSubCheck, exportSubPresetSelect)
 * 2. CSS presets in layout.css (sub-preset-tiktok, sub-preset-neon, sub-preset-cinema, sub-preset-fire)
 * 3. VideoEffects SUBTITLE_PRESETS, secondsToAssTime, generateAssFileContent, and buildFilter burnSubtitles
 * 4. State persistence of subtitlePreset and burnSubtitles in serialize/restore
 * 5. Bilingual locale keys in en.json and km.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep6Test() {
  console.log('=================================================================');
  console.log('   TESTING UPGRADE STEP 6: TIKTOK / REELS VIRAL SUBTITLE PRESETS ');
  console.log('=================================================================\n');

  // 1. Verify index.html contains subtitle preset elements
  console.log('► [1/5] Verifying subtitle preset DOM elements in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="subtitlePresetSelect"'), 'index.html must contain subtitlePresetSelect');
  assert(html.includes('id="exportBurnSubCheck"'), 'index.html must contain exportBurnSubCheck');
  assert(html.includes('id="exportSubPresetSelect"'), 'index.html must contain exportSubPresetSelect');
  console.log('  ✓ PASSED: subtitlePresetSelect, exportBurnSubCheck, and exportSubPresetSelect present in index.html\n');

  // 2. Verify CSS presets in layout.css
  console.log('► [2/5] Verifying CSS preset styles in layout.css...');
  const cssPath = path.join(__dirname, '../src/renderer/styles/layout.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('.caption-box.sub-preset-tiktok'), 'layout.css must contain .sub-preset-tiktok');
  assert(css.includes('.caption-box.sub-preset-neon'), 'layout.css must contain .sub-preset-neon');
  assert(css.includes('.caption-box.sub-preset-cinema'), 'layout.css must contain .sub-preset-cinema');
  assert(css.includes('.caption-box.sub-preset-fire'), 'layout.css must contain .sub-preset-fire');
  console.log('  ✓ PASSED: All 4 viral CSS subtitle preset classes verified\n');

  // 3. Verify VideoEffects ASS generator and burn-in filter
  console.log('► [3/5] Verifying VideoEffects ASS generation & burn-in filter...');
  const videoEffects = require('../src/main/services/effects/video-effects.js');
  assert(videoEffects.SUBTITLE_PRESETS, 'videoEffects.SUBTITLE_PRESETS must exist');
  assert(videoEffects.SUBTITLE_PRESETS['tiktok-yellow'], 'tiktok-yellow preset must exist');
  assert(videoEffects.SUBTITLE_PRESETS['neon-cyan'], 'neon-cyan preset must exist');
  assert(videoEffects.SUBTITLE_PRESETS['cinema-white'], 'cinema-white preset must exist');
  assert(videoEffects.SUBTITLE_PRESETS['fire-punch'], 'fire-punch preset must exist');

  // Test timestamp converter
  const timeFormatted = videoEffects.secondsToAssTime(65.42);
  assert.strictEqual(timeFormatted, '0:01:05.42', 'secondsToAssTime must format 65.42s to 0:01:05.42');

  // Test ASS generation
  const mockSegments = [
    { s: 1.0, e: 3.5, t: 'សួស្តីបងប្អូនទាំងអស់គ្នា!' },
    { s: 4.0, e: 6.2, t: 'សូមស្វាគមន៍មកកាន់ Studio AI' }
  ];
  const assContent = videoEffects.generateAssFileContent(mockSegments, 'tiktok-yellow');
  assert(assContent.includes('[Script Info]'), 'ASS content must contain [Script Info]');
  assert(assContent.includes('[V4+ Styles]'), 'ASS content must contain [V4+ Styles]');
  assert(assContent.includes('&H0000FFFF&'), 'tiktok-yellow primary color must be in ASS style');
  assert(assContent.includes('Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,សួស្តីបងប្អូនទាំងអស់គ្នា!'), 'Dialogue line 1 must match');
  assert(assContent.includes('Dialogue: 0,0:00:04.00,0:00:06.20,Default,,0,0,0,,សូមស្វាគមន៍មកកាន់ Studio AI'), 'Dialogue line 2 must match');

  // Test filter build with burnSubtitles
  const filterRes = videoEffects.buildFilter({
    burnSubtitles: true,
    subtitleFilePath: 'C:\\temp\\subtitles.ass'
  });
  assert.strictEqual(filterRes.needsReencode, true);
  assert(filterRes.filterString.includes('subtitles=filename='), 'filterString must include subtitles filter');
  console.log('  ✓ PASSED: VideoEffects ASS generator and burn-in filter verified\n');

  // 4. Verify State Persistence
  console.log('► [4/5] Verifying State subtitlePreset persistence...');
  const stateModule = await import('../src/renderer/js/state.js');
  const { state } = stateModule;

  assert.strictEqual(state.project.subtitlePreset, 'tiktok-yellow');
  state.project.subtitlePreset = 'neon-cyan';
  state.project.burnSubtitles = true;

  const serialized = state.serializeProject();
  assert.strictEqual(serialized.subtitlePreset, 'neon-cyan');
  assert.strictEqual(serialized.burnSubtitles, true);

  state.loadProjectData({
    name: 'Subtitle Test',
    subtitlePreset: 'fire-punch',
    burnSubtitles: true,
    subtitles: []
  });
  assert.strictEqual(state.project.subtitlePreset, 'fire-punch');
  assert.strictEqual(state.project.burnSubtitles, true);
  console.log('  ✓ PASSED: StateStore serialization and restoration verified\n');

  // 5. Verify Bilingual locale strings
  console.log('► [5/5] Verifying bilingual locale keys...');
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/en.json'), 'utf8'));
  const km = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/km.json'), 'utf8'));

  assert(en.subBurnIn && km.subBurnIn, 'subBurnIn key must exist in en and km locales');
  assert(en.subPreset && km.subPreset, 'subPreset key must exist in en and km locales');
  console.log('  ✓ PASSED: Bilingual locale strings validated\n');

  console.log('=================================================================');
  console.log('   🎉 UPGRADE STEP 6 SUBTITLE PRESETS TEST PASSED 100%           ');
  console.log('=================================================================');
}

runStep6Test().catch(err => {
  console.error('\n❌ UPGRADE STEP 6 TEST FAILED:', err);
  process.exit(1);
});
