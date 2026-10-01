/**
 * Unit Tests for Subtitle Parsing and Serialization (SRT & WebVTT)
 */

const {
  timeStringToSeconds,
  secondsToSrtTime,
  secondsToVttTime,
  parseSrt,
  parseVtt,
  serializeToSrt,
  serializeToVtt
} = require('../src/shared/subtitle-utils');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('--- Running Subtitle Utils Unit Tests ---');

// 1. Time conversion tests
assert(timeStringToSeconds('00:01:23,450') === 83.45, 'Parse SRT time with comma: 00:01:23,450 -> 83.45s');
assert(timeStringToSeconds('00:01:23.450') === 83.45, 'Parse VTT time with dot: 00:01:23.450 -> 83.45s');
assert(timeStringToSeconds('01:23.50') === 83.5, 'Parse compact time MM:SS.cc: 01:23.50 -> 83.5s');
assert(secondsToSrtTime(83.456) === '00:01:23,456', 'Format seconds to SRT time: 83.456 -> 00:01:23,456');
assert(secondsToVttTime(83.456) === '00:01:23.456', 'Format seconds to VTT time: 83.456 -> 00:01:23.456');

// 2. SRT Parsing test
const sampleSrt = `
1
00:00:01,000 --> 00:00:04,500
សូមស្វាគមន៍មកកាន់ AI Dubbing Studio!

2
00:00:05,200 --> 00:00:08,800
នេះជាការសាកល្បងអក្សររងជាភាសាខ្មែរ។
`;

const srtSegments = parseSrt(sampleSrt);
assert(srtSegments.length === 2, `SRT parsed 2 segments (found: ${srtSegments.length})`);
assert(srtSegments[0].s === 1.0 && srtSegments[0].e === 4.5, `Segment 1 timestamps: ${srtSegments[0].s}s - ${srtSegments[0].e}s`);
assert(srtSegments[0].t.includes('សូមស្វាគមន៍'), 'Segment 1 text matches Khmer content');

// 3. WebVTT Parsing test
const sampleVtt = `WEBVTT - Sample File

1
00:00:01.000 --> 00:00:04.500 position:50% line:0%
<v Speaker1>សូមស្វាគមន៍មកកាន់ AI Dubbing Studio!</v>

2
00:00:05.200 --> 00:00:08.800
<b>នេះជាការសាកល្បងអក្សររងជាភាសាខ្មែរ។</b>
`;

const vttSegments = parseVtt(sampleVtt);
assert(vttSegments.length === 2, `WebVTT parsed 2 segments (found: ${vttSegments.length})`);
assert(!vttSegments[0].t.includes('<v Speaker1>'), 'WebVTT cue tags stripped cleanly');
assert(!vttSegments[1].t.includes('<b>'), 'HTML tags stripped cleanly');

// 4. Roundtrip serialization test
const serializedSrt = serializeToSrt(srtSegments);
const reparsedSrt = parseSrt(serializedSrt);
assert(reparsedSrt.length === 2, 'SRT roundtrip serialization preserved segment count');
assert(reparsedSrt[0].s === srtSegments[0].s && reparsedSrt[0].e === srtSegments[0].e, 'SRT roundtrip preserved timestamps');

const serializedVtt = serializeToVtt(vttSegments);
const reparsedVtt = parseVtt(serializedVtt);
assert(reparsedVtt.length === 2, 'WebVTT roundtrip serialization preserved segment count');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('*** SUBTITLE UTILS TESTS PASSED ***\n');
}
