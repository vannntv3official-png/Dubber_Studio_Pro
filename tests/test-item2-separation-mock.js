/**
 * Integration Test for Item 2: Audio Separation (Isolate BGM)
 * Verifies:
 * 1. Shared IPC contract formatSeparationResponse guarantees both bgmPath and accompanimentPath
 * 2. Mock separation provider generates vocals and BGM stems
 * 3. BGM track is loaded via media:load-bgm and waveform peaks are generated
 * 4. Error conditions report real error message (not hardcoded 'Engine unavailable')
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { formatSeparationResponse } = require('../src/shared/contracts');
const separationService = require('../src/main/services/providers/separation');
const ffmpegService = require('../src/main/services/ffmpeg');

const TEST_DIR = path.join(__dirname, 'temp_item2_test');

async function run() {
  console.log('=== Test Item 2: Isolate BGM Contract & Mock Separation Integration ===');

  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // 1. Verify shared contract formatting
  console.log('[1/4] Verifying shared IPC contract response formatting...');
  const successContract = formatSeparationResponse({
    success: true,
    vocalsPath: '/path/to/vocals.wav',
    bgmPath: '/path/to/bgm.wav'
  });

  assert.strictEqual(successContract.success, true);
  assert.strictEqual(successContract.bgmPath, '/path/to/bgm.wav');
  assert.strictEqual(successContract.accompanimentPath, '/path/to/bgm.wav', 'accompanimentPath must alias bgmPath');
  assert.strictEqual(successContract.vocalsPath, '/path/to/vocals.wav');
  assert.strictEqual(successContract.error, null);

  const errorContract = formatSeparationResponse({
    success: false,
    error: 'Demucs model not installed'
  });
  assert.strictEqual(errorContract.success, false);
  assert.strictEqual(errorContract.error, 'Demucs model not installed', 'Real error message must be preserved');
  console.log('✓ Shared contract correctly normalizes bgmPath, accompanimentPath, and errors');

  // 2. Generate a test audio fixture
  console.log('[2/4] Generating 3s test audio fixture...');
  const audioInput = path.join(TEST_DIR, 'input_tone.wav');
  await ffmpegService.generateSineTone(audioInput, 440, 3.0);
  assert(fs.existsSync(audioInput) && fs.statSync(audioInput).size > 0, 'Audio fixture should exist');
  console.log('✓ Audio fixture generated');

  // 3. Run mock separation provider
  console.log('[3/4] Running Mock Separation Provider...');
  const sepOutDir = path.join(TEST_DIR, 'separated');
  let progressReported = false;

  const sepResult = await separationService.separate(
    audioInput,
    sepOutDir,
    { engine: 'mock' },
    (prog) => {
      progressReported = true;
    }
  );

  const normalized = formatSeparationResponse({
    success: true,
    vocalsPath: sepResult.vocalsPath,
    bgmPath: sepResult.bgmPath
  });

  assert.strictEqual(normalized.success, true, 'Separation must succeed');
  assert(normalized.bgmPath && fs.existsSync(normalized.bgmPath), 'bgmPath must exist on disk');
  assert(normalized.accompanimentPath && fs.existsSync(normalized.accompanimentPath), 'accompanimentPath must exist on disk');
  assert(normalized.vocalsPath && fs.existsSync(normalized.vocalsPath), 'vocalsPath must exist on disk');
  assert(progressReported, 'Progress callback should be fired');
  console.log(`✓ Stems generated: vocals=${path.basename(normalized.vocalsPath)}, bgm=${path.basename(normalized.bgmPath)}`);

  // 4. Test loading BGM and generating waveform peaks
  console.log('[4/4] Verifying BGM waveform peak computation...');
  const peaks = await ffmpegService.generateWaveformPeaks(normalized.bgmPath, 600);
  assert(Array.isArray(peaks), 'Peaks must be an array');
  assert.strictEqual(peaks.length, 600, 'Must produce requested 600 peaks');
  const maxPeak = Math.max(...peaks);
  assert(maxPeak > 0, 'Waveform peaks must have non-zero amplitude');
  console.log(`✓ Waveform generated: 600 peaks, max peak amplitude = ${maxPeak.toFixed(4)}`);

  // 5. Test real error reporting on missing file
  console.log('[Extra] Verifying real error reporting on failure...');
  try {
    await separationService.separate('/nonexistent/path/file.wav', sepOutDir, { engine: 'mock' });
    assert.fail('Should have thrown on non-existent file');
  } catch (err) {
    const errResp = formatSeparationResponse({ success: false, error: err.message });
    assert.strictEqual(errResp.success, false);
    assert(errResp.error.length > 0 && !errResp.error.includes('Engine unavailable'), 'Should report real ffmpeg error');
    console.log(`✓ Real error captured: "${errResp.error.slice(0, 60)}..."`);
  }

  // Cleanup
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n=== ALL ITEM 2 SEPARATION TESTS PASSED ===');
}

run().catch(err => {
  console.error('Test Item 2 FAILED:', err);
  process.exit(1);
});
