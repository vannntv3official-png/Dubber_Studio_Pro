/**
 * Test Item 8: Central FFmpeg Command Builder & -threads Flag
 * Verifies that ffmpegService.buildFfmpegArgs passes -threads N from settings.system.ffmpegThreads,
 * and omits the flag when set to 0 ("Auto").
 */

const assert = require('assert');
const ffmpegService = require('../src/main/services/ffmpeg');
const settingsService = require('../src/main/services/settings');

console.log('--- Testing Item 8: Central FFmpeg Command Builder (-threads N) ---');

// Test 1: Auto (0) => -threads flag is omitted
settingsService.update({ system: { ffmpegThreads: 0 } });
const autoArgs = ffmpegService.buildFfmpegArgs(['-i', 'input.mp4', 'output.mp4']);
assert.deepStrictEqual(autoArgs, ['-i', 'input.mp4', 'output.mp4']);
assert.strictEqual(autoArgs.includes('-threads'), false, 'Should omit -threads flag when ffmpegThreads is 0 ("Auto")');
console.log('✓ Setting ffmpegThreads = 0 (Auto) omits -threads flag');

// Test 2: 2 threads => -threads 2 prepended
settingsService.update({ system: { ffmpegThreads: 2 } });
const twoThreadsArgs = ffmpegService.buildFfmpegArgs(['-i', 'input.mp4', 'output.mp4']);
assert.deepStrictEqual(twoThreadsArgs, ['-threads', '2', '-i', 'input.mp4', 'output.mp4']);
assert.strictEqual(twoThreadsArgs.includes('-threads'), true);
console.log('✓ Setting ffmpegThreads = 2 prepends ["-threads", "2"]');

// Test 3: 4 threads => -threads 4 prepended
settingsService.update({ system: { ffmpegThreads: 4 } });
const fourThreadsArgs = ffmpegService.buildFfmpegArgs(['-y', '-i', 'sample.wav', 'out.wav']);
assert.deepStrictEqual(fourThreadsArgs, ['-threads', '4', '-y', '-i', 'sample.wav', 'out.wav']);
console.log('✓ Setting ffmpegThreads = 4 prepends ["-threads", "4"]');

// Test 4: 8 threads => -threads 8 prepended
settingsService.update({ system: { ffmpegThreads: 8 } });
const eightThreadsArgs = ffmpegService.buildFfmpegArgs(['-vn', '-ac', '2', 'out.wav']);
assert.deepStrictEqual(eightThreadsArgs, ['-threads', '8', '-vn', '-ac', '2', 'out.wav']);
console.log('✓ Setting ffmpegThreads = 8 prepends ["-threads", "8"]');

// Test 5: Does not duplicate -threads if already present
const alreadyHasThreads = ffmpegService.buildFfmpegArgs(['-threads', '4', '-i', 'input.mp4']);
assert.strictEqual(alreadyHasThreads.filter(a => a === '-threads').length, 1);
console.log('✓ Does not duplicate -threads if already present');

// Test 6: Verify audio-mixer, export, intro-outro, and mock separation use buildFfmpegArgs
const fs = require('fs');
const filesToCheck = [
  '../src/main/services/export/index.js',
  '../src/main/services/export/intro-outro.js',
  '../src/main/services/mixing/audio-mixer.js',
  '../src/main/services/providers/separation/mock.js'
];

for (const rel of filesToCheck) {
  const content = fs.readFileSync(require.resolve(rel), 'utf8');
  assert(content.includes('buildFfmpegArgs'), `${rel} must route arguments through buildFfmpegArgs`);
}
console.log('✓ All FFmpeg client services route arguments through buildFfmpegArgs');

// Reset to auto
settingsService.update({ system: { ffmpegThreads: 0 } });
console.log('✅ Item 8 PASSED: Central FFmpeg command builder verified.\n');
