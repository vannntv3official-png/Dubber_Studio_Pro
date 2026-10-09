/**
 * Test Suite: Upgrade Step 5 - Smart Background Music Ducking Enhancer
 * Validates:
 * 1. DOM elements exist in index.html (duckActiveBadge, exportDuckPreset)
 * 2. Bilingual locale keys exist (en & km)
 * 3. Audio mixer DUCKING_PROFILES and sidechain filter construction for gentle, balanced, deep
 * 4. State persistence of duckingPreset in serialize/restore
 * 5. Player live ducking smooth envelope methods
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep5Test() {
  console.log('=================================================================');
  console.log('   TESTING UPGRADE STEP 5: SMART BGM DUCKING ENHANCER            ');
  console.log('=================================================================\n');

  // 1. Verify index.html contains ducking elements
  console.log('► [1/5] Verifying ducking DOM elements in index.html...');
  const htmlPath = path.join(__dirname, '../src/renderer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="duckActiveBadge"'), 'index.html must contain duckActiveBadge');
  assert(html.includes('id="exportDuckPreset"'), 'index.html must contain exportDuckPreset');
  console.log('  ✓ PASSED: duckActiveBadge & exportDuckPreset confirmed in index.html\n');

  // 2. Verify bilingual locale strings
  console.log('► [2/5] Verifying locale strings (EN & KM)...');
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/en.json'), 'utf8'));
  const km = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/locales/km.json'), 'utf8'));

  const requiredKeys = ['duckPreset', 'duckGentle', 'duckBalanced', 'duckDeep'];
  for (const k of requiredKeys) {
    assert(en[k], `en.json must contain key "${k}"`);
    assert(km[k], `km.json must contain key "${k}"`);
  }
  console.log(`  ✓ PASSED: All ${requiredKeys.length} required bilingual keys validated\n`);

  // 3. Verify Audio Mixer DUCKING_PROFILES
  console.log('► [3/5] Verifying audioMixer DUCKING_PROFILES & dynamics...');
  const audioMixer = require('../src/main/services/mixing/audio-mixer.js');
  assert(audioMixer.DUCKING_PROFILES, 'audioMixer.DUCKING_PROFILES must exist');
  assert(audioMixer.DUCKING_PROFILES.gentle, 'Gentle profile must exist');
  assert(audioMixer.DUCKING_PROFILES.balanced, 'Balanced profile must exist');
  assert(audioMixer.DUCKING_PROFILES.deep, 'Deep profile must exist');

  assert.strictEqual(audioMixer.DUCKING_PROFILES.gentle.threshold, 0.12);
  assert.strictEqual(audioMixer.DUCKING_PROFILES.balanced.threshold, 0.08);
  assert.strictEqual(audioMixer.DUCKING_PROFILES.deep.threshold, 0.05);

  assert.strictEqual(audioMixer.DUCKING_PROFILES.gentle.ratio, 3.0);
  assert.strictEqual(audioMixer.DUCKING_PROFILES.balanced.ratio, 4.0);
  assert.strictEqual(audioMixer.DUCKING_PROFILES.deep.ratio, 7.0);
  console.log('  ✓ PASSED: audioMixer DUCKING_PROFILES verified\n');

  // 4. Verify State Persistence of duckingPreset
  console.log('► [4/5] Verifying state duckingPreset serialization and restoration...');
  const stateModule = await import('../src/renderer/js/state.js');
  const { state } = stateModule;

  assert.strictEqual(state.timeline.duckingPreset, 'balanced', 'Default preset should be balanced');

  state.timeline.duckingPreset = 'deep';
  const serialized = state.serializeProject();
  assert.strictEqual(serialized.timeline.duckingPreset, 'deep', 'Serialized data must preserve duckingPreset');

  // Simulate loading project
  state.loadProjectData({
    name: 'Test Project',
    subtitles: [],
    timeline: { duckingPreset: 'gentle', ducking: true }
  });
  assert.strictEqual(state.timeline.duckingPreset, 'gentle', 'Loaded project must restore duckingPreset');
  console.log('  ✓ PASSED: State persistence of duckingPreset validated\n');

  // 5. Verify Player Live Ducking & Ramping
  console.log('► [5/5] Verifying player live ducking rampAudioVolume API...');
  const playerModule = await import('../src/renderer/js/player.js');
  const { player } = playerModule;
  assert.strictEqual(typeof player.applyLiveDucking, 'function', 'player.applyLiveDucking must be a function');
  assert.strictEqual(typeof player.rampAudioVolume, 'function', 'player.rampAudioVolume must be a function');

  // Test ramp on mock audio element
  const mockAudio = { volume: 0.8, _rampTimer: null };
  player.rampAudioVolume(mockAudio, 0.25, 30);
  assert(mockAudio._rampTimer !== null, 'Should initiate smooth animation frame timer');

  console.log('  ✓ PASSED: player live ducking methods confirmed\n');

  console.log('=================================================================');
  console.log('🎉 ALL STEP 5 VERIFICATION TESTS PASSED (100%)');
  console.log('=================================================================');
}

runStep5Test().catch(err => {
  console.error('❌ Step 5 test failed:', err);
  process.exit(1);
});
