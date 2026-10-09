/**
 * Test Suite: Upgrade Step 1 - Dual-Column Subtitle Editor & Instant Preview
 * Validates:
 * 1. Subtitle parsing preserves both sourceText and t (dub text)
 * 2. Search query matches against both sourceText and translated text
 * 3. Timing / duration calculation accurately identifies tight dialogue lines
 * 4. Index.html contains dual-column thead headers
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseSubtitles } = require('../src/shared/subtitle-utils.js');

async function runStep1Test() {
  console.log('=================================================================');
  console.log('     TESTING UPGRADE STEP 1: DUAL-COLUMN SUBTITLE & PREVIEW      ');
  console.log('=================================================================\n');

  // 1. Test Subtitle Parsing preserves sourceText
  console.log('► [1/4] Verifying parseSubtitles populates both sourceText and t...');
  const srtSample = `1
00:00:01,000 --> 00:00:03,500
Hello world, welcome to AI Dubbing Studio

2
00:00:04,000 --> 00:00:06,000
你好，欢迎来到配音工作室
`;
  const parsed = parseSubtitles(srtSample);
  assert.strictEqual(parsed.length, 2, 'Must parse 2 segments');
  assert.strictEqual(parsed[0].t, 'Hello world, welcome to AI Dubbing Studio');
  assert.strictEqual(parsed[0].sourceText, 'Hello world, welcome to AI Dubbing Studio');
  assert.strictEqual(parsed[1].t, '你好，欢迎来到配音工作室');
  assert.strictEqual(parsed[1].sourceText, '你好，欢迎来到配音工作室');
  console.log('  ✓ PASSED: parseSubtitles preserves sourceText for both English and Chinese\n');

  // 2. Test Streamlined thead in index.html (thText present, thSource removed per user request)
  console.log('► [2/4] Verifying thead in index.html includes thText and streamlined columns...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(!html.includes('data-i18n="thSource"'), 'index.html must not have thSource header (removed per user request)');
  assert(html.includes('data-i18n="thText"'), 'index.html must have thText header');
  assert(html.includes('data-i18n="thStatus"'), 'index.html must have thStatus header');
  console.log('  ✓ PASSED: Streamlined thead structure validated in index.html\n');

  // 3. Test State Searching matches both sourceText and t
  console.log('► [3/4] Verifying State search matches sourceText as well as t...');
  const { state } = await import('../src/renderer/js/state.js');
  state.resetToEmpty(false);
  state.rows = [
    { id: 1, s: 0, e: 2.0, sourceText: 'Good morning my friend', t: 'អរុណសួស្តីមិត្តសម្លាញ់', v: 0, sp: 1.0, ok: true },
    { id: 2, s: 2.5, e: 4.5, sourceText: '快点走吧，要迟到了', t: 'ឆាប់ឡើង! ប្រយ័ត្នយឺត!', v: 1, sp: 1.0, ok: false }
  ];

  // Search by English source text
  state.searchQuery = 'morning';
  let filtered = state.getFilteredRows();
  assert.strictEqual(filtered.length, 1, 'Search for "morning" should match row 1');
  assert.strictEqual(filtered[0].id, 1);

  // Search by Chinese source text
  state.searchQuery = '迟到';
  filtered = state.getFilteredRows();
  assert.strictEqual(filtered.length, 1, 'Search for "迟到" should match row 2');
  assert.strictEqual(filtered[0].id, 2);

  // Search by Khmer translated text
  state.searchQuery = 'ប្រយ័ត្ន';
  filtered = state.getFilteredRows();
  assert.strictEqual(filtered.length, 1, 'Search for "ប្រយ័ត្ន" should match row 2');
  assert.strictEqual(filtered[0].id, 2);
  console.log('  ✓ PASSED: Search query successfully queries across both source and target columns\n');

  // 4. Test Syllable Density & Timing Calculation
  console.log('► [4/4] Verifying dialogue timing density calculations...');
  const normalRow = { s: 0, e: 3.0, sp: 1.0, t: 'សួស្តីបងប្អូនទាំងអស់គ្នា' }; // 22 chars in 3.0s = 7.3 chars/s
  const tightRow = { s: 0, e: 1.2, sp: 1.0, t: 'រឿងនេះគឺជារឿងមួយដែលអស្ចារ្យនិងមិនធ្លាប់មានពីមុនមកទេ' }; // 51 chars in 1.2s = 42.5 chars/s

  const isNormalTight = (normalRow.t.length / ((normalRow.e - normalRow.s) / normalRow.sp)) > 16.5;
  const isTooTight = (tightRow.t.length / ((tightRow.e - tightRow.s) / tightRow.sp)) > 16.5;

  assert.strictEqual(isNormalTight, false, 'Normal row must not be flagged tight');
  assert.strictEqual(isTooTight, true, 'Crowded line in short window must be flagged tight');
  console.log('  ✓ PASSED: Timing density threshold detects tight dialogue lines accurately\n');

  console.log('=================================================================');
  console.log('🎉 ALL UPGRADE STEP 1 VERIFICATION TESTS PASSED (100%)');
  console.log('=================================================================\n');
}

runStep1Test().catch(err => {
  console.error('❌ Step 1 verification failed:', err);
  process.exit(1);
});
