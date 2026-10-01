/**
 * Subtitle Table Module with Virtualized Scrolling (Smooth with 2,000+ segments),
 * Inline Khmer Text & Time Editing, Steppers, and Audio Preview
 */

import { state, VOICES } from './state.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';
import { timeStringToSeconds } from './subtitle-utils.js';

const ROW_HEIGHT = 44; // Fixed row height in pixels for virtualization
const OVERSCAN = 6;    // Number of rows above and below viewport to keep rendered

export const table = {
  scrollContainer: null,
  tbody: null,
  vfSelect: null,
  mvSelect: null,
  fvSelect: null,
  allCheckbox: null,
  castBtn: null,
  audioCtx: null,
  lastClickedIdx: -1,
  isTicking: false,

  init() {
    this.scrollContainer = document.querySelector('.scroll-table-container');
    this.tbody = document.getElementById('rows');
    this.vfSelect = document.getElementById('vf');
    this.mvSelect = document.getElementById('mv');
    this.fvSelect = document.getElementById('fv');
    this.allCheckbox = document.getElementById('all');
    this.castBtn = document.getElementById('cast');

    this.populateVoiceDropdowns();
    this.attachEventListeners();

    // Reactive listeners
    state.on('change', () => this.render());
    state.on('selectionChange', (id) => this.onSelectionChange(id));
    state.on('languageChange', () => {
      this.populateVoiceDropdowns();
      this.render();
    });
    state.on('timelineVolumeChange', (vol) => {
      if (this.currentAudio) {
        this.currentAudio.volume = Math.max(0, Math.min(1, vol));
      }
    });

    this.render();
  },

  populateVoiceDropdowns() {
    const makeOptions = (gender = null, selectedIdx = -1) => {
      return VOICES.map((v, idx) => {
        if (gender && v[2] !== gender) return '';
        const isSel = idx === selectedIdx ? 'selected' : '';
        return `<option value="${idx}" ${isSel}>${v[0]} · ${v[1]}</option>`;
      }).join('');
    };

    if (this.vfSelect) {
      const allText = i18n.t('allVoices');
      this.vfSelect.innerHTML = `<option value="-1">${allText}</option>` + makeOptions();
      this.vfSelect.value = String(state.filterVoice);
    }

    if (this.mvSelect) {
      this.mvSelect.innerHTML = makeOptions('M');
    }

    if (this.fvSelect) {
      this.fvSelect.innerHTML = makeOptions('F');
    }
  },

  onSelectionChange(id) {
    this.render();
    this.scrollToRow(id);
  },

  scrollToRow(id) {
    if (!this.scrollContainer) return;
    const list = state.getFilteredRows();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return;

    const rowTop = idx * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const currentScrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    if (rowTop < currentScrollTop) {
      this.scrollContainer.scrollTop = rowTop;
    } else if (rowBottom > currentScrollTop + viewportHeight) {
      this.scrollContainer.scrollTop = rowBottom - viewportHeight;
    }
  },

  updateToolbarState() {
    const hasSegments = state.rows && state.rows.length > 0;
    const curRow = state.getCur();
    const hasSelection = Boolean(curRow);

    const editBtn = document.getElementById('edit');
    const delBtn = document.getElementById('del');
    const frBtn = document.getElementById('fr');
    const seriesBtn = document.getElementById('series');
    const vfSelect = document.getElementById('vf');
    const castBtn = document.getElementById('cast');
    const setVoicePopoverBtn = document.getElementById('setVoicePopoverBtn');
    const addBtn = document.getElementById('add');

    // Add Text stays enabled
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.title = i18n.t('addText') || 'Add subtitle row';
    }

    if (!hasSegments) {
      const emptyTip = i18n.t('noSubsYet') || 'No subtitles yet';
      if (editBtn) { editBtn.disabled = true; editBtn.title = emptyTip; }
      if (delBtn) { delBtn.disabled = true; delBtn.title = emptyTip; }
      if (frBtn) { frBtn.disabled = true; frBtn.title = emptyTip; }
      if (seriesBtn) { seriesBtn.disabled = true; seriesBtn.title = emptyTip; }
      if (vfSelect) { vfSelect.disabled = true; vfSelect.title = emptyTip; }
      if (castBtn) { castBtn.disabled = true; castBtn.title = emptyTip; }
      if (setVoicePopoverBtn) { setVoicePopoverBtn.disabled = true; setVoicePopoverBtn.title = emptyTip; }
    } else {
      if (frBtn) { frBtn.disabled = false; frBtn.title = 'Find & Replace (Ctrl+F)'; }
      if (seriesBtn) { seriesBtn.disabled = false; seriesBtn.title = 'Series'; }
      if (vfSelect) { vfSelect.disabled = false; vfSelect.title = ''; }
      if (castBtn) { castBtn.disabled = false; castBtn.title = ''; }
      if (setVoicePopoverBtn) { setVoicePopoverBtn.disabled = false; setVoicePopoverBtn.title = 'Assign Voice'; }

      // Edit and Delete stay disabled until a row is selected
      if (hasSelection) {
        if (editBtn) { editBtn.disabled = false; editBtn.title = i18n.t('edit') || 'Edit'; }
        if (delBtn) { delBtn.disabled = false; delBtn.title = 'Delete selected row (Delete)'; }
      } else {
        const noSelTip = 'No subtitle row selected';
        if (editBtn) { editBtn.disabled = true; editBtn.title = noSelTip; }
        if (delBtn) { delBtn.disabled = true; delBtn.title = noSelTip; }
      }
    }
  },

  /**
   * Virtualized Table Render
   */
  render() {
    this.updateToolbarState();
    if (!this.tbody || !this.scrollContainer) return;

    const list = state.getFilteredRows();
    const totalRows = list.length;
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight || 450;

    // Calculate virtual window slice
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);

    const visibleRows = list.slice(startIndex, endIndex);

    const makeVoiceOptions = (gender = null, selectedIdx = -1) => {
      return VOICES.map((v, idx) => {
        if (gender && v[2] !== gender) return '';
        const isSel = idx === selectedIdx ? 'selected' : '';
        return `<option value="${idx}" ${isSel}>${v[0]} · ${v[1]}</option>`;
      }).join('');
    };

    // Virtual spacers
    const topSpacerHeight = startIndex * ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);

    let html = '';

    if (topSpacerHeight > 0) {
      html += `<tr class="vt-spacer" style="height:${topSpacerHeight}px; border:none;"><td colspan="7" style="padding:0; border:none;"></td></tr>`;
    }

    html += visibleRows.map(r => {
      const v = VOICES[r.v] || VOICES[0];
      const isSelected = r.id === state.selectedId;
      const speedVal = Number(r.sp || 1.0).toFixed(1);

      return `<tr data-id="${r.id}" class="${isSelected ? 'sel' : ''}" style="height:${ROW_HEIGHT}px;">
        <td style="width:36px;"><input type="checkbox" ${r.ck ? 'checked' : ''} aria-label="${i18n.t('thSelect')}"></td>
        <td class="t time-editable" data-time-field="s" contenteditable="true" spellcheck="false" title="Click to edit start time">${ui.formatTime(r.s)}</td>
        <td class="t time-editable" data-time-field="e" contenteditable="true" spellcheck="false" title="Click to edit end time">${ui.formatTime(r.e)}</td>
        <td class="txt" contenteditable="true" spellcheck="false">${r.t}</td>
        <td>
          <span class="tag" style="background:${v[3]}">${v[0]}</span>
          <select data-k="v">${makeVoiceOptions(null, r.v)}</select>
          <span class="g ${v[2]}">${v[2]}</span>
        </td>
        <td>
          <div class="speed-cell">
            <button class="speed-step-btn" data-step="-0.1" title="Decrease speed">-</button>
            <input type="range" data-k="sp" min="0.5" max="1.5" step="0.1" value="${speedVal}" aria-label="${i18n.t('speedLabel')}">
            <button class="speed-step-btn" data-step="0.1" title="Increase speed">+</button>
            <span class="t" style="min-width:28px;">${speedVal}x</span>
          </div>
        </td>
        <td>
          <div class="audio-cell">
            ${(() => {
              if (r.generating) {
                return `<button class="st generating" data-k="ok" title="${i18n.t('generatingAudio') || 'Generating...'}">⏳</button>`;
              }
              if (r.overflow) {
                return `<button class="st overflow" data-k="ok" title="${i18n.t('audioOverflowWarning', { sec: r.overflowDelta || 0.5 })}">⚠️</button>`;
              }
              if (r.ok) {
                return `<button class="st ok" data-k="ok" title="${i18n.t('audioGenTooltip')}">🔊</button>`;
              }
              return `<button class="st" data-k="ok" title="${i18n.t('audioGenTooltip')}">🔊</button>`;
            })()}
          </div>
        </td>
      </tr>`;
    }).join('');

    if (bottomSpacerHeight > 0) {
      html += `<tr class="vt-spacer" style="height:${bottomSpacerHeight}px; border:none;"><td colspan="7" style="padding:0; border:none;"></td></tr>`;
    }

    this.tbody.innerHTML = html;

    // Update cast count button
    if (this.castBtn) {
      const uniqueVoices = new Set(state.rows.map(r => r.v)).size;
      this.castBtn.textContent = i18n.t('cast', { count: uniqueVoices });
    }

    // Update Select All checkbox state
    if (this.allCheckbox) {
      const total = state.rows.length;
      const checkedCount = state.rows.filter(r => r.ck).length;
      this.allCheckbox.checked = total > 0 && checkedCount === total;
      this.allCheckbox.indeterminate = checkedCount > 0 && checkedCount < total;
    }
  },

  /**
   * Synthesize audio preview: uses real synthesized audio file if available, or tone fallback
   */
  playAudioPreview(row) {
    if (row.audioPath) {
      try {
        let url = row.audioPath.replace(/\\/g, '/');
        if (!url.startsWith('file://')) {
          url = 'file:///' + url.replace(/^([a-zA-Z]):/, '$1:');
        }
        if (this.currentAudio) {
          this.currentAudio.pause();
        }
        this.currentAudio = new Audio(url);
        const masterGain = (state.timeline && typeof state.timeline.vol === 'number') ? state.timeline.vol : 1;
        this.currentAudio.volume = Math.max(0, Math.min(1, masterGain));
        this.currentAudio.play().catch(() => this.playToneFallback(row));
        return;
      } catch (_) {}
    }
    this.playToneFallback(row);
  },

  playToneFallback(row) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const dur = Math.max(0.2, Math.min(2.0, (row.e - row.s) / (row.sp || 1.0)));
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const masterGain = (state.timeline && typeof state.timeline.vol === 'number') ? state.timeline.vol : 1;
      gain.gain.setValueAtTime(0.2 * masterGain, this.audioCtx.currentTime);

      // Set pitch according to voice profile
      const isFemale = VOICES[row.v]?.[2] === 'F';
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isFemale ? 340 : 220, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + dur);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + dur);
    } catch (_) {}
  },

  attachEventListeners() {
    if (!this.tbody || !this.scrollContainer) return;

    // Scroll listener for virtualized rendering
    this.scrollContainer.addEventListener('scroll', () => {
      if (!this.isTicking) {
        window.requestAnimationFrame(() => {
          this.render();
          this.isTicking = false;
        });
        this.isTicking = true;
      }
    });

    // Table click delegation
    this.tbody.addEventListener('click', e => {
      const tr = e.target.closest('tr:not(.vt-spacer)');
      if (!tr) return;

      const rowId = Number(tr.dataset.id);
      const row = state.rows.find(x => x.id === rowId);
      if (!row) return;

      const list = state.getFilteredRows();
      const curIdx = list.findIndex(x => x.id === rowId);

      // Audio status button click
      if (e.target.dataset.k === 'ok') {
        if (row.ok || row.audioPath) {
          // Play audio preview
          this.playAudioPreview(row);
          if (row.overflow) {
            ui.showToast(i18n.t('audioOverflowWarning', { sec: row.overflowDelta || 0.5 }));
          }
        } else {
          // Toggle audio state
          state.snapshot();
          row.ok = true;
          this.playAudioPreview(row);
          ui.showToast(i18n.t('audioGenerated'));
          state.emit('change', { source: 'audioToggle' });
        }
        return;
      }

      // Speed stepper buttons
      if (e.target.classList.contains('speed-step-btn')) {
        const step = parseFloat(e.target.dataset.step) || 0.1;
        state.snapshot();
        row.sp = Math.max(0.5, Math.min(1.5, Math.round((row.sp + step) * 10) / 10));
        state.emit('change', { source: 'speedStepper' });
        return;
      }

      // Checkbox click with Shift+Click multi-select
      if (e.target.type === 'checkbox') {
        if (e.shiftKey && this.lastClickedIdx !== -1) {
          const from = Math.min(this.lastClickedIdx, curIdx);
          const to = Math.max(this.lastClickedIdx, curIdx);
          const checked = e.target.checked;
          for (let i = from; i <= to; i++) {
            list[i].ck = checked;
          }
        } else {
          row.ck = e.target.checked;
        }
        this.lastClickedIdx = curIdx;
        state.emit('change', { source: 'checkbox' });
        return;
      }

      this.lastClickedIdx = curIdx;

      // Select row and seek playhead to segment start time
      state.select(row.id);
      state.setPlayhead(row.s);
    });

    // Inputs change delegation (voice select, speed slider)
    this.tbody.addEventListener('change', e => {
      const tr = e.target.closest('tr:not(.vt-spacer)');
      if (!tr) return;
      const row = state.rows.find(x => x.id === Number(tr.dataset.id));
      const key = e.target.dataset.k;
      if (!row || !key) return;

      state.snapshot();
      row[key] = +e.target.value;
      state.emit('change', { source: 'inputChange' });
    });

    // Contenteditable blur (Text or Time)
    this.tbody.addEventListener('focusout', e => {
      const tr = e.target.closest('tr:not(.vt-spacer)');
      if (!tr) return;
      const row = state.rows.find(x => x.id === Number(tr.dataset.id));
      if (!row) return;

      // Subtitle Text edit
      if (e.target.classList.contains('txt')) {
        const newText = e.target.textContent.trim();
        if (row.t !== newText) {
          state.snapshot();
          row.t = newText;
          state.emit('change', { source: 'textEdit' });
        }
        return;
      }

      // Timecode edit (Start or End)
      if (e.target.classList.contains('time-editable')) {
        const field = e.target.dataset.timeField;
        const newSec = timeStringToSeconds(e.target.textContent);

        if (field === 's' && Math.abs(row.s - newSec) > 0.05) {
          state.snapshot();
          row.s = Math.max(0, Math.min(row.e - 0.1, newSec));
          state.emit('change', { source: 'timeEdit' });
        } else if (field === 'e' && Math.abs(row.e - newSec) > 0.05) {
          state.snapshot();
          row.e = Math.max(row.s + 0.1, newSec);
          state.emit('change', { source: 'timeEdit' });
        } else {
          e.target.textContent = ui.formatTime(row[field]);
        }
      }
    });

    // Voice filter dropdown
    if (this.vfSelect) {
      this.vfSelect.addEventListener('change', e => {
        state.filterVoice = Number(e.target.value);
        this.render();
      });
    }

    // Select all checkbox
    if (this.allCheckbox) {
      this.allCheckbox.addEventListener('change', e => {
        const checked = e.target.checked;
        state.rows.forEach(r => { r.ck = checked; });
        this.render();
      });
    }

    // Keyboard navigation (ArrowUp / ArrowDown)
    window.addEventListener('keydown', e => {
      const isInput = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.isContentEditable);
      if (isInput) return;

      const list = state.getFilteredRows();
      if (!list.length) return;

      const curIdx = list.findIndex(r => r.id === state.selectedId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(list.length - 1, curIdx + 1);
        const nextRow = list[nextIdx];
        if (nextRow) {
          state.select(nextRow.id);
          state.setPlayhead(nextRow.s);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, curIdx - 1);
        const prevRow = list[prevIdx];
        if (prevRow) {
          state.select(prevRow.id);
          state.setPlayhead(prevRow.s);
        }
      }
    });
  }
};
