const assert = require('assert');
const translationService = require('../src/main/services/providers/translation');

async function run() {
  console.log('Testing TranslationService with Mock provider...');

  const inputSegments = [
    { id: 1, text: 'Hello everyone!', start: 0.5, end: 2.3, speaker: 'Speaker 1', gender: 'male' },
    { id: 2, text: 'Welcome to the new episode.', start: 2.5, end: 4.8, speaker: 'Speaker 1', gender: 'male' },
    { id: 3, text: 'Are you ready for the adventure?', start: 5.1, end: 7.2, speaker: 'Speaker 2', gender: 'female' },
    { id: 4, text: 'We will start our journey now!', start: 7.5, end: 9.6, speaker: 'Speaker 2', gender: 'female' }
  ];

  const progressEvents = [];
  const results = await translationService.translate(inputSegments, {
    engine: 'mock',
    targetLang: 'Khmer',
    batchSize: 2
  }, (p) => {
    progressEvents.push(p);
  });

  assert.strictEqual(results.length, 4, 'Should translate all 4 segments');
  assert.strictEqual(results[0].id, 1);
  assert.strictEqual(results[0].translatedText, 'សួស្តីបងប្អូនទាំងអស់គ្នា!');
  assert.strictEqual(results[1].id, 2);
  assert.strictEqual(results[2].id, 3);
  assert.strictEqual(results[3].id, 4);

  assert.strictEqual(progressEvents.length, 2, 'Should emit 2 batch progress events');
  assert.strictEqual(progressEvents[1].percent, 100);

  console.log('✓ Mock translation batching and IDs aligned successfully:', results);
  console.log('✓ Progress events:', progressEvents);

  // Test cancellation
  console.log('Testing Translation cancellation...');
  const cancelPromise = translationService.translate(inputSegments, { engine: 'mock', batchSize: 1 });
  translationService.cancel();
  try {
    await cancelPromise;
    assert.fail('Should have thrown cancellation error');
  } catch (err) {
    assert.strictEqual(err.message, 'Translation cancelled by user.');
    console.log('✓ Translation cancellation verified');
  }

  console.log('All TranslationService tests passed!');
  process.exit(0);
}

run();
