/**
 * Settings Section: API Keys
 * Manages Gemini API Keys pool: safeStorage encryption, single/batch key entry,
 * eye show/hide toggle, masked list with last-used/error counts, test/delete actions,
 * and Gemini model & concurrency controls.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};

export const sectionKeys = {
  id: 'secKeys',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const keyInp = document.getElementById('setKeyInp');
    const eyeBtn = document.getElementById('setKeyEyeBtn');
    const addBtn = document.getElementById('setKeyAddBtn');

    const multiToggleBtn = document.getElementById('setKeyMultiToggleBtn');
    const multiArea = document.getElementById('setKeyMultiArea');
    const multiInp = document.getElementById('setKeyMultiInp');
    const multiCancelBtn = document.getElementById('setKeyMultiCancelBtn');
    const multiImportBtn = document.getElementById('setKeyMultiImportBtn');

    const resetCooldownsBtn = document.getElementById('setKeyResetCooldownsBtn');
    const testAllBtn = document.getElementById('setKeyTestAllBtn');

    const transModelSel = document.getElementById('setGeminiTransModel');
    const translateModelSel = document.getElementById('setGeminiTranslateModel');
    const concurrencyInp = document.getElementById('setGeminiConcurrency');
    const batchSizeInp = document.getElementById('setGeminiBatchSize');

    const groqKeyInp = document.getElementById('setGroqKeyInp');
    const groqKeySaveBtn = document.getElementById('setGroqKeySaveBtn');

    // SVG paths for show/hide
    const SVG_EYE_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const SVG_EYE_OFF  = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    // Toggle Eye Show/Hide
    eyeBtn?.addEventListener('click', () => {
      if (!keyInp) return;
      if (keyInp.type === 'password') {
        keyInp.type = 'text';
        eyeBtn.innerHTML = SVG_EYE_OFF;
        eyeBtn.title = 'Hide Key';
        eyeBtn.setAttribute('aria-label', 'Hide key');
      } else {
        keyInp.type = 'password';
        eyeBtn.innerHTML = SVG_EYE_OPEN;
        eyeBtn.title = 'Show Key';
        eyeBtn.setAttribute('aria-label', 'Show key');
      }
    });

    // Add single key
    addBtn?.addEventListener('click', async () => {
      const val = keyInp?.value.trim();
      if (!val) return;
      addBtn.disabled = true;
      try {
        const res = await ipcClient.addKey(val);
        if (res.success) {
          if (keyInp) keyInp.value = '';
          showToast('Gemini API Key added successfully');
          await this.refreshKeyList();
        } else {
          showToast(`Failed to add key: ${res.error || 'Invalid key'}`);
        }
      } catch (err) {
        showToast(`Error adding key: ${err.message}`);
      } finally {
        addBtn.disabled = false;
      }
    });

    keyInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn?.click();
      }
    });

    // Toggle multi-key paste area
    multiToggleBtn?.addEventListener('click', () => {
      if (multiArea) multiArea.hidden = !multiArea.hidden;
      if (!multiArea.hidden && multiInp) multiInp.focus();
    });

    multiCancelBtn?.addEventListener('click', () => {
      if (multiArea) multiArea.hidden = true;
      if (multiInp) multiInp.value = '';
    });

    // Multi-key batch import
    multiImportBtn?.addEventListener('click', async () => {
      const text = multiInp?.value || '';
      const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 5);

      if (lines.length === 0) {
        showToast('Please enter at least one valid Gemini key');
        return;
      }

      multiImportBtn.disabled = true;
      try {
        const res = await ipcClient.addKeysBatch(lines);
        if (res.success) {
          const count = res.addedCount ?? res.count ?? 0;
          const dupInfo = res.duplicates ? ` (${res.duplicates} duplicates)` : '';
          const invInfo = res.invalid ? ` (${res.invalid} invalid)` : '';
          showToast(`Imported ${count} key(s) successfully${dupInfo}${invInfo}`);
          if (multiInp) multiInp.value = '';
          if (multiArea) multiArea.hidden = true;
          await this.refreshKeyList();
        } else {
          showToast(`Batch import error: ${res.error}`);
        }
      } catch (err) {
        showToast(`Batch import failed: ${err.message}`);
      } finally {
        multiImportBtn.disabled = false;
      }
    });

    // Reset Cooldowns button
    resetCooldownsBtn?.addEventListener('click', async () => {
      resetCooldownsBtn.disabled = true;
      try {
        await ipcClient.resetKeyCooldowns();
        showToast(t('cooldownsResetSuccess') || 'All cooldowns reset');
        await this.refreshKeyList();
      } catch (err) {
        showToast(`Failed: ${err.message}`);
      } finally {
        resetCooldownsBtn.disabled = false;
      }
    });

    // Test All Keys button
    testAllBtn?.addEventListener('click', async () => {
      testAllBtn.disabled = true;
      const origText = testAllBtn.textContent;
      testAllBtn.textContent = 'Testing...';
      try {
        const res = await ipcClient.testAllKeys();
        if (res && res.success && Array.isArray(res.results)) {
          const validCount = res.results.filter(r => r.valid).length;
          const total = res.results.length;
          showToast(`Tested ${total} key(s): ${validCount} Valid, ${total - validCount} Failed`);
        } else {
          showToast('Failed to test keys');
        }
        await this.refreshKeyList();
      } catch (err) {
        showToast(`Error: ${err.message}`);
      } finally {
        testAllBtn.disabled = false;
        testAllBtn.textContent = origText;
      }
    });

    // Groq Key Save
    groqKeySaveBtn?.addEventListener('click', async () => {
      const val = groqKeyInp?.value.trim() || '';
      try {
        await ipcClient.updateSettings({ groqApiKey: val });
        showToast('Groq Whisper API Key saved successfully');
      } catch (err) {
        showToast(`Failed to save Groq key: ${err.message}`);
      }
    });

    // Real-time keys status event listener from backend
    ipcClient.on('keys:status', () => {
      this.refreshKeyList();
    });

    // Gemini settings change
    transModelSel?.addEventListener('change', () => markDirtyFn());
    translateModelSel?.addEventListener('change', () => markDirtyFn());
    concurrencyInp?.addEventListener('change', () => markDirtyFn());
    concurrencyInp?.addEventListener('input', () => markDirtyFn());
    batchSizeInp?.addEventListener('change', () => markDirtyFn());
    batchSizeInp?.addEventListener('input', () => markDirtyFn());
  },

  async load(settings) {
    const gemini = settings?.gemini || {};

    const transModelSel = document.getElementById('setGeminiTransModel');
    const translateModelSel = document.getElementById('setGeminiTranslateModel');
    const concurrencyInp = document.getElementById('setGeminiConcurrency');
    const batchSizeInp = document.getElementById('setGeminiBatchSize');
    const groqKeyInp = document.getElementById('setGroqKeyInp');

    if (transModelSel) transModelSel.value = gemini.transcriptionModel || 'gemini-3.8-flash';
    if (translateModelSel) translateModelSel.value = gemini.translationModel || 'gemini-3.8-flash';
    if (concurrencyInp) concurrencyInp.value = gemini.maxConcurrency ?? 4;
    if (batchSizeInp) batchSizeInp.value = gemini.batchSize ?? 30;
    if (groqKeyInp && settings?.groqApiKey) groqKeyInp.value = settings.groqApiKey;

    await this.refreshKeyList();
  },

  async refreshKeyList() {
    const listContainer = document.getElementById('setKeyListContainer');
    const summaryTxt = document.getElementById('setKeysSummaryTxt');
    const navBadge = document.getElementById('navKeyBadge');
    const statusFooter = document.getElementById('keysStatus');

    try {
      const [keys, status] = await Promise.all([
        ipcClient.listKeys(),
        ipcClient.getKeysStatus()
      ]);

      const avail = status?.available ?? 0;
      const total = status?.total ?? 0;

      if (summaryTxt) {
        summaryTxt.textContent = t('keysAvailableSummary', { avail, total });
      }
      if (navBadge) {
        navBadge.textContent = String(avail);
      }
      if (statusFooter) {
        statusFooter.textContent = `Keys ${avail}/${total}`;
      }

      if (!listContainer) return;
      listContainer.innerHTML = '';

      if (!keys || keys.length === 0) {
        listContainer.innerHTML = `<div class="muted" style="font-size:11px; padding:8px 4px;">${t('noKeysYet')}</div>`;
        return;
      }

      keys.forEach(k => {
        const item = document.createElement('div');
        item.className = 'key-item';

        const isCooldown = k.status === 'cooldown';
        const isError = k.status === 'error';
        const isWarning = k.status === 'warning';
        let badgeClass = 'badge-active';
        let badgeIcon = '\u25cf';
        let badgeText = t('keyActive');
        if (isCooldown) {
          badgeClass = 'badge-cooldown';
          badgeIcon = '\u23f1';
          badgeText = `${t('keyCooldown')} (${k.cooldownRemainingSec}s)`;
        } else if (isError) {
          badgeClass = 'badge-error';
          badgeIcon = '\u2715';
          badgeText = t('keyError');
        } else if (isWarning) {
          badgeClass = 'badge-cooldown';
          badgeIcon = '⚠';
          badgeText = t('keyWarning');
        }

        let lastUsedFormatted = t('never');
        if (k.lastUsed) {
          const d = new Date(k.lastUsed);
          lastUsedFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        item.innerHTML = `
          <div class="key-item-info">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="key-item-name">${k.masked}</span>
              <span class="key-badge ${badgeClass}" title="${badgeText}">${badgeIcon} ${badgeText}</span>
            </div>
            <div class="key-item-meta">${t('lastUsedLabel')}: ${lastUsedFormatted} | ${t('errorsLabel')}: ${k.errorCount || 0}</div>
          </div>
          <div class="key-item-actions">
            <button class="btn test-btn">${t('testKey')}</button>
            <button class="btn danger del-btn" aria-label="${t('deleteKey')}">${t('deleteKey')}</button>
          </div>
        `;

        const testBtn = item.querySelector('.test-btn');
        testBtn?.addEventListener('click', async () => {
          testBtn.disabled = true;
          testBtn.textContent = 'Testing...';
          try {
            const res = await ipcClient.testKey(k.id);
            if (res && res.valid) {
              testBtn.textContent = '✓ OK';
              testBtn.style.color = '#34d399';
              showToast(`Key is valid ✓ (${res.modelsCount || 0} models available)`);
            } else {
              testBtn.textContent = '✗ Fail';
              testBtn.style.color = 'var(--danger)';
              showToast(`Key invalid: ${res?.error || 'Validation failed'}`);
            }
            await this.refreshKeyList();
          } catch (e) {
            testBtn.textContent = 'Error';
          } finally {
            setTimeout(() => {
              testBtn.disabled = false;
              testBtn.textContent = t('testKey');
              testBtn.style.color = '';
            }, 3000);
          }
        });

        // Inline confirm step for delete
        const delBtn = item.querySelector('.del-btn');
        delBtn?.addEventListener('click', () => {
          const actions = item.querySelector('.key-item-actions');
          if (!actions) return;
          // Show confirm
          actions.innerHTML = `
            <span style="font-size:var(--fs-xs); color:var(--muted-aa);">${t('deletePrompt')}</span>
            <button class="btn danger confirm-yes" style="padding:2px 10px;">${t('yes')}</button>
            <button class="btn confirm-no" style="padding:2px 10px;">${t('no')}</button>
          `;
          actions.querySelector('.confirm-yes')?.addEventListener('click', async () => {
            await ipcClient.removeKey(k.id);
            showToast('Key deleted');
            await this.refreshKeyList();
          });
          actions.querySelector('.confirm-no')?.addEventListener('click', () => {
            // Restore original buttons
            actions.innerHTML = `<button class="btn test-btn">${t('testKey')}</button><button class="btn danger del-btn" aria-label="${t('deleteKey')}">${t('deleteKey')}</button>`;
            actions.querySelector('.test-btn')?.addEventListener('click', () => testBtn.click());
            actions.querySelector('.del-btn')?.addEventListener('click', () => delBtn.click());
          });
        });

        listContainer.appendChild(item);
      });

    } catch (err) {
      console.error('Failed to refresh key list:', err);
    }
  },

  getData() {
    const transModelSel = document.getElementById('setGeminiTransModel');
    const translateModelSel = document.getElementById('setGeminiTranslateModel');
    const concurrencyInp = document.getElementById('setGeminiConcurrency');
    const batchSizeInp = document.getElementById('setGeminiBatchSize');

    return {
      transcriptionModel: transModelSel?.value || 'gemini-3.8-flash',
      translationModel: translateModelSel?.value || 'gemini-3.8-flash',
      maxConcurrency: Math.max(1, Math.min(8, parseInt(concurrencyInp?.value || '4', 10))),
      batchSize: Math.max(5, Math.min(100, parseInt(batchSizeInp?.value || '30', 10))),
      temperature: 0.2
    };
  }
};
