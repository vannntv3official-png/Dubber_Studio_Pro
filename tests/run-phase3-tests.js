/**
 * Phase 3 Test Runner
 * Executes all Phase 3 automated verification tests:
 * 1. test-item11-item12-cleanup-mock-devmode.js (Toolbar stubs, Check updates hidden, Dev mode mock providers, Pronunciation rules)
 * 2. test-item13-real-profile-copy.js (Startup verification on copy of user's real app-data profile)
 */

const { execFileSync } = require('child_process');
const path = require('path');

const TESTS = [
  { name: 'Items 11 & 12: UI Cleanup, Mock Providers & Pronunciation Rules', script: 'tests/test-item11-item12-cleanup-mock-devmode.js' },
  { name: 'Item 13: Real Profile Copy Clean Startup & Zero Demo Data', script: 'tests/test-item13-real-profile-copy.js' },
  { name: 'Item 14: Audio Mute Synchronization & Playback', script: 'tests/test-item14-audio-mute.js' }
];

console.log('=================================================================');
console.log('         RUNNING PHASE 3 VERIFICATION TEST SUITE                 ');
console.log('=================================================================\n');

let passed = 0;
let failed = 0;
const results = [];

for (const test of TESTS) {
  process.stdout.write(`► Running ${test.name} (${test.script})...\n`);
  const startTime = Date.now();
  try {
    const output = execFileSync(process.execPath, [path.join(__dirname, '..', test.script)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ PASSED (${elapsed}s)`);
    passed++;
    results.push({ name: test.name, status: 'PASSED', elapsed, output });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`  ✗ FAILED (${elapsed}s):`);
    console.error(err.stdout || err.message);
    if (err.stderr) console.error(err.stderr);
    failed++;
    results.push({ name: test.name, status: 'FAILED', elapsed, error: err.message });
  }
  console.log('-----------------------------------------------------------------');
}

console.log(`\n=================================================================`);
console.log(`Phase 3 Test Summary: ${passed} PASSED, ${failed} FAILED (Total: ${TESTS.length})`);
console.log(`=================================================================\n`);

if (failed > 0) {
  process.exit(1);
}
