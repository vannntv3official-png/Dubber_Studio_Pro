const BaseTranslationProvider = require('./base');

class MockTranslationProvider extends BaseTranslationProvider {
  constructor() {
    super('mock');
  }

  async translate(segments, options = {}, onProgress = null) {
    this.isCancelled = false;
    const targetLang = (options.targetLang || 'Khmer').toLowerCase();
    const batchSize = Math.max(1, options.batchSize || 2);
    const total = segments.length;

    const mockKhmerTranslations = {
      'hello': 'សួស្តី',
      'welcome': 'សូមស្វាគមន៍',
      'adventure': 'ការផ្សងព្រេង',
      'ready': 'ត្រៀមខ្លួនរួចរាល់'
    };

    const results = [];
    const batches = [];
    for (let i = 0; i < total; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    let processed = 0;
    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (this.isCancelled) {
        throw new Error('Translation cancelled by user.');
      }

      const batch = batches[bIdx];
      // Small simulated delay
      await new Promise(r => setTimeout(r, 80));

      for (const seg of batch) {
        let trans = seg.text;
        if (targetLang.includes('khmer') || targetLang.includes('km')) {
          // If English or other, produce authentic Khmer dialogue
          if (/^[a-zA-Z\s.,?!'"]+$/.test(seg.text)) {
            trans = `[បកប្រែ] ${seg.text}`;
            if (seg.id === 1) trans = 'សួស្តីបងប្អូនទាំងអស់គ្នា!';
            else if (seg.id === 2) trans = 'សូមស្វាគមន៍មកកាន់វគ្គថ្មីនៃរឿង។';
            else if (seg.id === 3) trans = 'តើអ្នកបានត្រៀមខ្លួនរួចរាល់ហើយឬនៅ?';
            else if (seg.id === 4) trans = 'ពួកយើងនឹងចាប់ផ្តើមដំណើរឥឡូវនេះ!';
          } else {
            // Already Khmer, refine for voice dubbing
            trans = `${seg.text} (សម្រួលសម្លេង)`;
          }
        } else {
          trans = `[${options.targetLang || 'EN'}] ${seg.text}`;
        }

        results.push({
          id: seg.id,
          translatedText: trans
        });
      }

      processed += batch.length;
      const pct = Math.min(100, Math.round((processed / total) * 100));

      if (typeof onProgress === 'function') {
        onProgress({
          current: processed,
          total: total,
          percent: pct,
          message: `Mock Translation: Completed batch ${bIdx + 1}/${batches.length} (${processed}/${total} lines)...`
        });
      }
    }

    return results;
  }

  async condense(items, options = {}) {
    const list = Array.isArray(items) ? items : [items];
    return list.map((item, idx) => {
      const orig = item.text || item.t || '';
      let condensed = orig.replace(/^តើ\s*/, '').replace(/(\s*មែនទេ\??)$/, '?');
      if (condensed.length > 25) {
        condensed = condensed.substring(0, 20).trim() + '...';
      }
      return {
        id: item.id != null ? item.id : idx + 1,
        condensedText: condensed || orig,
        alternatives: [condensed]
      };
    });
  }
}

module.exports = MockTranslationProvider;
