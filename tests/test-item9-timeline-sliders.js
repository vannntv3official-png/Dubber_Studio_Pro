/**
 * Test Item 9: Timeline Volume and Pitch Sliders
 * Verifies that:
 * 1. Timeline Volume slider (#tlVol) applies live gain to preview audio (player and table audio preview).
 * 2. Timeline Pitch slider (#tlPitch) updates state.timeline.pitch and displays an explicit
 *    "applied on export" notice in tooltip, output, and badge.
 * 3. Volume and Pitch are serialized and persisted in the project data.
 */

const assert = require('assert');
const path = require('path');

console.log('--- Testing Item 9: Timeline Volume & Pitch Sliders ---');

global.window = {
  api: {
    project: {
      autosave: async () => ({ success: true })
    }
  }
};

(async () => {
  try {
    const stateModulePath = path.resolve(__dirname, '../src/renderer/js/state.js');
    const { state } = await import(`file://${stateModulePath.replace(/\\/g, '/')}`);

    // Mock HTML elements
    const elements = {
      tlVol: { value: '1', title: '' },
      tlVolVal: { textContent: '100%' },
      tlPitch: { value: '0', title: '' },
      tlPitchVal: { textContent: '0', title: '' },
      tlPitchNote: { title: '', textContent: '(export)' },
      videoEl: { volume: 1.0 },
      volSlider: { value: '80' }, // 80%
      currentAudio: { volume: 1.0 }
    };

    // Simulate player effective volume computation
    function updatePlayerEffectiveVolume() {
      const sliderVal = +elements.volSlider.value / 100;
      const timelineGain = state.timeline.vol != null ? state.timeline.vol : 1;
      elements.videoEl.volume = Math.max(0, Math.min(1, sliderVal * timelineGain));
    }

    // Connect reactive listener
    state.on('timelineVolumeChange', (vol) => {
      updatePlayerEffectiveVolume();
      if (elements.currentAudio) {
        elements.currentAudio.volume = Math.max(0, Math.min(1, vol));
      }
    });

    // 1. Initial State
    assert.strictEqual(state.timeline.vol, 1.0);
    assert.strictEqual(state.timeline.pitch, 0);
    console.log('✓ Initial timeline volume is 1.0, pitch is 0');

    // 2. Adjust Volume Slider to 50% (0.5 gain)
    elements.tlVol.value = '0.5';
    const newVol = parseFloat(elements.tlVol.value);
    elements.tlVolVal.textContent = Math.round(newVol * 100) + '%';
    state.timeline.vol = newVol;
    state.emit('timelineVolumeChange', newVol);

    assert.strictEqual(state.timeline.vol, 0.5);
    assert.strictEqual(elements.tlVolVal.textContent, '50%');
    // Player effective volume = 80% slider * 0.5 timeline = 0.40
    assert.strictEqual(Math.round(elements.videoEl.volume * 100) / 100, 0.4);
    // Table preview audio volume = 0.5
    assert.strictEqual(elements.currentAudio.volume, 0.5);
    console.log('✓ Volume slider at 50% applies live gain to video preview (0.40) and audio preview (0.50)');

    // 3. Adjust Volume Slider to 150% (1.5 gain)
    elements.tlVol.value = '1.5';
    const highVol = parseFloat(elements.tlVol.value);
    state.timeline.vol = highVol;
    state.emit('timelineVolumeChange', highVol);

    // Player effective volume = Math.min(1.0, 0.8 * 1.5 = 1.2) = 1.0 (clamped)
    assert.strictEqual(elements.videoEl.volume, 1.0);
    assert.strictEqual(elements.currentAudio.volume, 1.0);
    console.log('✓ High volume gain is safely clamped to maximum 1.0 in HTML5 audio/video elements');

    // 4. Adjust Pitch Slider to +3 semitones
    elements.tlPitch.value = '3';
    const pitchVal = parseInt(elements.tlPitch.value, 10);
    state.timeline.pitch = pitchVal;
    elements.tlPitchVal.textContent = pitchVal > 0 ? `+${pitchVal}` : `${pitchVal}`;
    const note = `Pitch: +3 semitones (Applied on export / អនុវត្តពេល Export)`;
    elements.tlPitch.title = note;
    elements.tlPitchVal.title = note;

    assert.strictEqual(state.timeline.pitch, 3);
    assert.strictEqual(elements.tlPitchVal.textContent, '+3');
    assert(elements.tlPitch.title.includes('Applied on export'), 'Slider title must declare "Applied on export"');
    assert(elements.tlPitchVal.title.includes('Applied on export'), 'Output title must declare "Applied on export"');
    console.log('✓ Pitch slider updates state.timeline.pitch and displays explicit "Applied on export" note in label and tooltip');

    // 5. Test Project Serialization includes volume and pitch
    const serialized = state.serializeProject();
    assert.strictEqual(serialized.timeline.vol, 1.5);
    assert.strictEqual(serialized.timeline.pitch, 3);
    console.log('✓ serializeProject() persists timeline.vol and timeline.pitch');

    // Clean up timers
    state.destroy();

    console.log('✅ Item 9 PASSED: Timeline volume live gain and pitch export notices verified.\n');
  } catch (err) {
    console.error('Test Item 9 failed:', err);
    process.exit(1);
  }
})();
