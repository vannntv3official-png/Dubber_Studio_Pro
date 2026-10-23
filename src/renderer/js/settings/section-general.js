/**
 * Settings Section: General
 * Manages UI language, target translation language, default project folder,
 * TTS audio cache, autosave interval, and deletion confirmation.
 */

import { ipcClient } from '../ipc-client.js';
import { i18n, t } from '../i18n.js';
import { showToast } from '../ui.js';

let markDirtyFn = () => {};

export const sectionGeneral = {
  id: 'secGeneral',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const langSel = document.getElementById('setGenLang');
    const targetLangSel = document.getElementById('setGenTargetLang');
    const browseBtn = document.getElementById('setGenProjectDirBrowseBtn');
    const clearCacheBtn = document.getElementById('setGenClearCacheBtn');
    const autosaveSel = document.getElementById('setGenAutosave');
    const confirmDel = document.getElementById('setGenConfirmDelete');
    const startupActionSel = document.getElementById('setGenStartupAction');

    langSel?.addEventListener('change', () => {
      markDirtyFn();
      // Apply language immediately for live preview
      i18n.setLanguage(langSel.value);
    });

    targetLangSel?.addEventListener('change', () => markDirtyFn());
    autosaveSel?.addEventListener('change', () => markDirtyFn());
    confirmDel?.addEventListener('change', () => markDirtyFn());
    startupActionSel?.addEventListener('change', () => markDirtyFn());

    const dirInpEl = document.getElementById('setGenProjectDir');
    dirInpEl?.addEventListener('input', () => markDirtyFn());
    dirInpEl?.addEventListener('change', () => markDirtyFn());

    browseBtn?.addEventListener('click', async () => {
      try {
        const res = await ipcClient.selectFolder();
        if (res && res.path) {
          const dirInp = document.getElementById('setGenProjectDir');
          if (dirInp) {
            dirInp.value = res.path;
            markDirtyFn();
          }
        }
      } catch (err) {
        showToast(`Folder selection failed: ${err.message}`);
      }
    });

    clearCacheBtn?.addEventListener('click', async () => {
      clearCacheBtn.disabled = true;
      try {
        const res = await ipcClient.clearCache();
        if (res.success) {
          showToast(t('cacheCleared') || 'TTS cache cleared successfully');
          await this.refreshCacheSize();
        } else {
          showToast(`Clear cache failed: ${res.error}`);
        }
      } catch (err) {
        showToast(`Clear cache error: ${err.message}`);
      } finally {
        clearCacheBtn.disabled = false;
      }
    });
  },

  async load(settings) {
    const general = settings?.general || {};

    const langSel = document.getElementById('setGenLang');
    const targetLangSel = document.getElementById('setGenTargetLang');
    const dirInp = document.getElementById('setGenProjectDir');
    const autosaveSel = document.getElementById('setGenAutosave');
    const confirmDel = document.getElementById('setGenConfirmDelete');
    const startupActionSel = document.getElementById('setGenStartupAction');

    if (langSel) langSel.value = general.uiLanguage || 'km';
    if (targetLangSel) targetLangSel.value = general.targetLanguage || 'Khmer';
    if (dirInp) dirInp.value = general.defaultProjectFolder || '';
    if (autosaveSel) autosaveSel.value = String(general.autosaveIntervalSec ?? 30);
    if (confirmDel) confirmDel.checked = general.confirmDelete !== false;
    if (startupActionSel) startupActionSel.value = general.startupAction || 'startScreen';

    await this.refreshCacheSize();
  },

  async refreshCacheSize() {
    const cacheTxt = document.getElementById('setGenCacheSizeTxt');
    if (!cacheTxt) return;
    try {
      const res = await ipcClient.getCacheSize();
      if (res && typeof res.formattedSize === 'string') {
        cacheTxt.textContent = `${res.formattedSize} (${res.count || 0} files)`;
      } else {
        cacheTxt.textContent = '0 B';
      }
    } catch (_) {
      cacheTxt.textContent = 'Unknown';
    }
  },

  getData() {
    const langSel = document.getElementById('setGenLang');
    const targetLangSel = document.getElementById('setGenTargetLang');
    const dirInp = document.getElementById('setGenProjectDir');
    const autosaveSel = document.getElementById('setGenAutosave');
    const confirmDel = document.getElementById('setGenConfirmDelete');
    const startupActionSel = document.getElementById('setGenStartupAction');

    return {
      uiLanguage: langSel?.value || 'km',
      targetLanguage: targetLangSel?.value || 'Khmer',
      startupAction: startupActionSel?.value || 'startScreen',
      defaultProjectFolder: dirInp?.value || '',
      autosaveIntervalSec: parseInt(autosaveSel?.value || '30', 10),
      confirmDelete: confirmDel ? confirmDel.checked : true
    };
  }
};
