/**
 * Static Analysis Test for Item 3:
 * Verifies that every `getElementById` and `querySelector('#...')`
 * called across renderer code references an element ID that actually exists
 * in index.html or in a declared UI template component.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '../src/renderer/index.html');
const RENDERER_JS_DIR = path.join(__dirname, '../src/renderer/js');

function run() {
  console.log('=== Test Item 3: Renderer DOM Selectors Static Validation ===');

  assert(fs.existsSync(HTML_PATH), 'index.html must exist');
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  // 1. Collect all static IDs from index.html
  const idRegex = /\bid\s*=\s*["']([a-zA-Z0-9_\-]+)["']/g;
  const knownIds = new Set();
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    knownIds.add(match[1]);
  }
  const staticCount = knownIds.size;
  console.log(`[1/3] Indexed ${staticCount} unique element IDs from index.html`);

  // 2. Scan renderer JS files for template-rendered element IDs (e.g. innerHTML templates)
  const jsFiles = fs.readdirSync(RENDERER_JS_DIR).filter(f => f.endsWith('.js'));
  const templateIdRegex = /\bid\s*=\s*["']([a-zA-Z0-9_\-]+)["']|\bid\s*=\s*"\$\{([a-zA-Z0-9_.]+)\}"/g;
  for (const file of jsFiles) {
    const code = fs.readFileSync(path.join(RENDERER_JS_DIR, file), 'utf8');
    while ((match = templateIdRegex.exec(code)) !== null) {
      if (match[1]) {
        knownIds.add(match[1]);
      }
    }
  }

  // Also include dynamic track mute IDs declared in timeline tracks definition
  const knownDynamicIds = ['tlMuteOrig', 'tlMuteA1', 'tlMuteBgm'];
  knownDynamicIds.forEach(id => knownIds.add(id));

  console.log(`[2/3] Total valid DOM IDs (static + template): ${knownIds.size}`);

  // 3. Scan all getElementById and querySelector(#id) calls
  const missingQueries = [];
  let totalChecked = 0;

  for (const file of jsFiles) {
    const filePath = path.join(RENDERER_JS_DIR, file);
    const code = fs.readFileSync(filePath, 'utf8');

    // Match getElementById('...')
    const getElemRegex = /getElementById\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    while ((match = getElemRegex.exec(code)) !== null) {
      const id = match[1];
      totalChecked++;
      if (!knownIds.has(id)) {
        missingQueries.push({ file, type: 'getElementById', target: id });
      }
    }

    // Match querySelector('#...')
    const queryIdRegex = /querySelector(?:All)?\(\s*['"]#([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    while ((match = queryIdRegex.exec(code)) !== null) {
      const id = match[1];
      totalChecked++;
      if (!knownIds.has(id)) {
        missingQueries.push({ file, type: 'querySelector(#)', target: id });
      }
    }
  }

  console.log(`[3/3] Validated ${totalChecked} DOM ID selector references.`);

  // 4. Assert non-existent ID fails the test
  // Intentionally verify failure behavior on bad ID
  assert.strictEqual(knownIds.has('openSrt'), false, 'openSrt must not exist in known IDs');
  assert.strictEqual(knownIds.has('exportBtn'), false, 'exportBtn must not exist in known IDs');
  assert.strictEqual(knownIds.has('openVideo'), false, 'openVideo must not exist in known IDs');

  if (missingQueries.length > 0) {
    console.error('\nFound dangling DOM references:');
    for (const m of missingQueries) {
      console.error(`  - [${m.file}] ${m.type}("${m.target}") does not exist in index.html or templates!`);
    }
    assert.fail(`Static test failed: ${missingQueries.length} DOM selectors reference non-existent elements.`);
  }

  console.log('✓ Zero dangling getElementById or querySelector(#id) references found!');
  console.log('=== ALL ITEM 3 DOM SELECTOR TESTS PASSED ===');
}

run();
