/**
 * Settings Section: Pronunciation Dictionary
 * Manages custom phonetic pronunciation dictionary (Written -> Spoken),
 * search filtering, row addition/editing/deletion, JSON & CSV import/export,
 * and live audio test speaking the replaced word.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';

let activeTestAudio = null;
let allRules = [];

export const sectionPronunciation = {
  id: 'secPronunciation',

  init() {
    const addBtn = document.getElementById('setPronAddBtn');
    const writtenInp = document.getElementById('setPronWrittenInp');
    const spokenInp = document.getElementById('setPronSpokenInp');
    const langSel = document.getElementById('setPronLangSelect');
    const filterInp = document.getElementById('setPronFilterInp');
    const importBtn = document.getElementById('setPronImportBtn');
    const exportJsonBtn = document.getElementById('setPronExportJsonBtn');
    const exportCsvBtn = document.getElementById('setPronExportCsvBtn');
    const addExamplesBtn = document.getElementById('setPronAddExamplesBtn');

    // Add example rules (AI, Studio, PRO)
    addExamplesBtn?.addEventListener('click', async () => {
      try {
        const res = await ipcClient.pronunciationAddExamples();
        if (res && res.success) {
          showToast(`Added ${res.addedCount || 0} example rules ✓`);
          await this.refreshRules();
        } else {
          showToast(`Failed to add example rules: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        showToast(`Error adding examples: ${err.message}`);
      }
    });

    // Add new rule
    addBtn?.addEventListener('click', async () => {
      const written = writtenInp?.value.trim();
      const spoken = spokenInp?.value.trim();
      const language = langSel?.value || 'km';

      if (!written || !spoken) {
        showToast('Please enter both written and spoken words');
        return;
      }

      addBtn.disabled = true;
      try {
        const res = await ipcClient.pronunciationAddRule({ written, spoken, lang: language, language });
        if (res && (res.success || res.entry || res.id)) {
          showToast(`Rule added: "${written}" ➔ "${spoken}"`);
          if (writtenInp) writtenInp.value = '';
          if (spokenInp) spokenInp.value = '';
          await this.refreshRules();
        } else {
          showToast(`Failed to add rule: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        showToast(`Error adding rule: ${err.message}`);
      } finally {
        addBtn.disabled = false;
      }
    });

    writtenInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (spokenInp?.value.trim()) addBtn?.click();
        else spokenInp?.focus();
      }
    });

    spokenInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn?.click();
      }
    });

    // Filter rules
    filterInp?.addEventListener('input', () => {
      this.renderTable(filterInp.value);
    });

    // Import
    importBtn?.addEventListener('click', async () => {
      try {
        const res = await ipcClient.pronunciationImport();
        if (res && res.success) {
          showToast(`Imported ${res.imported || res.count || 0} pronunciation rule(s)`);
          await this.refreshRules();
        } else if (res && res.error) {
          showToast(`Import cancelled or failed: ${res.error}`);
        }
      } catch (err) {
        showToast(`Import failed: ${err.message}`);
      }
    });

    // Export JSON
    exportJsonBtn?.addEventListener('click', async () => {
      try {
        const res = await ipcClient.pronunciationExport('json');
        if (res && res.success) {
          showToast(`Exported ${res.count} rules to JSON`);
        }
      } catch (err) {
        showToast(`Export JSON failed: ${err.message}`);
      }
    });

    // Export CSV
    exportCsvBtn?.addEventListener('click', async () => {
      try {
        const res = await ipcClient.pronunciationExport('csv');
        if (res && res.success) {
          showToast(`Exported ${res.count} rules to CSV`);
        }
      } catch (err) {
        showToast(`Export CSV failed: ${err.message}`);
      }
    });
  },

  async load() {
    await this.refreshRules();
  },

  async refreshRules() {
    try {
      const res = await ipcClient.pronunciationGetRules();
      if (Array.isArray(res)) {
        allRules = res;
      } else if (res && Array.isArray(res.rules)) {
        allRules = res.rules;
      } else if (res && Array.isArray(res.entries)) {
        allRules = res.entries;
      } else {
        allRules = [];
      }
      const filterInp = document.getElementById('setPronFilterInp');
      this.renderTable(filterInp?.value || '');
    } catch (err) {
      console.error('Failed to load pronunciation rules:', err);
    }
  },

  renderTable(filterQuery = '') {
    const tbody = document.getElementById('setPronTableBody');
    const countTxt = document.getElementById('setPronCountTxt');
    if (!tbody) return;

    const q = filterQuery.toLowerCase().trim();
    const filtered = allRules.filter(r => {
      if (!q) return true;
      return (r.written || '').toLowerCase().includes(q) || (r.spoken || '').toLowerCase().includes(q);
    });

    if (countTxt) {
      countTxt.textContent = `Rules: ${allRules.length}${q ? ` (Filtered: ${filtered.length})` : ''}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:16px; color:var(--muted);">
            ${q ? 'No matching pronunciation rules found' : 'No pronunciation rules configured yet'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);" data-id="${r.id}">
        <td style="padding:6px 10px; font-weight:600;">${this.escapeHtml(r.written)}</td>
        <td style="padding:6px 10px; color:#5eead4;">${this.escapeHtml(r.spoken)}</td>
        <td style="padding:6px 10px; font-size:10px; color:var(--muted); text-transform:uppercase;">${r.lang || r.language || 'km'}</td>
        <td style="padding:6px 10px; text-align:right;">
          <div class="row" style="justify-content:flex-end; gap:4px;">
            <button class="btn pron-test-btn" style="font-size:10px; padding:2px 6px;" title="Test Pronunciation">🔊</button>
            <button class="btn pron-del-btn" style="font-size:10px; padding:2px 6px; color:#ef4444;" title="Delete Rule">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach row listeners
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      const rule = allRules.find(r => r.id === id);
      if (!rule) return;

      const testBtn = tr.querySelector('.pron-test-btn');
      const delBtn = tr.querySelector('.pron-del-btn');

      testBtn?.addEventListener('click', async () => {
        if (activeTestAudio) {
          try {
            activeTestAudio.pause();
          } catch (_) {}
          activeTestAudio = null;
        }

        testBtn.disabled = true;
        testBtn.textContent = '...';
        try {
          const res = await ipcClient.synthesizeSingle({
            text: rule.spoken,
            voice: rule.language === 'en' ? 'en-US-JennyNeural' : 'km-KH-PisethNeural',
            engine: 'edge-tts'
          });

          if (res && res.success && res.outputPath) {
            let url = res.outputPath.replace(/\\/g, '/');
            if (!url.startsWith('file://')) {
              url = 'file:///' + url.replace(/^([a-zA-Z]):/, '$1:');
            }
            activeTestAudio = new Audio(url);
            activeTestAudio.play();
            activeTestAudio.onended = () => {
              testBtn.disabled = false;
              testBtn.textContent = '🔊';
            };
          } else {
            showToast(`Audio test failed: ${res?.error || 'Unknown error'}`);
            testBtn.disabled = false;
            testBtn.textContent = '🔊';
          }
        } catch (err) {
          showToast(`Test error: ${err.message}`);
          testBtn.disabled = false;
          testBtn.textContent = '🔊';
        }
      });

      delBtn?.addEventListener('click', async () => {
        try {
          const res = await ipcClient.pronunciationDeleteRule(id);
          if (res && res.success) {
            showToast('Rule removed');
            await this.refreshRules();
          } else {
            showToast(`Failed to delete rule: ${res?.error}`);
          }
        } catch (err) {
          showToast(`Error deleting rule: ${err.message}`);
        }
      });
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
