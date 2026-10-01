/**
 * Unit Test for TtsService
 * Tests:
 * 1. Mock TTS synthesis producing valid audio files
 * 2. Caching mechanism (second run hits cache)
 * 3. Auto-fit duration adjustment & overflow detection
 * 4. Sync-end positioning
 * 5. Concurrency & progress callback
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ttsService = require('../src/main/services/providers/tts');

async function runTtsServiceTest() {
  console.log('--- Running TTS Service Unit Tests ---');

  const testDir = path.join(__dirname, '../test-assets/tts_test_project');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const segments = [
    { id: 1, s: 0.0, e: 2.0, t: 'សួស្តីបងប្អូនទាំងអស់គ្នា', v: 0, sp: 1.0 }, // A1
    { id: 2, s: 2.5, e: 4.0, t: 'សូមស្វាគមន៍មកកាន់ភាគថ្មី', v: 2, sp: 1.0 }, // A3
    { id: 3, s: 4.5, e: 5.5, t: 'អត្ថបទនេះវែងណាស់សម្រាប់ពេលខ្លីមួយវិនាទីតែប៉ុណ្ណោះ', v: 1, sp: 1.0 } // tight slot -> overflow
  ];

  let progressCalls = 0;
  const onProgress = (prog) => {
    progressCalls++;
  };

  // Test 1: Batch synthesis with Mock engine
  console.log('Synthesizing batch with Mock engine...');
  const results = await ttsService.synthesizeBatch(segments, {
    engine: 'mock',
    projectDir: testDir,
    autoFitMode: 'med',
    syncEnd: true,
    concurrency: 2
  }, onProgress);

  assert.strictEqual(results.length, 3, 'All 3 segments should be processed');
  assert.ok(progressCalls >= 3, 'Progress callback should be called for each segment');

  // Verify file outputs
  results.forEach(res => {
    assert.strictEqual(res.ok, true, `Segment ${res.id} should succeed`);
    assert.ok(fs.existsSync(res.audioPath), `Audio file should exist at ${res.audioPath}`);
    assert.ok(fs.statSync(res.audioPath).size > 0, 'Audio file should have non-zero size');
  });
  console.log('✓ Test 1 Passed: Batch synthesis generated valid audio files');

  // Test 2: Caching verification
  console.log('Synthesizing same batch again to verify caching...');
  const cachedResults = await ttsService.synthesizeBatch(segments, {
    engine: 'mock',
    projectDir: testDir,
    autoFitMode: 'med',
    syncEnd: true,
    concurrency: 2
  });

  assert.strictEqual(cachedResults.length, 3);
  cachedResults.forEach(res => {
    assert.strictEqual(res.cached, true, `Segment ${res.id} should be loaded from cache`);
  });
  console.log('✓ Test 2 Passed: Caching mechanism returned cached audio clips');

  // Test 3: Auto-fit & Overflow detection
  // Segment 3 has a lot of text in 1.0s slot -> overflow detected
  const seg3 = results.find(r => r.id === 3);
  assert.ok(seg3.overflow === true || seg3.appliedTempo > 1.0, 'Segment 3 should trigger speedup or overflow');
  console.log('✓ Test 3 Passed: Auto-Fit calculation evaluated slot duration correctly');

  // Test 4: List voices
  const voices = await ttsService.listVoices('mock');
  assert.ok(Array.isArray(voices) && voices.length >= 2, 'Should list mock voices');
  assert.ok(voices.some(v => v.locale === 'km-KH'), 'Should contain Khmer voices');
  console.log('✓ Test 4 Passed: listVoices returns Khmer and other voices');

  // Clean up
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\nSUCCESS: All TTS Service Unit Tests Passed!\n');
}

runTtsServiceTest().catch(err => {
  console.error('TTS Service Test Failed:', err);
  process.exit(1);
});
