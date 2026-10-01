/**
 * Test Item 5: Autosave Interval & Restart Behavior
 * Verifies that:
 * 1. state.initAutosaveLoop(intervalSec) schedules a recurring timer when intervalSec > 0.
 * 2. When intervalSec = 0 (disabled), existing timers are cleared and no autosave timer is scheduled.
 * 3. Changing the interval clears previous timers and restarts the loop with the new interval.
 * 4. triggerAutosave only saves when project is dirty, clears isDirty, and emits 'autosaved'.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('--- Testing Item 5: Autosave Interval & Restart Behavior ---');

// Mock ipcClient before importing state
global.window = {};
const mockIpcClient = {
  savedData: null,
  async autosaveProject(filePath, data) {
    this.savedData = { filePath, data, time: Date.now() };
    return { success: true };
  },
  async getSettings() {
    return { general: { autosaveIntervalSec: 30 } };
  }
};

// Mock browser globals for state.js in Node
global.window = {
  api: {
    project: {
      autosave: async (projectJsonPath, data) => {
        return { success: true };
      }
    }
  }
};

// Mock ipcClient import in state.js
const stateModulePath = path.resolve(__dirname, '../src/renderer/js/state.js');

// Dynamically patch require/import of ipcClient for Node test environment
(async () => {
  try {
    // Import state
    const { state } = await import(`file://${stateModulePath.replace(/\\/g, '/')}`);

    // Set up dummy project in state
    state.project = {
      name: 'Test Autosave Project',
      projectJsonPath: 'C:/fake/path/project.json',
      isDirty: true,
      duration: 10
    };

    // 1. Initial State: autosave timer exists with default 30
    assert.strictEqual(state.autosaveIntervalSec, 30);
    assert.notStrictEqual(state.autosaveTimer, null, 'Autosave timer should initially be scheduled');
    console.log('✓ Initial autosave interval is 30s with active timer');

    // 2. Disable autosave: interval = 0
    state.initAutosaveLoop(0);
    assert.strictEqual(state.autosaveIntervalSec, 0, 'autosaveIntervalSec should be 0');
    assert.strictEqual(state.autosaveTimer, null, 'Timer must be null when disabled (0s)');
    console.log('✓ Setting autosaveIntervalSec = 0 disables the timer (null timer)');

    // 3. Restart timer with new interval (e.g. 15s)
    const oldTimer = state.autosaveTimer;
    state.initAutosaveLoop(15);
    assert.strictEqual(state.autosaveIntervalSec, 15);
    assert.notStrictEqual(state.autosaveTimer, null);
    assert.notStrictEqual(state.autosaveTimer, oldTimer);
    console.log('✓ Setting autosaveIntervalSec = 15 restarts the timer with new interval');

    // 4. Restart again with 60s
    const prevTimer = state.autosaveTimer;
    state.initAutosaveLoop(60);
    assert.strictEqual(state.autosaveIntervalSec, 60);
    assert.notStrictEqual(state.autosaveTimer, prevTimer, 'Old timer must be cleared when setting changes');
    console.log('✓ Changing interval again clears previous timer and starts new timer');

    // 5. Trigger autosave test
    let autosavedEventFired = false;
    state.on('autosaved', () => {
      autosavedEventFired = true;
    });

    state.project.isDirty = true;
    await state.triggerAutosave();
    assert.strictEqual(state.project.isDirty, false, 'project.isDirty should be false after autosave');
    assert.strictEqual(autosavedEventFired, true, "'autosaved' event must be emitted");
    console.log('✓ triggerAutosave successfully resets isDirty to false and emits autosaved event');

    // 6. triggerAutosave does nothing when isDirty is false
    autosavedEventFired = false;
    await state.triggerAutosave();
    assert.strictEqual(autosavedEventFired, false, 'Should not autosave if project is not dirty');
    console.log('✓ triggerAutosave skips saving when isDirty is false');

    // Clean up timer
    state.initAutosaveLoop(0);

    console.log('✅ Item 5 PASSED: Autosave interval, disabled state, restart behavior verified.\n');
  } catch (err) {
    console.error('Test Item 5 failed:', err);
    process.exit(1);
  }
})();
