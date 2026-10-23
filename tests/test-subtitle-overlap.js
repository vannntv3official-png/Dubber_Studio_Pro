const assert = require('assert');
const {
  detectOverlaps,
  resolveOverlaps,
  parseSrt
} = require('../src/shared/subtitle-utils');

function runTests() {
  console.log('=== Test Suite: Subtitle Overlap Detection & Auto-Resolution ===\n');

  // Test 1: Clean segments with no overlaps
  console.log('[1/5] Testing clean non-overlapping segments...');
  const cleanSubs = [
    { id: 1, s: 1.0, e: 3.0, t: 'Hello' },
    { id: 2, s: 3.5, e: 5.0, t: 'World' },
    { id: 3, s: 5.0, e: 7.2, t: 'Dubbing' }
  ];
  const noOverlaps = detectOverlaps(cleanSubs);
  assert.strictEqual(noOverlaps.length, 0, 'Clean subtitles should have 0 overlaps');
  const resolvedClean = resolveOverlaps([...cleanSubs]);
  assert.strictEqual(resolvedClean[0].e, 3.0);
  assert.strictEqual(resolvedClean[1].s, 3.5);
  console.log('  ✓ Clean segments correctly identified with 0 overlaps');

  // Test 2: Single overlap resolution
  console.log('\n[2/5] Testing single overlap detection and resolution...');
  const singleOverlap = [
    { id: 1, s: 1.0, e: 4.5, t: 'Segment 1' },
    { id: 2, s: 4.0, e: 6.0, t: 'Segment 2' }
  ];
  const detectedSingle = detectOverlaps(singleOverlap);
  assert.strictEqual(detectedSingle.length, 1, 'Should detect exactly 1 overlap');
  assert.strictEqual(detectedSingle[0].overlapDuration, 0.5, 'Overlap should be 0.5s');

  const resolvedSingle = resolveOverlaps([...singleOverlap]);
  assert.strictEqual(resolvedSingle[0].e, 4.0, 'Segment 1 end must be trimmed to 4.0s');
  assert.strictEqual(resolvedSingle[1].s, 4.0, 'Segment 2 start must remain 4.0s');
  assert.strictEqual(detectOverlaps(resolvedSingle).length, 0, 'Resolved segments must have 0 overlaps');
  console.log('  ✓ Single overlap resolved cleanly (4.5s -> 4.0s)');

  // Test 3: Chained overlaps (like the user screenshot)
  console.log('\n[3/5] Testing chained multi-segment overlaps (real-world screenshot case)...');
  const chainedOverlap = [
    { id: 1, s: 1.0, e: 4.2, t: 'ចុះថ្ងៃបន្តិចទៀត ចង់ជួបបន្តិចបានទេ?' },
    { id: 2, s: 3.8, e: 5.5, t: 'គុណនិងយើង...' },
    { id: 3, s: 5.0, e: 6.8, t: 'គ្មានកា...' },
    { id: 4, s: 6.4, e: 8.0, t: 'ចុះបន្តិច...' }
  ];
  const detectedChain = detectOverlaps(chainedOverlap);
  assert.strictEqual(detectedChain.length, 3, 'Should detect 3 chained overlaps');

  const resolvedChain = resolveOverlaps(chainedOverlap);
  assert.strictEqual(detectOverlaps(resolvedChain).length, 0, 'All overlaps must be eliminated');
  assert(resolvedChain[0].e <= resolvedChain[1].s, 'Seg 1 must end at or before Seg 2 starts');
  assert(resolvedChain[1].e <= resolvedChain[2].s, 'Seg 2 must end at or before Seg 3 starts');
  assert(resolvedChain[2].e <= resolvedChain[3].s, 'Seg 3 must end at or before Seg 4 starts');
  assert.strictEqual(resolvedChain[0].e, 3.8, 'Seg 1 trimmed to Seg 2 start (3.8)');
  assert.strictEqual(resolvedChain[1].e, 5.0, 'Seg 2 trimmed to Seg 3 start (5.0)');
  assert.strictEqual(resolvedChain[2].e, 6.4, 'Seg 3 trimmed to Seg 4 start (6.4)');
  console.log('  ✓ Chained overlaps resolved: 100% gapless and overlap-free');

  // Test 4: Format polymorphism ({ start, end } used by ASR engines)
  console.log('\n[4/5] Testing format polymorphism with ASR { start, end } schema...');
  const asrSegments = [
    { id: 1, start: 0.5, end: 3.2, text: 'ASR chunk 1' },
    { id: 2, start: 2.8, end: 5.1, text: 'ASR chunk 2' }
  ];
  const detectedAsr = detectOverlaps(asrSegments);
  assert.strictEqual(detectedAsr.length, 1);
  assert.strictEqual(detectedAsr[0].overlapDuration, 0.4);

  const resolvedAsr = resolveOverlaps(asrSegments);
  assert.strictEqual(resolvedAsr[0].end, 2.8);
  assert.strictEqual(resolvedAsr[1].start, 2.8);
  assert.strictEqual(detectOverlaps(resolvedAsr).length, 0);
  console.log('  ✓ ASR schema { start, end } seamlessly supported');

  // Test 5: SRT parsing with overlapping timestamps
  console.log('\n[5/5] Testing parseSrt auto-resolution on dirty SRT input...');
  const dirtySrt = `
1
00:00:01,000 --> 00:00:04,500
First overlapping subtitle

2
00:00:03,800 --> 00:00:06,000
Second overlapping subtitle
  `.trim();

  const parsed = parseSrt(dirtySrt);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].e, 3.8, 'parseSrt must auto-trim first subtitle to 3.8s');
  assert.strictEqual(parsed[1].s, 3.8);
  assert.strictEqual(detectOverlaps(parsed).length, 0, 'Parsed SRT must be 100% overlap-free');
  console.log('  ✓ parseSrt automatically resolves overlapping timestamps');

  console.log('\n======================================================');
  console.log('🎉 ALL SUBTITLE OVERLAP TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

runTests();
