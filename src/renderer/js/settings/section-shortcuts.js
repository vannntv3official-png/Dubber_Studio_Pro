/**
 * Settings Section: Shortcuts
 * Manages customizable keyboard shortcuts with interactive key capture,
 * duplicate/conflict detection, and reset-to-defaults functionality.
 */

import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};

export const DEFAULT_SHORTCUTS = {
  playPause: 'Space',
  split: 'KeyS',
  save: 'Ctrl+KeyS',
  undo: 'Ctrl+KeyZ',
  redo: 'Ctrl+KeyY',
  findReplace: 'Ctrl+KeyF',
  deleteRow: 'Delete',
  prevRow: 'ArrowUp',
  nextRow: 'ArrowDown'
};

const SHORTCUT_LABELS = {
  playPause: { km: 'ចាក់ / ផ្អាក (Play / Pause)', en: 'Play / Pause Video' },
  split: { km: 'កាត់ត្រង់ Playhead (Split)', en: 'Split Subtitle at Playhead' },
  save: { km: 'រក្សាទុកគម្រោង (Save)', en: 'Save Project' },
  undo: { km: 'មិនធ្វើវិញ (Undo)', en: 'Undo Last Action' },
  redo: { km: 'ធ្វើវិញ (Redo)', en: 'Redo Action' },
  findReplace: { km: 'ស្វែងរក និងជំនួស (Find & Replace)', en: 'Find & Replace Modal' },
  deleteRow: { km: 'លុបជួរអត្ថបទរង (Delete Row)', en: 'Delete Selected Subtitle' },
  prevRow: { km: 'ជួរមុន (Previous Row)', en: 'Select Previous Subtitle' },
  nextRow: { km: 'ជួរបន្ទាប់ (Next Row)', en: 'Select Next Subtitle' }
};

let currentShortcuts = { ...DEFAULT_SHORTCUTS };
let recordingAction = null;
let recordingHandler = null;

export const sectionShortcuts = {
  id: 'secShortcuts',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const resetBtn = document.getElementById('setShortcutsResetBtn');
    resetBtn?.addEventListener('click', () => {
      currentShortcuts = { ...DEFAULT_SHORTCUTS };
      const banner = document.getElementById('setShortcutsConflictBanner');
      if (banner) banner.hidden = true;
      this.renderList();
      markDirtyFn();
      showToast('Shortcuts reset to defaults');
    });

    this.renderList();
  },

  load(settings) {
    currentShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, settings?.shortcuts || {});
    this.renderList();
  },

  renderList() {
    const container = document.getElementById('setShortcutsListContainer');
    if (!container) return;

    container.innerHTML = Object.entries(currentShortcuts).map(([action, combo]) => {
      const labelObj = SHORTCUT_LABELS[action] || { km: action, en: action };
      const displayKey = this.formatDisplayCombo(combo);

      return `
        <div class="row" style="justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px solid rgba(255,255,255,0.05);" data-action="${action}">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:11.5px; font-weight:600;">${labelObj.km}</span>
            <span class="muted" style="font-size:10px;">${labelObj.en}</span>
          </div>
          <button class="btn shortcut-rebind-btn" style="min-width:90px; font-family:ui-monospace, monospace; font-size:11px; font-weight:600; padding:4px 10px;" data-action="${action}">
            ${displayKey}
          </button>
        </div>
      `;
    }).join('');

    // Attach rebind handlers
    container.querySelectorAll('.shortcut-rebind-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.startRecording(action, btn);
      });
    });
  },

  startRecording(action, btn) {
    // If already recording something else, cancel it
    this.cancelRecording();

    recordingAction = action;
    btn.textContent = '⌨️ Press keys...';
    btn.style.borderColor = '#10b981';
    btn.style.background = 'rgba(16, 185, 129, 0.15)';

    recordingHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      // Build key string
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let mainKey = e.code;
      if (e.key === ' ' || e.code === 'Space') mainKey = 'Space';
      else if (e.code.startsWith('Key')) mainKey = e.code;
      else if (e.code.startsWith('Digit')) mainKey = e.code;
      else if (e.key.length === 1 && !e.code) mainKey = e.key.toUpperCase();
      else if (e.key.length > 1) mainKey = e.key;

      parts.push(mainKey);
      const newCombo = parts.join('+');

      // Check conflict
      this.checkConflict(action, newCombo);

      // Save new combo
      currentShortcuts[action] = newCombo;
      markDirtyFn();

      this.cancelRecording();
      this.renderList();
    };

    window.addEventListener('keydown', recordingHandler, { capture: true });
  },

  cancelRecording() {
    if (recordingHandler) {
      window.removeEventListener('keydown', recordingHandler, { capture: true });
      recordingHandler = null;
    }
    recordingAction = null;
  },

  checkConflict(action, newCombo) {
    const banner = document.getElementById('setShortcutsConflictBanner');
    if (!banner) return;

    let conflictingAction = null;
    for (const [otherAction, combo] of Object.entries(currentShortcuts)) {
      if (otherAction !== action && combo.toLowerCase() === newCombo.toLowerCase()) {
        conflictingAction = otherAction;
        break;
      }
    }

    if (conflictingAction) {
      const conflictName = SHORTCUT_LABELS[conflictingAction]?.km || conflictingAction;
      banner.textContent = `⚠️ ផ្លូវកាត់ '${this.formatDisplayCombo(newCombo)}' ត្រូវបានប្រើប្រាស់រួចហើយដោយ '${conflictName}'!`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  },

  formatDisplayCombo(combo) {
    if (!combo) return 'None';
    return combo
      .replace(/Key/g, '')
      .replace(/Digit/g, '')
      .replace(/ArrowUp/g, '↑ Up')
      .replace(/ArrowDown/g, '↓ Down')
      .replace(/ArrowLeft/g, '← Left')
      .replace(/ArrowRight/g, '→ Right');
  },

  getData() {
    return { ...currentShortcuts };
  }
};
