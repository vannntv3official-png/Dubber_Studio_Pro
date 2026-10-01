const BaseAsrProvider = require('./base');

class MockAsrProvider extends BaseAsrProvider {
  constructor() {
    super('mock');
  }

  async transcribe(audioPath, options = {}, onProgress = null) {
    this.isCancelled = false;

    const mockSegments = [
      { id: 1, start: 0.50, end: 2.30, text: 'សួស្តីបងប្អូនទាំងអស់គ្នា', speaker: 'Speaker 1', gender: 'male' },
      { id: 2, start: 2.50, end: 4.80, text: 'សូមស្វាគមន៍មកកាន់វគ្គថ្មីនៃរឿង', speaker: 'Speaker 1', gender: 'male' },
      { id: 3, start: 5.10, end: 7.20, text: 'តើអ្នកបានត្រៀមខ្លួនរួចរាល់ហើយឬនៅ?', speaker: 'Speaker 2', gender: 'female' },
      { id: 4, start: 7.50, end: 9.60, text: 'ពួកយើងនឹងចាប់ផ្តើមការផ្សងព្រេងឥឡូវនេះ', speaker: 'Speaker 2', gender: 'female' }
    ];

    const steps = [
      { percent: 20, message: 'Mock ASR: Loading acoustic model...' },
      { percent: 50, message: 'Mock ASR: Processing voice segments...' },
      { percent: 80, message: 'Mock ASR: Aligning timestamps...' },
      { percent: 100, message: 'Mock ASR: Completed.' }
    ];

    for (const step of steps) {
      if (this.isCancelled) {
        throw new Error('Transcription cancelled by user.');
      }
      if (typeof onProgress === 'function') {
        onProgress(step);
      }
      // Small delay to simulate async work
      await new Promise(r => setTimeout(r, 100));
    }

    return mockSegments;
  }
}

module.exports = MockAsrProvider;
