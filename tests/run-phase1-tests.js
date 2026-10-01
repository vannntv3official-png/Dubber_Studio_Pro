/**
 * Phase 1 Test Runner
 * Executes all Phase 1 automated tests:
 * 1. test-item1-total-duration.js (ReferenceError fix, 0-3s unclamped row, disabled controls)
 * 2. test-item2-separation-mock.js (BGM stem & waveform peaks, shared IPC contract, error messages)
 * 3. test-item3-dom-selectors.js (Static DOM ID selector validation against index.html)
 * 4. test-item3b-export-duration.js (10s fixture export duration, speech windows, A/V drift, BGM ducking)
 */

const { execFileSync } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const TESTS = [
  { name: 'Item 1: TOTAL_DURATION & startup controls', script: 'tests/test-item1-total-duration.js', runner: 'electron' },
  { name: 'Item 2: Isolate BGM & waveform peaks integration', script: 'tests/test-item2-separation-mock.js', runner: 'node' },
  { name: 'Item 3: DOM Selectors & ID references static test', script: 'tests/test-item3-dom-selectors.js', runner: 'node' },
  { name: 'Item 3b: Export duration, speech windows & A/V sync', script: 'tests/test-item3b-export-duration.js', runner: 'node' }
];

console.log('=================================================================');
console.log('         RUNNING PHASE 1 VERIFICATION TEST SUITE                 ');
console.log('=================================================================\n');

let passed = 0;
let failed = 0;
const results = [];

for (const test of TESTS) {
  process.stdout.write(`► Running ${test.name} (${test.script})...\n`);
  const startTime = Date.now();
  const execBin = test.runner === 'electron' ? electronPath : process.execPath;
  try {
    const output = execFileSync(execBin, [path.join(__dirname, '..', test.script)], {
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
console.log(`Phase 1 Test Summary: ${passed} PASSED, ${failed} FAILED (Total: ${TESTS.length})`);
console.log(`=================================================================\n`);

if (failed > 0) {
  process.exit(1);
}
