/**
 * Cast Management & Voice Assignment System
 * Handles character list (Cast), gender classification, voice profile mapping (A1-A5),
 * audio preview synthesis, smart auto-suggestion, and bulk subtitle reassignment.
 */

import { state, VOICES } from './state.js';
import { i18n, t } from './i18n.js';
import { showToast } from './ui.js';
import { ipcClient } from './ipc-client.js';

let currentPreviewAudio = null;
let currentPreviewBtn = null;

function stopCurrentPreview() {
  if (currentPreviewAudio) {
    try {
      currentPreviewAudio.pause();
      currentPreviewAudio.currentTime = 0;
    } catch (_) {}
    currentPreviewAudio = null;
  }
  if (currentPreviewBtn) {
    currentPreviewBtn.classList.remove('playing');
    currentPreviewBtn.innerHTML = '🔊';
    currentPreviewBtn = null;
  }
}

export const cast = {
  characters: [], // Array of { id, name, gender: 'M'|'F', voiceIdx: number }

  init() {
    window.__castInstance = this;
    this.extractCastFromRows();
    this.bindEvents();
    this.updateCastButtonText();
  },

  extractCastFromRows(forceRefresh = false) {
    // If cast already loaded in project and not forced, keep it
    if (!forceRefresh && state.project && Array.isArray(state.project.cast) && state.project.cast.length > 0) {
      this.characters = state.project.cast;
      this.updateCastButtonText();
      return;
    }

    // Extract speakers from state.rows
    const speakerMap = new Map();

    state.rows.forEach(r => {
      const spk = String(r.speaker || (VOICES[r.v] ? VOICES[r.v][1] : 'Speaker 1')).trim();
      const g = (r.gender || (VOICES[r.v] ? VOICES[r.v][2] : 'M')).toUpperCase() === 'F' ? 'F' : 'M';

      if (!speakerMap.has(spk)) {
        speakerMap.set(spk, {
          name: spk,
          gender: g,
          count: 1,
          voiceIdx: r.v != null ? r.v : (g === 'F' ? 2 : 0)
        });
      } else {
        speakerMap.get(spk).count++;
      }
    });

    if (speakerMap.size === 0) {
      // Default initial cast
      this.characters = [
        { id: 'c1', name: 'តួប្រុស ១ (Speaker 1)', gender: 'M', voiceIdx: 0 },
        { id: 'c2', name: 'តួស្រី ១ (Speaker 2)', gender: 'F', voiceIdx: 2 }
      ];
    } else {
      let maleCount = 0;
      let femaleCount = 0;

      this.characters = Array.from(speakerMap.entries()).map(([spk, data], idx) => {
        let vIdx = data.voiceIdx;
        if (vIdx == null) {
          if (data.gender === 'F') {
            vIdx = femaleCount === 0 ? 2 : 4; // A3 or A5
            femaleCount++;
          } else {
            const mIndices = [0, 1, 3]; // A1, A2, A4
            vIdx = mIndices[maleCount % mIndices.length];
            maleCount++;
          }
        }

        return {
          id: `c_${idx + 1}`,
          name: spk,
          gender: data.gender,
          voiceIdx: vIdx
        };
      });
    }

    if (state.project) {
      state.project.cast = this.characters;
    }
    this.updateCastButtonText();
  },

  syncFromRows() {
    const existingNames = new Set(this.characters.map(c => c.name.toLowerCase()));
    let addedCount = 0;

    state.rows.forEach(r => {
      const spk = String(r.speaker || '').trim();
      if (spk && !existingNames.has(spk.toLowerCase())) {
        existingNames.add(spk.toLowerCase());
        const isF = (r.gender || '').toUpperCase() === 'F' || (r.gender || '').toLowerCase() === 'female';
        this.characters.push({
          id: `c_${Date.now()}_${addedCount}`,
          name: spk,
          gender: isF ? 'F' : 'M',
          voiceIdx: isF ? 2 : 0
        });
        addedCount++;
      }
    });

    if (state.project) {
      state.project.cast = this.characters;
    }
    this.updateCastButtonText();
    this.renderPopover();

    if (addedCount > 0) {
      showToast(`បានស្រង់បន្ថែម ${addedCount} តួអង្គពី Subtitles`);
    } else {
      showToast('តួអង្គទាំងអស់មានក្នុងបញ្ជីរួចរាល់ហើយ');
    }
  },

  updateCastButtonText() {
    const castBtn = document.getElementById('cast');
    if (castBtn) {
      castBtn.textContent = `Cast (${this.characters.length}) ▾`;
      if (state.rows.length > 0) {
        castBtn.disabled = false;
        castBtn.title = 'គ្រប់គ្រងតួអង្គ និងសម្លេង (Manage Characters)';
      }
    }
  },

  renderPopover() {
    const pop = document.getElementById('pop');
    if (!pop) return;

    const makeVoiceOptions = (selectedIdx) => {
      return VOICES.map((v, idx) => {
        const isSel = idx === selectedIdx ? 'selected' : '';
        return `<option value="${idx}" ${isSel}>${v[0]} · ${v[1]} (${v[2]})</option>`;
      }).join('');
    };

    let html = `
      <div class="cast-popover-header">
        <div class="cast-popover-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>តួអង្គ Cast (${this.characters.length})</span>
        </div>
        <div class="cast-popover-actions">
          <button class="btn" id="syncCastFromRowsBtn" title="ស្រង់តួអង្គពី Subtitle" style="font-size:10.5px; padding:2px 7px;">🔄 ស្រង់តួ</button>
          <button class="btn primary" id="addCastCharBtn" style="font-size:10.5px; padding:2px 8px;">＋ បន្ថែម</button>
        </div>
      </div>

      <div class="cast-popover-list">
    `;

    this.characters.forEach((char, cIdx) => {
      const rowCount = state.rows.filter(r => (r.speaker === char.name) || (!r.speaker && r.v === char.voiceIdx)).length;
      html += `
        <div class="cast-row-item" data-idx="${cIdx}">
          <span class="cast-gender-badge ${char.gender}" data-idx="${cIdx}" title="ចុចដើម្បីប្ដូរភេទ (Click to toggle M/F)">
            ${char.gender === 'F' ? '♀' : '♂'}
          </span>
          <input type="text" class="cast-name-inp char-name-inp" data-idx="${cIdx}" value="${char.name}" placeholder="ឈ្មោះតួ..." title="ឈ្មោះតួអង្គ">
          <select class="cast-voice-sel char-voice-sel" data-idx="${cIdx}" title="ជ្រើសរើសសំឡេង">
            ${makeVoiceOptions(char.voiceIdx)}
          </select>
          <button class="btn cast-preview-btn" data-idx="${cIdx}" title="ស្ដាប់សម្លេងសាកល្បង (Preview Voice)">🔊</button>
          <span class="cast-line-count">${rowCount} ជួរ</span>
          <button class="btn primary cast-action-btn apply-char-btn" data-idx="${cIdx}" title="អនុវត្តសំឡេងនេះទៅគ្រប់ ${rowCount} ជួរ">✓</button>
          <button class="btn danger cast-delete-btn del-char-btn" data-idx="${cIdx}" title="លុបតួអង្គនេះ">✕</button>
        </div>
      `;
    });

    html += `
      </div>
      <div class="cast-popover-footer">
        <button class="btn" id="autoSuggestAllBtn" style="flex:1; font-size:11px; padding:5px 8px;">
          ✨ Auto-Suggest (ស្វ័យប្រវត្តិ)
        </button>
        <button class="btn primary" id="applyAllCastBtn" style="flex:1; font-size:11px; padding:5px 8px;">
          ✓ អនុវត្តគ្រប់តួ (Apply All)
        </button>
      </div>
    `;

    pop.innerHTML = html;
    this.attachPopoverListeners();
  },

  attachPopoverListeners() {
    const pop = document.getElementById('pop');
    if (!pop) return;

    // Add character
    pop.querySelector('#addCastCharBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isFemale = this.characters.filter(c => c.gender === 'F').length <= this.characters.filter(c => c.gender === 'M').length;
      const gender = isFemale ? 'F' : 'M';
      const voiceIdx = isFemale ? 2 : 0;
      const newId = `c_${Date.now()}`;
      const newName = `Speaker ${this.characters.length + 1}`;
      this.characters.push({
        id: newId,
        name: newName,
        gender,
        voiceIdx
      });
      if (state.project) state.project.cast = this.characters;
      this.updateCastButtonText();
      this.renderPopover();
    });

    // Sync from rows
    pop.querySelector('#syncCastFromRowsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.syncFromRows();
    });

    // Toggle Gender badge
    pop.querySelectorAll('.cast-gender-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(badge.dataset.idx);
        const char = this.characters[idx];
        if (!char) return;

        char.gender = char.gender === 'M' ? 'F' : 'M';
        // Auto pick matching gender voice
        const curGender = VOICES[char.voiceIdx]?.[2];
        if (curGender !== char.gender) {
          char.voiceIdx = char.gender === 'F' ? 2 : 0;
        }
        if (state.project) state.project.cast = this.characters;
        this.renderPopover();
      });
    });

    // Name changes
    pop.querySelectorAll('.char-name-inp').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        if (this.characters[idx]) {
          const newName = e.target.value.trim() || `Speaker ${idx + 1}`;
          this.characters[idx].name = newName;
          if (state.project) state.project.cast = this.characters;
        }
      });
    });

    // Voice changes
    pop.querySelectorAll('.char-voice-sel').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        if (this.characters[idx]) {
          this.characters[idx].voiceIdx = Number(e.target.value);
          // Sync gender to voice preset
          const voiceGender = VOICES[this.characters[idx].voiceIdx]?.[2];
          if (voiceGender) {
            this.characters[idx].gender = voiceGender;
          }
          if (state.project) state.project.cast = this.characters;
          this.renderPopover();
        }
      });
    });

    // Voice Preview
    pop.querySelectorAll('.cast-preview-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        const char = this.characters[idx];
        if (!char) return;
        await this.previewVoice(char, btn);
      });
    });

    // Apply voice to all lines of character
    pop.querySelectorAll('.apply-char-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        const char = this.characters[idx];
        if (!char) return;

        state.snapshot();
        let count = 0;
        state.rows.forEach(r => {
          if (r.speaker === char.name || (!r.speaker && (VOICES[r.v]?.[2] === char.gender))) {
            r.v = char.voiceIdx;
            r.speaker = char.name;
            r.gender = char.gender;
            count++;
          }
        });

        state.emit('change', { source: 'applyCastVoice' });
        const voiceName = VOICES[char.voiceIdx]?.[0] || 'Voice';
        showToast(t('assignedVoice', { count, voice: voiceName }));
        pop.hidden = true;
      });
    });

    // Delete character
    pop.querySelectorAll('.del-char-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        if (this.characters.length <= 1) {
          showToast('ត្រូវមានតួអង្គយ៉ាងហោចណាស់មួយ (Must keep at least one character)');
          return;
        }
        const removed = this.characters.splice(idx, 1)[0];
        if (state.project) state.project.cast = this.characters;
        this.updateCastButtonText();
        this.renderPopover();
        showToast(`បានលុបតួអង្គ ${removed?.name || ''}`);
      });
    });

    // Auto-suggest all voices
    pop.querySelector('#autoSuggestAllBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.autoSuggestVoices();
      pop.hidden = true;
    });

    // Apply all cast
    pop.querySelector('#applyAllCastBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.applyAllCastToRows();
      pop.hidden = true;
    });
  },

  async previewVoice(char, btn) {
    if (currentPreviewBtn === btn) {
      stopCurrentPreview();
      return;
    }

    stopCurrentPreview();

    const sampleText = `សួស្តី ខ្ញុំគឺ ${char.name}។ ខ្ញុំរីករាយណាស់ដែលបានជួបអ្នក!`;
    btn.classList.add('playing');
    btn.innerHTML = '⏳';
    currentPreviewBtn = btn;

    try {
      const res = await ipcClient.synthesizeSingle({
        text: sampleText,
        voicePreset: `A${char.voiceIdx + 1}`,
        voiceIndex: char.voiceIdx
      });

      if (res && res.audioPath) {
        btn.innerHTML = '⏹';
        const audioUrl = `file://${res.audioPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        const audio = new Audio(audioUrl);
        currentPreviewAudio = audio;

        audio.onended = () => stopCurrentPreview();
        audio.onerror = () => stopCurrentPreview();
        await audio.play();
      } else {
        throw new Error(res?.error || 'Synthesis returned no audio');
      }
    } catch (err) {
      stopCurrentPreview();
      showToast(`Preview failed: ${err.message}`);
    }
  },

  autoSuggestVoices() {
    state.snapshot();
    const charMap = new Map(this.characters.map(c => [c.name.toLowerCase(), c]));

    let assigned = 0;
    state.rows.forEach(r => {
      const spk = (r.speaker || '').toLowerCase();
      const matchedChar = charMap.get(spk);

      if (matchedChar) {
        r.v = matchedChar.voiceIdx;
        assigned++;
      } else {
        // Fallback to gender heuristic
        const isF = (r.gender || '').toLowerCase() === 'female' || (r.gender || '').toUpperCase() === 'F';
        r.v = isF ? 2 : 0; // A3 (Female) or A1 (Male)
        assigned++;
      }
    });

    state.emit('change', { source: 'autoSuggestVoices' });
    showToast(`Auto-assigned voices for ${assigned} dialogue segments.`);
  },

  applyAllCastToRows() {
    state.snapshot();
    let updated = 0;
    const charMap = new Map(this.characters.map(c => [c.name.toLowerCase(), c]));

    state.rows.forEach(r => {
      const spk = (r.speaker || '').toLowerCase();
      const c = charMap.get(spk);
      if (c) {
        r.v = c.voiceIdx;
        r.gender = c.gender;
        updated++;
      }
    });

    state.emit('change', { source: 'applyAllCast' });
    showToast(`បានអនុវត្តសំឡេងតួអង្គទាំងអស់ទៅកាន់ ${updated} ជួរ`);
  },

  bindEvents() {
    const castBtn = document.getElementById('cast');
    const pop = document.getElementById('pop');

    if (castBtn && pop) {
      castBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = !pop.hidden;
        pop.hidden = isHidden;
        if (!isHidden) {
          this.renderPopover();
        } else {
          stopCurrentPreview();
        }
      });
    }

    // React to row changes / transcription
    state.on('change', () => {
      this.extractCastFromRows();
      this.updateCastButtonText();
    });
  }
};
