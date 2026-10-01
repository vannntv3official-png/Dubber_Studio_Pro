/**
 * Settings Section: Voice Presets
 * Manages character presets A1 - A5 with name, gender badge (M/F),
 * base edge-tts voice, rate/pitch/volume sliders, live sample preview,
 * reset to default, and target language voice listing.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};
let currentPresets = {};
let availableVoiceList = [
  { short_name: 'km-KH-PisethNeural', gender: 'Male', locale: 'km-KH' },
  { short_name: 'km-KH-SreymomNeural', gender: 'Female', locale: 'km-KH' }
];
let activeAudio = null;

const DEFAULT_PRESETS = {
  A1: { name: 'Piseth Normal', baseVoice: 'km-KH-PisethNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%', gender: 'M' },
  A2: { name: 'Piseth Deep', baseVoice: 'km-KH-PisethNeural', rate: '+0%', pitch: '-4Hz', volume: '+0%', gender: 'M' },
  A3: { name: 'Sreymom Normal', baseVoice: 'km-KH-SreymomNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%', gender: 'F' },
  A4: { name: 'Piseth Fast', baseVoice: 'km-KH-PisethNeural', rate: '+10%', pitch: '+0Hz', volume: '+0%', gender: 'M' },
  A5: { name: 'Sreymom High', baseVoice: 'km-KH-SreymomNeural', rate: '+0%', pitch: '+5Hz', volume: '+0%', gender: 'F' }
};

export const sectionVoices = {
  id: 'secVoices',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const voiceListSel = document.getElementById('setVoiceListSelect');
    const ttsEngineSel = document.getElementById('setTtsEngineSelect');

    voiceListSel?.addEventListener('change', () => {
      // Optional: if user selects a voice from the main list, they can see info
    });
    ttsEngineSel?.addEventListener('change', () => markDirtyFn());

    currentPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    this.renderPresets();
  },

  async load(settings) {
    const ttsEngineSel = document.getElementById('setTtsEngineSelect');
    if (ttsEngineSel) {
      ttsEngineSel.value = settings?.tts?.engine || 'edge-tts';
    }
    currentPresets = JSON.parse(JSON.stringify(settings?.voicePresets || DEFAULT_PRESETS));
    this.renderPresets();

    // Fetch voice list for current language asynchronously without blocking render
    ipcClient.listVoices().then(res => {
      if (res && Array.isArray(res.voices) && res.voices.length > 0) {
        availableVoiceList = res.voices;
        this.populateVoiceListDropdown();
        this.renderPresets();
      }
    }).catch(() => {});
  },

  populateVoiceListDropdown() {
    const sel = document.getElementById('setVoiceListSelect');
    if (!sel) return;

    sel.innerHTML = availableVoiceList.map(v => {
      const g = v.gender === 'Female' ? 'ស្រី / Female' : 'ប្រុស / Male';
      return `<option value="${v.short_name}">${v.short_name} (${g})</option>`;
    }).join('');
  },

  stopAudio() {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (_) {}
      activeAudio = null;
    }
  },

  renderPresets() {
    const container = document.getElementById('setVoicePresetsList');
    if (!container) return;

    const presetKeys = ['A1', 'A2', 'A3', 'A4', 'A5'];
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];

    container.innerHTML = presetKeys.map((k, idx) => {
      const p = currentPresets[k] || DEFAULT_PRESETS[k];

      const rateVal = parseInt(p.rate || '0', 10);
      const pitchVal = parseInt(p.pitch || '0', 10);
      const volVal = parseInt(p.volume || '0', 10);

      const isFemale = (p.gender === 'F') || p.baseVoice?.toLowerCase().includes('sreymom') || p.baseVoice?.toLowerCase().includes('female');
      const genderBadgeClass = isFemale ? 'gender-badge-f' : 'gender-badge-m';
      const genderBadgeTxt = isFemale ? '♀ F' : '♂ M';

      const voiceOpts = availableVoiceList.map(v => {
        const isSel = v.short_name === p.baseVoice ? 'selected' : '';
        const g = v.gender === 'Female' ? 'F' : 'M';
        return `<option value="${v.short_name}" ${isSel}>${v.short_name} (${g})</option>`;
      }).join('');

      return `
        <div class="preset-card settings-card column-layout" data-key="${k}" style="padding:10px 14px;">
          <!-- Header Row -->
          <div class="row" style="align-items:center; gap:8px; width:100%;">
            <span class="tag" style="background:${colors[idx]}; color:#fff; font-weight:700; width:28px; text-align:center; padding:2px 0;">${k}</span>
            <input type="text" class="preset-name" value="${p.name || ''}" style="width:130px; font-size:11.5px; padding:3px 6px;" placeholder="Character Name">
            <span class="gender-badge ${genderBadgeClass}">${genderBadgeTxt}</span>
            <select class="preset-voice" style="flex:1; font-size:11px; padding:3px 6px;">
              ${voiceOpts}
            </select>
            <button class="btn preset-preview-btn" style="font-size:11px; padding:3px 8px;">🔊 Preview</button>
            <button class="btn preset-reset-btn" title="Reset to default" style="font-size:10px; padding:3px 6px;">🔄</button>
          </div>

          <!-- Sliders Row -->
          <div class="row" style="gap:16px; font-size:10.5px; color:var(--muted); align-items:center; margin-top:6px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span>Speed:</span>
              <input type="range" class="preset-rate" min="-50" max="50" step="5" value="${rateVal}" style="width:75px;">
              <span class="rate-val" style="width:36px; text-align:right;">${rateVal >= 0 ? '+' : ''}${rateVal}%</span>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <span>Pitch:</span>
              <input type="range" class="preset-pitch" min="-20" max="20" step="1" value="${pitchVal}" style="width:75px;">
              <span class="pitch-val" style="width:36px; text-align:right;">${pitchVal >= 0 ? '+' : ''}${pitchVal}Hz</span>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <span>Vol:</span>
              <input type="range" class="preset-vol" min="-50" max="50" step="5" value="${volVal}" style="width:75px;">
              <span class="vol-val" style="width:36px; text-align:right;">${volVal >= 0 ? '+' : ''}${volVal}%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.preset-card').forEach(card => {
      const k = card.dataset.key;
      const nameInp = card.querySelector('.preset-name');
      const voiceSel = card.querySelector('.preset-voice');
      const rateInp = card.querySelector('.preset-rate');
      const rateTxt = card.querySelector('.rate-val');
      const pitchInp = card.querySelector('.preset-pitch');
      const pitchTxt = card.querySelector('.pitch-val');
      const volInp = card.querySelector('.preset-vol');
      const volTxt = card.querySelector('.vol-val');
      const prevBtn = card.querySelector('.preset-preview-btn');
      const resetBtn = card.querySelector('.preset-reset-btn');
      const genderBadge = card.querySelector('.gender-badge');

      nameInp?.addEventListener('input', () => markDirtyFn());

      voiceSel?.addEventListener('change', () => {
        markDirtyFn();
        const selVoice = voiceSel.value;
        const isFem = selVoice.toLowerCase().includes('sreymom') || selVoice.toLowerCase().includes('female');
        if (genderBadge) {
          genderBadge.className = `gender-badge ${isFem ? 'gender-badge-f' : 'gender-badge-m'}`;
          genderBadge.textContent = isFem ? '♀ F' : '♂ M';
        }
      });

      rateInp?.addEventListener('input', () => {
        markDirtyFn();
        const v = parseInt(rateInp.value, 10);
        if (rateTxt) rateTxt.textContent = `${v >= 0 ? '+' : ''}${v}%`;
      });

      pitchInp?.addEventListener('input', () => {
        markDirtyFn();
        const v = parseInt(pitchInp.value, 10);
        if (pitchTxt) pitchTxt.textContent = `${v >= 0 ? '+' : ''}${v}Hz`;
      });

      volInp?.addEventListener('input', () => {
        markDirtyFn();
        const v = parseInt(volInp.value, 10);
        if (volTxt) volTxt.textContent = `${v >= 0 ? '+' : ''}${v}%`;
      });

      resetBtn?.addEventListener('click', () => {
        const def = DEFAULT_PRESETS[k];
        if (!def) return;
        if (nameInp) nameInp.value = def.name;
        if (voiceSel) voiceSel.value = def.baseVoice;
        if (rateInp) rateInp.value = '0';
        if (rateTxt) rateTxt.textContent = '+0%';
        if (pitchInp) pitchInp.value = parseInt(def.pitch, 10) || 0;
        if (pitchTxt) pitchTxt.textContent = def.pitch;
        if (volInp) volInp.value = '0';
        if (volTxt) volTxt.textContent = '+0%';

        const isFem = def.gender === 'F';
        if (genderBadge) {
          genderBadge.className = `gender-badge ${isFem ? 'gender-badge-f' : 'gender-badge-m'}`;
          genderBadge.textContent = isFem ? '♀ F' : '♂ M';
        }
        markDirtyFn();
        showToast(`Preset ${k} reset to default`);
      });

      prevBtn?.addEventListener('click', async () => {
        this.stopAudio();
        const voice = voiceSel?.value || 'km-KH-PisethNeural';
        const rate = `${rateInp.value >= 0 ? '+' : ''}${rateInp.value}%`;
        const pitch = `${pitchInp.value >= 0 ? '+' : ''}${pitchInp.value}Hz`;
        const volume = `${volInp.value >= 0 ? '+' : ''}${volInp.value}%`;

        prevBtn.disabled = true;
        const origText = prevBtn.textContent;
        prevBtn.textContent = '🔊 Playing...';

        try {
          const testText = voice.includes('km-KH')
            ? 'សួស្តី នេះគឺជាគំរូសម្លេងសំយោគតាមការកំណត់របស់អ្នក'
            : 'Hello, this is a sample preview of the synthesized voice preset.';

          const res = await ipcClient.synthesizeSingle({
            text: testText,
            voice,
            rate,
            pitch,
            volume,
            engine: 'edge-tts'
          });

          if (res && res.success && res.outputPath) {
            let url = res.outputPath.replace(/\\/g, '/');
            if (!url.startsWith('file://')) {
              url = 'file:///' + url.replace(/^([a-zA-Z]):/, '$1:');
            }
            activeAudio = new Audio(url);
            activeAudio.play();
            activeAudio.onended = () => {
              prevBtn.disabled = false;
              prevBtn.textContent = origText;
            };
          } else {
            showToast(`Preview failed: ${res?.error || 'Unknown error'}`);
            prevBtn.disabled = false;
            prevBtn.textContent = origText;
          }
        } catch (err) {
          showToast(`Preview error: ${err.message}`);
          prevBtn.disabled = false;
          prevBtn.textContent = origText;
        }
      });
    });
  },

  getData() {
    const container = document.getElementById('setVoicePresetsList');
    if (!container) return currentPresets;

    const presets = {};
    container.querySelectorAll('.preset-card').forEach(card => {
      const k = card.dataset.key;
      const name = card.querySelector('.preset-name')?.value || `Voice ${k}`;
      const voice = card.querySelector('.preset-voice')?.value || 'km-KH-PisethNeural';
      const rateNum = card.querySelector('.preset-rate')?.value || '0';
      const pitchNum = card.querySelector('.preset-pitch')?.value || '0';
      const volNum = card.querySelector('.preset-vol')?.value || '0';

      const isFem = voice.toLowerCase().includes('sreymom') || voice.toLowerCase().includes('female');

      presets[k] = {
        name,
        baseVoice: voice,
        rate: `${rateNum >= 0 ? '+' : ''}${rateNum}%`,
        pitch: `${pitchNum >= 0 ? '+' : ''}${pitchNum}Hz`,
        volume: `${volNum >= 0 ? '+' : ''}${volNum}%`,
        gender: isFem ? 'F' : 'M'
      };
    });

    currentPresets = { ...currentPresets, ...presets };
    return presets;
  },

  getTtsData() {
    const ttsEngineSel = document.getElementById('setTtsEngineSelect');
    return {
      engine: ttsEngineSel?.value || 'edge-tts',
      concurrency: 4
    };
  }
};
