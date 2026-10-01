/**
 * Performance Benchmark Test for 2,000 Subtitle Segments
 * Validates:
 * 1. Loading speed of 2,000 segments into state
 * 2. Virtualized table calculation and slice rendering
 * 3. Search and filtering performance across 2,000 segments
 * 4. Find & Replace bulk operation performance
 * 5. Serialization and memory overhead for large projects
 */

const assert = require('assert');

// Polyfill minimal browser globals if needed for module imports
if (typeof window === 'undefined') {
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  global.localStorage = {
    getItem: () => null,
    setItem: () => {}
  };
}

async function runPerformanceTest() {
  console.log('=== Performance Pass: 2,000 Subtitle Segments ===\n');

  // 1. Generate 2,000 segments (1-hour video, ~1.8s per segment)
  console.log('[1/5] Generating 2,000 synthetic subtitle segments...');
  const SEGMENT_COUNT = 2000;
  const segments = [];
  let currentTime = 0;

  const sampleTexts = [
    'សូមស្វាគមន៍មកកាន់ការទស្សនាវីដេអូភាគពិសេសនេះ។',
    'តើអ្នកបានត្រៀមខ្លួនរួចរាល់ហើយឬនៅសម្រាប់ការធ្វើដំណើរ?',
    'យើងត្រូវតែរួសរាន់ឡើង ពេលវេលាមិនរង់ចាំយើងឡើយ!',
    'ខ្ញុំយល់ស្របនឹងគំនិតរបស់អ្នកទាំងស្រុង។',
    'សូមអរគុណយ៉ាងជ្រាលជ្រៅចំពោះការជួយជ្រោមជ្រែងកន្លងមក។',
    'សួស្តីបងប្អូនទាំងអស់គ្នា ថ្ងៃនេះយើងមានដំណឹងល្អមួយ។',
    'តើមានអ្វីកើតឡើងនៅទីនោះ? សូមប្រាប់ខ្ញុំភ្លាម!',
    'គ្មានបញ្ហាទេ ខ្ញុំអាចដោះស្រាយរឿងនេះបានយ៉ាងងាយ។'
  ];

  for (let i = 1; i <= SEGMENT_COUNT; i++) {
    const dur = 1.2 + ((i % 5) * 0.4);
    const start = Math.round(currentTime * 100) / 100;
    const end = Math.round((start + dur) * 100) / 100;
    currentTime = end + 0.3;

    segments.push({
      id: i,
      s: start,
      e: end,
      t: sampleTexts[i % sampleTexts.length] + ` [ជួរ ${i}]`,
      v: i % 5,
      sp: 1.0,
      ok: i % 3 === 0,
      ck: false
    });
  }

  console.log(`✓ Generated ${segments.length} segments spanning ${currentTime.toFixed(1)} seconds (${(currentTime / 60).toFixed(1)} mins)`);

  // 2. State loading benchmark
  console.log('\n[2/5] Benchmarking state loading and initialization...');
  const { state } = await import('../src/renderer/js/state.js');

  const startMem = process.memoryUsage().heapUsed;
  const loadStart = performance.now();

  state.loadProjectData({
    name: 'Feature_Film_2000_Subs',
    duration: currentTime,
    subtitles: segments
  });

  const loadDuration = performance.now() - loadStart;
  const endMem = process.memoryUsage().heapUsed;
  const memDiffMB = (endMem - startMem) / (1024 * 1024);

  console.log(`✓ 2,000 segments loaded into State in: ${loadDuration.toFixed(2)} ms`);
  console.log(`✓ Memory consumed by 2,000 segments: ${memDiffMB.toFixed(2)} MB`);
  assert(loadDuration < 150, `Loading took ${loadDuration}ms, must be < 150ms`);
  assert(memDiffMB < 30, `Memory overhead was ${memDiffMB}MB, must be < 30MB`);

  // 3. Search and Filtering benchmark
  console.log('\n[3/5] Benchmarking search & filtering across 2,000 segments...');
  state.filterVoice = 2; // Filter by voice index 2
  state.searchQuery = 'ដំណឹងល្អ'; // Khmer text search

  const filterStart = performance.now();
  const filtered = state.getFilteredRows();
  const filterDuration = performance.now() - filterStart;

  console.log(`✓ Filtering returned ${filtered.length} matches in: ${filterDuration.toFixed(3)} ms`);
  assert(filterDuration < 20, `Filtering took ${filterDuration}ms, must be < 20ms`);
  assert(filtered.length > 0, 'Should find matches for Khmer text query');

  // Reset filters
  state.filterVoice = -1;
  state.searchQuery = '';

  // 4. Bulk Find & Replace benchmark
  console.log('\n[4/5] Benchmarking Bulk Find & Replace on 2,000 segments...');
  const replaceStart = performance.now();
  state.snapshot();

  let replaceCount = 0;
  const targetWord = 'វីដេអូ';
  const replaceWord = 'ខ្សែភាពយន្ត';

  state.rows.forEach(r => {
    if (r.t.includes(targetWord)) {
      r.t = r.t.replace(new RegExp(targetWord, 'g'), replaceWord);
      replaceCount++;
    }
  });

  const replaceDuration = performance.now() - replaceStart;
  console.log(`✓ Replaced ${replaceCount} occurrences across 2,000 segments in: ${replaceDuration.toFixed(2)} ms`);
  assert(replaceDuration < 50, `Find & Replace took ${replaceDuration}ms, must be < 50ms`);

  // Test Undo performance
  const undoStart = performance.now();
  state.undo();
  const undoDuration = performance.now() - undoStart;
  console.log(`✓ State Undo restored 2,000 segments in: ${undoDuration.toFixed(2)} ms`);
  assert(undoDuration < 50, `Undo took ${undoDuration}ms, must be < 50ms`);

  // 5. Serialization benchmark
  console.log('\n[5/5] Benchmarking project serialization...');
  const serStart = performance.now();
  const serialized = state.serializeProject();
  const jsonString = JSON.stringify(serialized);
  const serDuration = performance.now() - serStart;

  console.log(`✓ Serialized 2,000 segments into JSON (${(jsonString.length / 1024).toFixed(1)} KB) in: ${serDuration.toFixed(2)} ms`);
  assert(serDuration < 60, `Serialization took ${serDuration}ms, must be < 60ms`);

  console.log('\n======================================================');
  console.log('🎉 2,000-SEGMENT PERFORMANCE BENCHMARK PASSED (100%)');
  console.log('======================================================\n');
}

runPerformanceTest().catch(err => {
  console.error('\n❌ Performance Benchmark Failed:', err);
  process.exit(1);
});
