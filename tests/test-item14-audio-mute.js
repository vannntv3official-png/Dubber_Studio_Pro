/**
 * Test Item 14: Audio Mute Synchronization & Playback Verification
 * Verifies that:
 * 1. Initial mute state is false.
 * 2. state.setMuted() and state.toggleMuted() update state and emit 'muteChange'.
 * 3. player.videoEl.muted and volume are muted (0) when muted, and restored on unmute.
 * 4. player.video getter works properly as an alias to player.videoEl.
 * 5. updateMuteUI synchronizes both #mute and #tlMuteOrig without double-toggle conflicts.
 * 6. loadVideo preserves and applies current mute state immediately.
 */

const assert = require('assert');
const path = require('path');

console.log('--- Testing Item 14: Audio Mute Synchronization & Playback ---');

// Mock DOM elements
const mockMuteBtn = {
  classList: new Set(),
  attributes: {},
  querySelector(selector) {
    if (selector === '.tool-icon') return this.iconSpan;
    if (selector === '.tool-label') return this.labelSpan;
    return null;
  },
  setAttribute(k, v) { this.attributes[k] = v; },
  iconSpan: { innerHTML: '' },
  labelSpan: { textContent: '' },
  title: ''
};
mockMuteBtn.classList.toggle = function(cls, force) {
  if (force === undefined) {
    if (this.has(cls)) this.delete(cls); else this.add(cls);
  } else if (force) {
    this.add(cls);
  } else {
    this.delete(cls);
  }
};

const mockTlMuteOrig = {
  classList: new Set(),
  attributes: {},
  setAttribute(k, v) { this.attributes[k] = v; }
};
mockTlMuteOrig.classList.toggle = function(cls, force) {
  if (force === undefined) {
    if (this.has(cls)) this.delete(cls); else this.add(cls);
  } else if (force) {
    this.add(cls);
  } else {
    this.delete(cls);
  }
};

const mockVideoEl = {
  muted: false,
  volume: 1.0,
  src: '',
  load() {},
  pause() {},
  play() { return Promise.resolve(); },
  removeAttribute() {}
};

const mockVolSlider = { value: '80' };

global.document = {
  getElementById(id) {
    if (id === 'mute') return mockMuteBtn;
    if (id === 'tlMuteOrig') return mockTlMuteOrig;
    if (id === 'videoEl') return mockVideoEl;
    if (id === 'volSlider') return mockVolSlider;
    return null;
  },
  querySelector(selector) {
    if (selector === '#mute') return mockMuteBtn;
    if (selector === '#tlMuteOrig') return mockTlMuteOrig;
    return null;
  },
  addEventListener() {}
};

global.window = {
  api: {
    project: {
      autosave: async () => ({ success: true })
    }
  },
  addEventListener() {}
};

(async () => {
  try {
    const stateModulePath = path.resolve(__dirname, '../src/renderer/js/state.js');
    const { state } = await import(`file://${stateModulePath.replace(/\\/g, '/')}`);

    const playerModulePath = path.resolve(__dirname, '../src/renderer/js/player.js');
    const { player } = await import(`file://${playerModulePath.replace(/\\/g, '/')}`);

    const appModulePath = path.resolve(__dirname, '../src/renderer/js/app.js');
    const { App } = await import(`file://${appModulePath.replace(/\\/g, '/')}`);
    const app = new App();

    // 1. Initial State
    state.resetToEmpty(false);
    assert.strictEqual(state.timeline.muted, false, 'Initial state.timeline.muted must be false');
    console.log('✓ Initial timeline.muted is false');

    // 2. Wire player mock
    player.videoEl = mockVideoEl;
    player.volumeSlider = mockVolSlider;
    assert.strictEqual(player.video, mockVideoEl, 'player.video getter must resolve to player.videoEl');
    console.log('✓ player.video getter backward compatibility confirmed');

    // 3. Test player volume calculation when unmuted
    player.updateEffectiveVolume();
    assert.strictEqual(mockVideoEl.muted, false, 'videoEl must not be muted');
    assert.strictEqual(mockVideoEl.volume, 0.8, 'videoEl volume must be 80% (0.8)');
    console.log('✓ Normal unmuted playback has correct volume (0.8)');

    // 4. Test state.setMuted(true) and muteChange event
    let eventMuted = null;
    state.on('muteChange', (val) => { eventMuted = val; });

    state.setMuted(true);
    assert.strictEqual(state.timeline.muted, true, 'state.timeline.muted must be true');
    assert.strictEqual(eventMuted, true, 'muteChange event must fire with true');

    // Sync player
    player.syncMute();
    assert.strictEqual(mockVideoEl.muted, true, 'videoEl.muted must be true');
    assert.strictEqual(mockVideoEl.volume, 0, 'videoEl.volume must be 0 when muted');
    console.log('✓ Muting sets videoEl.muted=true and videoEl.volume=0');

    // 5. Test updateMuteUI synchronization
    app.updateMuteUI();
    assert(mockMuteBtn.classList.has('on'), '#mute must have .on class');
    assert(mockMuteBtn.classList.has('muted-active'), '#mute must have .muted-active class');
    assert.strictEqual(mockMuteBtn.attributes['aria-pressed'], 'true', '#mute aria-pressed must be true');
    assert(mockTlMuteOrig.classList.has('on'), '#tlMuteOrig must have .on class');
    assert.strictEqual(mockTlMuteOrig.attributes['aria-pressed'], 'true', '#tlMuteOrig aria-pressed must be true');
    console.log('✓ UI elements (#mute & #tlMuteOrig) synchronized to muted state');

    // 6. Test state.toggleMuted() back to unmuted
    const unmutedRes = state.toggleMuted();
    assert.strictEqual(unmutedRes, false, 'toggleMuted() must return false');
    assert.strictEqual(state.timeline.muted, false, 'state.timeline.muted must be false');
    assert.strictEqual(eventMuted, false, 'muteChange event must fire with false');

    player.syncMute();
    assert.strictEqual(mockVideoEl.muted, false, 'videoEl.muted must be false');
    assert.strictEqual(mockVideoEl.volume, 0.8, 'videoEl.volume must be restored to 0.8');

    app.updateMuteUI();
    assert(!mockMuteBtn.classList.has('on'), '#mute must not have .on class');
    assert(!mockMuteBtn.classList.has('muted-active'), '#mute must not have .muted-active class');
    assert.strictEqual(mockMuteBtn.attributes['aria-pressed'], 'false', '#mute aria-pressed must be false');
    assert(!mockTlMuteOrig.classList.has('on'), '#tlMuteOrig must not have .on class');
    assert.strictEqual(mockTlMuteOrig.attributes['aria-pressed'], 'false', '#tlMuteOrig aria-pressed must be false');
    console.log('✓ Unmuting restores videoEl.volume and clears active UI classes');

    // 7. Test loadVideo preservation of muted state
    state.setMuted(true);
    player.loadVideo('C:/test/sample.mp4');
    assert.strictEqual(mockVideoEl.muted, true, 'videoEl.muted must remain true after loadVideo');
    assert.strictEqual(mockVideoEl.volume, 0, 'videoEl.volume must remain 0 after loadVideo');
    console.log('✓ loadVideo preserves muted state on new media load');

    console.log('\n=============================================');
    console.log('🎉 ALL AUDIO MUTE SYNCHRONIZATION TESTS PASSED');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Audio Mute Test Failed:', err);
    process.exit(1);
  }
})();
