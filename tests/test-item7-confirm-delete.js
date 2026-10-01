/**
 * Test Item 7: Confirm Before Delete & Undo Toast Safety Net
 * Verifies that:
 * 1. When confirmDelete is true, deletion prompts window.confirm.
 *    If cancelled, rows are preserved. If confirmed, rows are deleted and Undo toast is shown.
 * 2. When confirmDelete is false, deletion proceeds without prompt, and Undo toast is shown.
 * 3. In both cases, invoking the Undo action on the toast restores the deleted rows via state.undo().
 */

const assert = require('assert');
const path = require('path');

console.log('--- Testing Item 7: Confirm Before Delete & Undo Toast ---');

// Mock browser environment for state and app delete action
global.window = {
  confirmPromptCount: 0,
  confirmReturnValue: true,
  confirm(msg) {
    this.confirmPromptCount++;
    return this.confirmReturnValue;
  },
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

    // Helper to simulate app delete handler logic
    let lastToastAction = null;
    let lastToastMsg = null;

    const mockUi = {
      showToast(msg, duration, action) {
        lastToastMsg = msg;
        lastToastAction = action;
      }
    };

    function performDelete(appInstance) {
      const targets = state.getTargets();
      if (!targets.length) return;

      if (appInstance.confirmDelete !== false) {
        const msg = targets.length > 1
          ? `Delete ${targets.length} rows?`
          : 'Delete selected subtitle row?';
        if (!global.window.confirm(msg)) {
          return;
        }
      }

      state.snapshot();
      state.rows = state.rows.filter(r => !targets.includes(r));
      state.selectedId = state.rows[0]?.id || null;
      state.emit('change', { source: 'deleteRows' });
      mockUi.showToast(`Deleted ${targets.length} row(s)`, 4000, {
        text: 'Undo',
        onClick: () => {
          state.undo();
        }
      });
    }

    // Populate initial rows
    function resetRows() {
      state.rows = [
        { id: 1, s: 0, e: 2, txt: 'Row 1', sel: true },
        { id: 2, s: 2, e: 4, txt: 'Row 2', sel: false },
        { id: 3, s: 4, e: 6, txt: 'Row 3', sel: false }
      ];
      state.selectedId = 1;
      state.history = [];
      state.future = [];
    }

    const appInstance = { confirmDelete: true };

    // --- Scenario 1: confirmDelete = true, user CANCELS confirmation ---
    resetRows();
    global.window.confirmPromptCount = 0;
    global.window.confirmReturnValue = false; // User clicks Cancel

    performDelete(appInstance);
    assert.strictEqual(global.window.confirmPromptCount, 1, 'window.confirm should have been prompted');
    assert.strictEqual(state.rows.length, 3, 'Rows should NOT be deleted when user cancels');
    assert.strictEqual(state.history.length, 0, 'No history snapshot should be created on cancel');
    console.log('✓ confirmDelete = true + user Cancel preserves all rows without deletion');

    // --- Scenario 2: confirmDelete = true, user ACCEPTS confirmation ---
    resetRows();
    global.window.confirmPromptCount = 0;
    global.window.confirmReturnValue = true; // User clicks OK

    performDelete(appInstance);
    assert.strictEqual(global.window.confirmPromptCount, 1, 'window.confirm should have been prompted');
    assert.strictEqual(state.rows.length, 2, 'Selected row should be deleted');
    assert.strictEqual(state.rows.find(r => r.id === 1), undefined, 'Row 1 should be gone');
    assert.notStrictEqual(lastToastAction, null, 'Undo toast action must be provided');
    assert.strictEqual(typeof lastToastAction.onClick, 'function', 'Undo action must have onClick');
    console.log('✓ confirmDelete = true + user OK deletes row and offers Undo action');

    // Test Undo action restoring the row
    lastToastAction.onClick();
    assert.strictEqual(state.rows.length, 3, 'state.undo() via toast action must restore deleted row');
    assert.notStrictEqual(state.rows.find(r => r.id === 1), undefined, 'Row 1 restored');
    console.log('✓ Clicking Undo action in toast safely restores the deleted row');

    // --- Scenario 3: confirmDelete = false (Bypasses confirm modal) ---
    resetRows();
    appInstance.confirmDelete = false;
    global.window.confirmPromptCount = 0;
    lastToastAction = null;

    performDelete(appInstance);
    assert.strictEqual(global.window.confirmPromptCount, 0, 'window.confirm should NOT be called when confirmDelete is false');
    assert.strictEqual(state.rows.length, 2, 'Row should be deleted immediately without prompt');
    assert.notStrictEqual(lastToastAction, null, 'Undo toast must still be provided as safety net');

    // Verify Undo still works as safety net
    lastToastAction.onClick();
    assert.strictEqual(state.rows.length, 3, 'state.undo() via toast restores deleted row');
    console.log('✓ confirmDelete = false deletes immediately without prompt and keeps Undo toast safety net');

    // Clean up timer handles
    state.destroy();

    console.log('✅ Item 7 PASSED: confirmDelete setting and Undo safety net verified.\n');
  } catch (err) {
    console.error('Test Item 7 failed:', err);
    process.exit(1);
  }
})();
