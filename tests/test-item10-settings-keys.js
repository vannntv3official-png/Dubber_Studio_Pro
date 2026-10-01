/**
 * Static Analysis Test: Settings Keys Coverage
 * Asserts that EVERY key saved in settings.json / DEFAULT_SETTINGS is read
 * by at least one place in application code (src/main, src/preload, or src/renderer).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Load DEFAULT_SETTINGS from settings service
const settingsService = require('../src/main/services/settings');
const defaultSettings = settingsService.getDefaults ? settingsService.getDefaults() : settingsService.settings;

// 2. Gather all source files in src/
function getAllSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllSourceFiles(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
      // Exclude settings service definition itself to ensure consumers read it
      if (entry.name !== 'settings.js') {
        files.push({
          path: fullPath,
          relPath: path.relative(path.join(__dirname, '..'), fullPath),
          content: fs.readFileSync(fullPath, 'utf8')
        });
      }
    }
  }
  return files;
}

const srcDir = path.join(__dirname, '../src');
const sourceFiles = getAllSourceFiles(srcDir);

// 3. Extract all leaf keys from settings schema
function extractKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...extractKeys(v, fullPath));
    } else {
      keys.push({ key: k, path: fullPath, sampleVal: v });
    }
  }
  return keys;
}

const allKeys = extractKeys(defaultSettings);

console.log(`Analyzing ${allKeys.length} settings keys across ${sourceFiles.length} source files...`);

const results = [];
let missingCount = 0;

for (const item of allKeys) {
  const { key, path: keyPath } = item;

  // Search patterns:
  // e.g. .ffmpegThreads, ['ffmpegThreads'], ["ffmpegThreads"], ffmpegThreads
  // or path segments: general.defaultProjectFolder
  const patterns = [
    new RegExp(`\\b${key}\\b`),
    new RegExp(`['"]${key}['"]`),
    new RegExp(`\\.${key}\\b`)
  ];

  const matchedFiles = [];
  for (const file of sourceFiles) {
    if (patterns.some(p => p.test(file.content))) {
      matchedFiles.push(file.relPath);
    }
  }

  const isRead = matchedFiles.length > 0;
  if (!isRead) {
    missingCount++;
    console.error(`❌ UNREAD SETTING KEY: "${keyPath}" (${key}) is never read in application code!`);
  } else {
    results.push({ keyPath, references: matchedFiles.length, files: matchedFiles.slice(0, 3) });
  }
}

console.log(`\nCoverage Summary: ${results.length}/${allKeys.length} keys verified as actively read.`);
if (missingCount > 0) {
  console.error(`FAILED: ${missingCount} setting keys are ignored by the codebase!`);
  process.exit(1);
} else {
  console.log(`✅ PASSED: 100% of keys saved in settings.json are actively read and utilized in the code.`);
}
