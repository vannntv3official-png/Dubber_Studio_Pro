/**
 * Cast Management & Voice Assignment System
 * Handles character list (Cast), gender classification, voice profile mapping (A1-A5),
 * auto-suggestion, and bulk reassignment.
 */

import { state, VOICES } from './state.js';
import { i18n, t } from './i18n.js';
import { showToast } from './ui.js';

export const cast = {
  characters: [], // Array of { id, name, gender: 'M'|'F', voiceIdx: number }

  init() {
    this.extractCastFromRows();
    this.bindEvents();
    this.updateCastButtonText();
  },

  extractCastFromRows() {
    // If cast already loaded in project, keep it
    if (state.project && Array.isArray(state.project.cast) && state.project.cast.length > 0) {
      this.characters = state.project.cast;
      return;
    }

    // Extract speakers from state.rows
    const speakerMap = new Map();

    state.rows.forEach(r => {
      const spk = r.speaker || (VOICES[r.v] ? VOICES[r.v][1] : 'Speaker');
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
  },

  updateCastButtonText() {
    const castBtn = document.getElementById('cast');
    if (castBtn) {
      castBtn.textContent = `Cast (${this.characters.length}) ▾`;
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
      <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:6px; border-bottom:1px solid var(--line);">
        <strong style="font-size:12px;">តួអង្គ (Cast Characters)</strong>
        <button class="btn" id="addCastCharBtn" style="font-size:10px; padding:2px 8px;">＋ បន្ថែមតួ</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto; margin:4px 0;">
    `;

    this.characters.forEach((char, cIdx) => {
      const rowCount = state.rows.filter(r => (r.speaker === char.name) || (r.v === char.voiceIdx)).length;
      html += `
        <div class="cast-row-item" style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <input type="text" class="char-name-inp" data-idx="${cIdx}" value="${char.name}" style="flex:1; font-size:11px; padding:3px 6px;">
          <select class="char-gender-sel" data-idx="${cIdx}" style="width:48px; font-size:10px; padding:2px;">
            <option value="M" ${char.gender === 'M' ? 'selected' : ''}>M ♂</option>
            <option value="F" ${char.gender === 'F' ? 'selected' : ''}>F ♀</option>
          </select>
          <select class="char-voice-sel" data-idx="${cIdx}" style="font-size:10px; padding:2px 4px;">
            ${makeVoiceOptions(char.voiceIdx)}
          </select>
          <button class="btn apply-char-btn" data-idx="${cIdx}" title="អនុវត្តទៅគ្រប់ជួរនៃតួនេះ (${rowCount} ជួរ)" style="font-size:10px; padding:2px 6px;">✓</button>
        </div>
      `;
    });

    html += `
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid var(--line);">
        <button class="btn primary" id="autoSuggestAllBtn" style="font-size:11px; width:100%; padding:4px;">
          ✨ ស្នើរសម្លេងដោយស្វ័យប្រវត្តិ (Auto-Suggest)
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
      const newId = `c_${this.characters.length + 1}`;
      const isFemale = this.characters.length % 2 === 1;
      this.characters.push({
        id: newId,
        name: `Speaker ${this.characters.length + 1}`,
        gender: isFemale ? 'F' : 'M',
        voiceIdx: isFemale ? 2 : 0
      });
      this.updateCastButtonText();
      this.renderPopover();
    });

    // Name changes
    pop.querySelectorAll('.char-name-inp').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        if (this.characters[idx]) {
          this.characters[idx].name = e.target.value.trim();
        }
      });
    });

    // Gender changes
    pop.querySelectorAll('.char-gender-sel').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        if (this.characters[idx]) {
          const g = e.target.value;
          this.characters[idx].gender = g;
          // Auto switch to appropriate gender voice if mismatch
          const curVoiceGender = VOICES[this.characters[idx].voiceIdx]?.[2];
          if (curVoiceGender && curVoiceGender !== g) {
            this.characters[idx].voiceIdx = g === 'F' ? 2 : 0;
            this.renderPopover();
          }
        }
      });
    });

    // Voice changes
    pop.querySelectorAll('.char-voice-sel').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        if (this.characters[idx]) {
          this.characters[idx].voiceIdx = Number(e.target.value);
        }
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

    // Auto-suggest all voices
    pop.querySelector('#autoSuggestAllBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.autoSuggestVoices();
      pop.hidden = true;
    });
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
