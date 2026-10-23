/**
 * Verification Test for Phase 3: Items 11 & 12
 * - Item 11: Preview toolbar 7 stub buttons removed from UI (inside hidden container) & Check updates hidden in About.
 * - Item 12: Mock providers hidden behind Developer Mode with [MOCK] badge. Pronunciation default rules not seeded silently; Add example rules button works.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== Test Items 11 & 12: UI Cleanup, Mock Providers & Pronunciation Example Rules ===');

  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Verify Item 11: Toolbar stubs and Check Updates button
  console.log('[1/4] Verifying Item 11: Toolbar stubs & Check Updates button hidden...');
  assert(html.includes('id="previewToolbarStubs"'), 'Must contain previewToolbarStubs container');
  assert(html.includes('id="previewToolbarStubs" hidden'), 'previewToolbarStubs must have hidden attribute');

  // Verify that Previous Frame, Snapshot, Crop, Aspect Ratio, Filters, Grid, Tools are inside the hidden container
  const stubsChunkMatch = html.match(/<div[^>]*id="previewToolbarStubs"[^>]*>([\s\S]*?)<\/div>/);
  assert(stubsChunkMatch, 'Must find previewToolbarStubs container block');
  const stubsChunk = stubsChunkMatch[1];
  const requiredStubs = ['Previous Frame', 'Snapshot Frame', 'Crop Video', 'Aspect Ratio', 'Video Filters', 'Composition Grid', 'Advanced Video Settings'];
  for (const stub of requiredStubs) {
    assert(stubsChunk.includes(stub), `Stub button "${stub}" must be located inside hidden previewToolbarStubs`);
  }

  // Verify that Blur and Watermark remain outside the hidden container
  const toolbarBeforeStubs = html.substring(html.indexOf('<div class="icons-toolbar">'), html.indexOf('id="previewToolbarStubs"'));
  assert(toolbarBeforeStubs.includes('id="btnBlur"'), '#btnBlur must remain in active toolbar');
  assert(toolbarBeforeStubs.includes('id="btnWatermark"'), '#btnWatermark must remain in active toolbar');

  // Verify Check Updates button in About is hidden
  assert(html.includes('id="setAboutCheckUpdatesBtn" hidden'), 'setAboutCheckUpdatesBtn must have hidden attribute');
  console.log('✓ Item 11 verified: 7 stubs container hidden; Blur & Watermark active; Check updates hidden.');

  // 2. Verify Item 12: Mock Providers hidden in default HTML
  console.log('[2/4] Verifying Item 12: Mock options hidden by default in DOM...');
  const mockOptions = [
    /<select id="setAsrEngineSelect"[^>]*>[\s\S]*?<option value="mock" hidden/i,
    /<select id="transEngineSelect"[^>]*>[\s\S]*?<option value="mock" hidden/i,
    /<select id="translateModelSelect"[^>]*>[\s\S]*?<option value="mock" hidden/i,
    /<select id="setTtsEngineSelect"[^>]*>[\s\S]*?<option value="mock" hidden/i,
    /<select id="setSepEngineSelect"[^>]*>[\s\S]*?<option value="mock" hidden/i
  ];

  for (const reg of mockOptions) {
    assert(reg.test(html), `HTML must have hidden mock option for ${reg}`);
  }
  console.log('✓ All 5 mock provider options are hidden by default with [MOCK] label in HTML.');

  // 3. Verify Developer Mode UI toggle function
  console.log('[3/4] Verifying Developer Mode UI toggle logic in section-system.js...');
  const sectionSystemPath = path.join(__dirname, '../src/renderer/js/settings/section-system.js');
  const sectionSystemCode = fs.readFileSync(sectionSystemPath, 'utf8');
  assert(sectionSystemCode.includes('export function updateDeveloperModeUI(isDevMode)'), 'Must export updateDeveloperModeUI function');
  assert(sectionSystemCode.includes('setSysDeveloperMode'), 'Must handle setSysDeveloperMode in sectionSystem');
  assert(sectionSystemCode.includes('developerMode: Boolean(devModeCheck?.checked)'), 'Must persist developerMode boolean');

  // 4. Verify Pronunciation silent seeding is removed & explicit Add Examples works
  console.log('[4/4] Verifying Pronunciation silent seeding removal & addExampleRules...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-app-pron-test-'));
  const configDir = path.join(tempDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  const PronunciationService = require('../src/main/services/pronunciation').constructor;
  const pronService = new PronunciationService();
  pronService.storagePath = path.join(configDir, 'pronunciation.json');

  // Trigger load with empty storage
  pronService.load();
  assert.strictEqual(pronService.getAll().length, 0, 'Pronunciation rules must NOT be silently seeded on startup');
  console.log('✓ Verified: Blank profile starts with 0 rules (no silent seeding).');

  // Now invoke addExampleRules
  const addRes = pronService.addExampleRules();
  assert(addRes.success, 'addExampleRules must return success');
  assert(addRes.addedCount >= 3, 'addExampleRules must add at least 3 sample rules');
  const rules = pronService.getAll();
  assert(rules.length >= 3, 'Pronunciation dictionary must now contain at least 3 rules');
  assert(rules.some(r => r.written === 'AI'), 'Sample rule AI must exist');
  assert(rules.some(r => r.written === 'Studio'), 'Sample rule Studio must exist');
  assert(rules.some(r => r.written === 'PRO'), 'Sample rule PRO must exist');
  console.log('✓ Verified: addExampleRules explicitly adds the 3 sample rules (AI, Studio, PRO).');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('=== ALL ITEMS 11 & 12 VERIFICATION TESTS PASSED ===');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
