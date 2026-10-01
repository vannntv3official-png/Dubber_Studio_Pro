const assert = require('assert');
const asrService = require('../src/main/services/providers/asr');

async function run() {
  console.log('Testing AsrService with Mock provider...');
  const progressLogs = [];

  const segments = await asrService.transcribe('dummy/path/audio.wav', { engine: 'mock' }, (p) => {
    progressLogs.push(p);
  });

  assert.strictEqual(segments.length, 4, 'Should return 4 mock segments');
  assert.strictEqual(segments[0].id, 1);
  assert.strictEqual(typeof segments[0].start, 'number');
  assert.strictEqual(typeof segments[0].end, 'number');
  assert.strictEqual(typeof segments[0].text, 'string');
  assert.strictEqual(typeof segments[0].speaker, 'string');
  assert.strictEqual(typeof segments[0].gender, 'string');

  assert.strictEqual(progressLogs.length, 4, 'Should have emitted 4 progress events');
  assert.strictEqual(progressLogs[progressLogs.length - 1].percent, 100);

  console.log('✓ Mock ASR segments verified:', segments);
  console.log('✓ Progress events verified:', progressLogs);

  // Test cancellation
  console.log('Testing Mock ASR cancellation...');
  const cancelPromise = asrService.transcribe('dummy/path/audio.wav', { engine: 'mock' });
  asrService.cancel();
  try {
    await cancelPromise;
    assert.fail('Should have been cancelled');
  } catch (err) {
    assert.strictEqual(err.message, 'Transcription cancelled by user.');
    console.log('✓ Cancellation verified');
  }

  console.log('All AsrService tests passed!');
  process.exit(0);
}

run();
