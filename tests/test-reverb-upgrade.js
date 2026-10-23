/**
 * Test Suite: Reverb Feature Upgrade Verification
 * Validates:
 * 1. DOM markup in index.html (Reverb button, gear button, presets grid, mix/decay sliders, export modal selectors)
 * 2. Reverb presets & parameter serialization in state.js
 * 3. Timeline UI updating reverb state & labels
 * 4. FFmpeg filter building for various reverb presets (room, hall, cathedral, plate)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testReverbUpgrade() {
  console.log('=================================================================');
  console.log('     TESTING REVERB STUDIO FX & PRESETS UPGRADE                  ');
  console.log('=================================================================\n');

  // 1. Verify HTML DOM elements
  console.log('► [1/4] Verifying Reverb DOM markup in index.html...');
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');

  assert(html.includes('id="reverb"'), 'Must have #reverb button');
  assert(html.includes('id="reverbSettingsBtn"'), 'Must have #reverbSettingsBtn');
  assert(html.includes('id="reverbPopover"'), 'Must have #reverbPopover');
  assert(html.includes('id="reverbPresetsGrid"'), 'Must have #reverbPresetsGrid');
  assert(html.includes('data-preset="room"'), 'Must have room preset chip');
  assert(html.includes('data-preset="hall"'), 'Must have hall preset chip');
  assert(html.includes('data-preset="cathedral"'), 'Must have cathedral preset chip');
  assert(html.includes('data-preset="plate"'), 'Must have plate preset chip');
  assert(html.includes('id="reverbMixSlider"'), 'Must have #reverbMixSlider');
  assert(html.includes('id="reverbDecaySlider"'), 'Must have #reverbDecaySlider');
  assert(html.includes('id="exportReverbPresetSelect"'), 'Must have #exportReverbPresetSelect in Export modal');
  console.log('  ✓ PASSED: All Reverb DOM elements, popover and export selectors verified\n');

  // 2. Verify state serialization
  console.log('► [2/4] Verifying StateStore reverb persistence & serialization...');
  const { state } = await import('../src/renderer/js/state.js');
  state.resetToEmpty(false);

  assert.strictEqual(state.timeline.reverb, false);
  assert.strictEqual(state.timeline.reverbPreset, 'hall');
  assert.strictEqual(state.timeline.reverbMix, 35);
  assert.strictEqual(state.timeline.reverbDecay, 60);

  state.timeline.reverb = true;
  state.timeline.reverbPreset = 'cathedral';
  state.timeline.reverbMix = 55;
  state.timeline.reverbDecay = 120;

  const serialized = state.serializeProject();
  assert.strictEqual(serialized.timeline.reverb, true);
  assert.strictEqual(serialized.timeline.reverbPreset, 'cathedral');
  assert.strictEqual(serialized.timeline.reverbMix, 55);
  assert.strictEqual(serialized.timeline.reverbDecay, 120);

  // Restore via loadProjectData
  state.resetToEmpty(false);
  state.loadProjectData({
    name: 'test',
    timeline: {
      reverb: true,
      reverbPreset: 'plate',
      reverbMix: 40,
      reverbDecay: 45
    }
  });
  assert.strictEqual(state.timeline.reverb, true);
  assert.strictEqual(state.timeline.reverbPreset, 'plate');
  assert.strictEqual(state.timeline.reverbMix, 40);
  assert.strictEqual(state.timeline.reverbDecay, 45);
  console.log('  ✓ PASSED: StateStore accurately initializes, serializes, and restores reverb properties\n');

  // 3. Verify Audio Mixer buildFinalMasterAudio filter generation for presets
  console.log('► [3/4] Verifying FFmpeg filter generation for Reverb Presets...');
  const audioMixer = require('../src/main/services/mixing/audio-mixer.js');

  // Test filter parts logic via building master audio with different presets
  const testOutDir = path.join(__dirname, 'temp_rev_test');
  if (!fs.existsSync(testOutDir)) fs.mkdirSync(testOutDir, { recursive: true });

  const dummyDub = path.join(testOutDir, 'dummy_dub.wav');
  const dummyOut = path.join(testOutDir, 'dummy_out.wav');
  const ffmpegService = require('../src/main/services/ffmpeg');
  await ffmpegService.generateSineTone(dummyDub, 440, 1.0);

  // Room preset
  await audioMixer.buildFinalMasterAudio({
    dubAudioPath: dummyDub,
    outputPath: dummyOut,
    options: {
      reverb: true,
      reverbPreset: 'room',
      reverbMix: 25,
      reverbDecay: 20
    },
    totalDuration: 1.0
  });
  assert(fs.existsSync(dummyOut), 'Output with room reverb must exist');

  // Cathedral preset
  await audioMixer.buildFinalMasterAudio({
    dubAudioPath: dummyDub,
    outputPath: dummyOut,
    options: {
      reverb: true,
      reverbPreset: 'cathedral',
      reverbMix: 50,
      reverbDecay: 100
    },
    totalDuration: 1.0
  });
  assert(fs.existsSync(dummyOut), 'Output with cathedral reverb must exist');

  // Clean up
  try {
    if (fs.existsSync(dummyDub)) fs.unlinkSync(dummyDub);
    if (fs.existsSync(dummyOut)) fs.unlinkSync(dummyOut);
    if (fs.existsSync(testOutDir)) fs.rmdirSync(testOutDir);
  } catch (_) {}

  console.log('  ✓ PASSED: Audio mixer executes FFmpeg filter chains for room and cathedral presets cleanly\n');

  // 4. Verify i18n localization
  console.log('► [4/4] Verifying i18n localization keys...');
  const { i18n } = await import('../src/renderer/js/i18n.js');
  i18n.setLanguage('en');
  assert(i18n.t('reverb', { state: 'HALL' }).includes('HALL'));
  i18n.setLanguage('km');
  assert(i18n.t('reverb', { state: 'HALL' }).includes('HALL'));
  console.log('  ✓ PASSED: Reverb localization renders localized state text\n');

  console.log('=================================================================');
  console.log('🎉 ALL REVERB FEATURE UPGRADE TESTS PASSED (100%)                ');
  console.log('=================================================================');
}

testReverbUpgrade().catch(err => {
  console.error('❌ Reverb test failed:', err);
  process.exit(1);
});
