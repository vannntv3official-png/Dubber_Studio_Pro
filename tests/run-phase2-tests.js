/**
 * Phase 2 Test Runner
 * Executes all Phase 2 automated tests:
 * 1. test-item4-theme-startup.js (Theme applied before first paint)
 * 2. test-item5-autosave.js (Autosave interval, disable, restart)
 * 3. test-item6-project-folder.js (Default project folder, sanitize, fallback, numeric suffix)
 * 4. test-item7-confirm-delete.js (Confirm before delete & Undo toast)
 * 5. test-item8-ffmpeg-threads.js (Central FFmpeg command builder & threads flag)
 * 6. test-item9-timeline-sliders.js (Volume live gain & Pitch export notice)
 * 7. test-item10-settings-keys.js (Static analysis of all settings.json keys read in code)
 */

const { execFileSync } = require('child_process');
const path = require('path');

const TESTS = [
  { name: 'Item 4: Early theme application before first paint', script: 'tests/test-item4-theme-startup.js' },
  { name: 'Item 5: Autosave interval, disable, and restart loop', script: 'tests/test-item5-autosave.js' },
  { name: 'Item 6: Default project folder, sanitize, fallback, suffix', script: 'tests/test-item6-project-folder.js' },
  { name: 'Item 7: Confirm before delete & Undo safety net', script: 'tests/test-item7-confirm-delete.js' },
  { name: 'Item 8: Central FFmpeg command builder (-threads N)', script: 'tests/test-item8-ffmpeg-threads.js' },
  { name: 'Item 9: Timeline volume live gain & pitch export notice', script: 'tests/test-item9-timeline-sliders.js' },
  { name: 'Item 10: Settings keys static usage coverage', script: 'tests/test-item10-settings-keys.js' }
];

console.log('=================================================================');
console.log('         RUNNING PHASE 2 VERIFICATION TEST SUITE                 ');
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
console.log(`Phase 2 Test Summary: ${passed} PASSED, ${failed} FAILED (Total: ${TESTS.length})`);
console.log(`=================================================================\n`);

if (failed > 0) {
  process.exit(1);
}
