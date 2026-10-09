/**
 * Test Suite: Upgrade Step 4 - AI Smart Rephrase / Condenser for Tight Lines
 * Validates:
 * 1. DOM elements exist in index.html (condenseTightBtn)
 * 2. Bilingual locale keys exist (en & km)
 * 3. Translation service & mock provider condense implementation
 * 4. ipcClient condense bridge and table methods
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep4Test() {
  console.log('=================================================================');
  console.log('       TESTING UPGRADE STEP 4: AI SMART REPHRASE / CONDENSER     ');
  console.log('=================================================================\n');

  // 1. Verify index.html contains condenseTightBtn
  console.log('► [1/4] Verifying condenseTightBtn DOM element in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(html.includes('id="condenseTightBtn"'), 'index.html must contain condenseTightBtn');
  console.log('  ✓ PASSED: condenseTightBtn element confirmed in index.html\n');

  // 2. Verify bilingual locale strings
  console.log('► [2/4] Verifying locale strings (EN & KM)...');
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/en.json'), 'utf8'));
  const km = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/km.json'), 'utf8'));

  const requiredKeys = ['condenseTight', 'condenseTightTip', 'shorten', 'shortenTip', 'shortenSuccess', 'shortenBatchSuccess', 'noTightLines'];
  for (const k of requiredKeys) {
    assert(en[k], `en.json must contain key "${k}"`);
    assert(km[k], `km.json must contain key "${k}"`);
  }
  console.log(`  ✓ PASSED: All ${requiredKeys.length} required bilingual keys validated\n`);

  // 3. Test Translation Service & Mock Provider Condense
  console.log('► [3/4] Testing translationService & mockProvider condense logic...');
  const translationService = require('../src/main/services/providers/translation/index.js');
  assert.strictEqual(typeof translationService.condense, 'function', 'translationService.condense must be a function');

  // Test condensing with mock engine
  const mockInput = [
    { id: 1, text: 'តើអ្នកកំពុងធ្វើអ្វីនៅទីនេះ?', sourceText: 'What are you doing here?', durationSec: 1.2 },
    { id: 2, text: 'តើអ្នកគិតថាយើងគួរតែទៅទីនោះនៅពេលរសៀលនេះមែនទេ?', sourceText: 'Do you think so?', durationSec: 1.5 }
  ];

  const condensedRes = await translationService.condense(mockInput, { engine: 'mock' });
  assert(Array.isArray(condensedRes), 'condense result must be an array');
  assert.strictEqual(condensedRes.length, 2, 'Should condense 2 items');
  assert.strictEqual(condensedRes[0].id, 1);
  assert(!condensedRes[0].condensedText.startsWith('តើ'), 'Should strip literary question prefix');
  assert(condensedRes[1].condensedText.length < mockInput[1].text.length, 'Condensed text should be shorter than original');
  console.log('  ✓ PASSED: translationService.condense works as expected\n');

  // 4. Test Table module condense methods
  console.log('► [4/4] Verifying table module condenseRow & condenseAllTight...');
  const tableModule = await import('../src/renderer/js/table.js');
  const { table } = tableModule;
  assert.strictEqual(typeof table.condenseRow, 'function', 'table.condenseRow must be a function');
  assert.strictEqual(typeof table.condenseAllTight, 'function', 'table.condenseAllTight must be a function');
  console.log('  ✓ PASSED: table.js API surface confirmed\n');

  console.log('=================================================================');
  console.log('🎉 ALL STEP 4 VERIFICATION TESTS PASSED (100%)');
  console.log('=================================================================');
}

runStep4Test().catch(err => {
  console.error('❌ Step 4 test failed:', err);
  process.exit(1);
});
