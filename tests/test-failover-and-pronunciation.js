/**
 * Integration Test Suite for:
 * 1. CodeCraft & Gemini Key Pool with Auto-Failover
 * 2. Cross-Engine Failover (Gemini <-> CodeCraft)
 * 3. Auto-Fit Timing & Neural Rate Adjustment
 * 4. Khmer Pronunciation Dictionary & Pacing
 */

const assert = require('assert');
const codecraftKeyPool = require('../src/main/services/codecraft-pool');
const keyPool = require('../src/main/services/key-pool');
const translationService = require('../src/main/services/providers/translation');
const asrService = require('../src/main/services/providers/asr');
const ttsService = require('../src/main/services/providers/tts');
const pronunciationService = require('../src/main/services/pronunciation');
const { calculateAutoFit, calculateSyncEnd } = require('../src/main/services/timing/auto-fit');
const settingsService = require('../src/main/services/settings');

async function runTests() {
  console.log('=== STARTING TEST: FAILOVER, AUTO-FIT TIMING & PRONUNCIATION ===\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
    }
  }

  // --- 1. CodeCraft Multi-Key Pool & Rotation ---
  test('CodeCraft Key Pool: parses and rotates multiple keys', () => {
    settingsService.update({
      codecraft: {
        apiKey: 'cc_testKey1, cc_testKey2\ncc_testKey3',
        baseUrl: 'https://codecraftapi.com/v1'
      }
    });

    codecraftKeyPool.syncFromSettings();
    assert.strictEqual(codecraftKeyPool.keys.length, 3, 'Should parse 3 keys');

    const k1 = codecraftKeyPool.getNextKey();
    const k2 = codecraftKeyPool.getNextKey();
    const k3 = codecraftKeyPool.getNextKey();
    assert(k1 !== k2, 'Keys should rotate');
    assert(k2 !== k3, 'Keys should rotate across pool');

    // Test cooldown
    codecraftKeyPool.markCooldown(k1, 5000);
    const kNext = codecraftKeyPool.getNextKey();
    assert.notStrictEqual(kNext, k1, 'Cooling down key should not be selected');
    codecraftKeyPool.resetCooldowns();
  });

  // --- 2. Khmer Pronunciation Dictionary ---
  test('Khmer Pronunciation Dictionary: applies phonetic replacements', () => {
    pronunciationService.addExampleRules();
    const testText = 'Hello Boss, my AI camera and iPhone are OK, please call the Doctor';
    const transformed = pronunciationService.apply(testText, 'km');

    assert(transformed.includes('មេ'), 'Boss should become មេ');
    assert(transformed.includes('អេអាយ'), 'AI should become អេអាយ');
    assert(transformed.includes('អាយហ្វូន'), 'iPhone should become អាយហ្វូន');
    assert(transformed.includes('អូខេ'), 'OK should become អូខេ');
    assert(transformed.includes('ដុកទ័រ'), 'Doctor should become ដុកទ័រ');
  });

  test('TTS Natural Khmer Pacing: injects breathing commas at conjunctive boundaries', () => {
    const rawLong = 'សួស្តីបងប្អូនទាំងអស់គ្នាហើយថ្ងៃនេះខ្ញុំមានដំណឹងល្អមួយចង់ប្រាប់ទៅកាន់អ្នកទាំងអស់គ្នា';
    const paced = ttsService.smoothKhmerPacing(rawLong);
    assert(paced.includes(','), 'Should insert breathing pause at phrase boundary');
  });

  // --- 3. Auto-Fit Timing & Smart Neural Rate ---
  test('Auto-Fit Timing: calculates tempo scaling and avoids clip bleed', () => {
    // 5s clip into 3s slot -> needs ~1.66x tempo
    const fit = calculateAutoFit({
      clipDuration: 5.0,
      slotDuration: 3.0,
      mode: 'high',
      userSpeed: 1.0
    });

    assert(fit.appliedTempo > 1.0, 'Applied tempo should speed up audio');
    assert(fit.finalDuration <= 3.5, 'Final duration should be condensed close to slot');
    assert(Array.isArray(fit.atempoChain), 'Should generate atempo chain');

    // Sync End test
    const sync = calculateSyncEnd({
      start: 10.0,
      end: 13.0,
      clipDuration: 2.5,
      nextStart: 13.5,
      syncEnd: true
    });

    assert.strictEqual(sync.clipEnd, 13.0, 'Should anchor to slot end without bleeding');
  });

  test('TTS Smart Neural Rate: calculates pre-emptive rate offset for Edge-TTS', () => {
    // 100 characters in a 2-second slot -> needs speedup
    const fastRate = ttsService.computeSmartNeuralRate(
      'នេះជាអត្ថបទវែងណាស់ដែលត្រូវការនិយាយលឿនក្នុងរយៈពេលខ្លី',
      2.0,
      '+0%',
      1.0,
      'med'
    );
    assert(fastRate.startsWith('+'), 'Should compute a positive rate offset');
    assert(fastRate !== '+0%', 'Should speed up from baseline');
  });

  // --- 4. Cross-Engine Translation Auto-Failover ---
  await testAsync('Translation Service: auto-failovers gracefully between engines', async () => {
    // Test with mock fallback
    const mockSegments = [{ id: 1, text: 'Hello world' }];

    // Temporarily point codecraft to mock provider
    const origCodecraft = translationService.providers['codecraft'];
    translationService.providers['codecraft'] = {
      name: 'codecraft-mock',
      isCancelled: false,
      translate: async () => [{ id: 1, translatedText: 'សួស្តីពិភពលោក' }],
      condense: async (items) => items.map(i => ({ id: i.id, condensedText: 'សួស្តី' }))
    };

    // When Gemini throws quota error, translationService should failover to CodeCraft
    const origGemini = translationService.providers['gemini'];
    translationService.providers['gemini'] = {
      name: 'gemini-mock',
      isCancelled: false,
      translate: async () => { throw new Error('Gemini rate limit exceeded [DAILY_QUOTA_EXHAUSTED]'); },
      condense: async () => { throw new Error('Gemini rate limit exceeded'); }
    };

    let failoverProgressMsg = '';
    const results = await translationService.translate(mockSegments, { engine: 'gemini' }, (p) => {
      if (p.message) failoverProgressMsg = p.message;
    });

    assert.strictEqual(results[0].translatedText, 'សួស្តីពិភពលោក', 'Should return translated text from CodeCraft fallback');
    assert(failoverProgressMsg.includes('CodeCraft'), 'Progress should notify user of auto-failover');

    // Test 4b: Network error failover
    translationService.providers['gemini'] = {
      name: 'gemini-mock',
      isCancelled: false,
      translate: async () => { throw new Error('[GEMINI_NETWORK_TIMEOUT] Gemini network connection failed: fetch failed'); },
      condense: async () => { throw new Error('[GEMINI_NETWORK_TIMEOUT] Gemini connection failed: ENOTFOUND'); }
    };
    failoverProgressMsg = '';
    const networkResults = await translationService.translate(mockSegments, { engine: 'gemini' }, (p) => {
      if (p.message) failoverProgressMsg = p.message;
    });
    assert.strictEqual(networkResults[0].translatedText, 'សួស្តីពិភពលោក', 'Should failover to CodeCraft on Gemini network error');
    assert(failoverProgressMsg.includes('CodeCraft') && failoverProgressMsg.includes('Network'), 'Progress should mention Network/Timeout failover');

    // Test 4c: API Timeout error failover
    translationService.providers['gemini'] = {
      name: 'gemini-mock',
      isCancelled: false,
      translate: async () => { throw new Error('[GEMINI_NETWORK_TIMEOUT] Gemini API request timed out after 25s'); },
      condense: async () => { throw new Error('[GEMINI_NETWORK_TIMEOUT] Gemini condense timed out after 25s'); }
    };
    failoverProgressMsg = '';
    const timeoutResults = await translationService.translate(mockSegments, { engine: 'gemini' }, (p) => {
      if (p.message) failoverProgressMsg = p.message;
    });
    assert.strictEqual(timeoutResults[0].translatedText, 'សួស្តីពិភពលោក', 'Should failover to CodeCraft on Gemini API timeout');
    assert(failoverProgressMsg.includes('CodeCraft') && failoverProgressMsg.includes('Timeout'), 'Progress should mention Timeout failover');

    // Restore original providers
    translationService.providers['codecraft'] = origCodecraft;
    translationService.providers['gemini'] = origGemini;
  });

  console.log(`\n================================`);
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED!`);
  console.log(`================================\n`);
  assert.strictEqual(passed, total, 'All tests must pass');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
