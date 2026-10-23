/**
 * Settings Section: CodeCraft API Providers
 * Manages CodeCraft API credentials, base URL, model selections
 * (Claude, GPT, DeepSeek, Gemini, Whisper), connection testing,
 * and translation/ASR performance parameters.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};

export const sectionCodecraft = {
  id: 'secCodecraft',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const apiKeyInp = document.getElementById('setCodecraftApiKey');
    const eyeBtn = document.getElementById('setCodecraftEyeBtn');
    const baseUrlInp = document.getElementById('setCodecraftBaseUrl');
    const transModelSel = document.getElementById('setCodecraftTransModel');
    const customModelInp = document.getElementById('setCodecraftCustomModel');
    const asrModelSel = document.getElementById('setCodecraftAsrModel');
    const batchSizeInp = document.getElementById('setCodecraftBatchSize');
    const tempInp = document.getElementById('setCodecraftTemp');
    const testBtn = document.getElementById('setCodecraftTestBtn');
    const statusBadge = document.getElementById('setCodecraftStatusBadge');
    const statusDesc = document.getElementById('setCodecraftStatusDesc');
    const navBadge = document.getElementById('navCodecraftBadge');

    // SVGs for eye toggle
    const SVG_EYE_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const SVG_EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    // Show / Hide Key Toggle
    eyeBtn?.addEventListener('click', () => {
      if (!apiKeyInp) return;
      if (apiKeyInp.type === 'password') {
        apiKeyInp.type = 'text';
        eyeBtn.innerHTML = SVG_EYE_OFF;
        eyeBtn.title = 'Hide Key';
        eyeBtn.setAttribute('aria-label', 'Hide key');
      } else {
        apiKeyInp.type = 'password';
        eyeBtn.innerHTML = SVG_EYE_OPEN;
        eyeBtn.title = 'Show Key';
        eyeBtn.setAttribute('aria-label', 'Show key');
      }
    });

    // Toggle Custom Model input
    transModelSel?.addEventListener('change', () => {
      if (!transModelSel || !customModelInp) return;
      if (transModelSel.value === 'custom') {
        customModelInp.style.display = 'block';
        customModelInp.focus();
      } else {
        customModelInp.style.display = 'none';
      }
      markDirtyFn();
    });

    // Mark dirty listeners
    apiKeyInp?.addEventListener('input', () => {
      markDirtyFn();
      if (navBadge) {
        navBadge.hidden = !apiKeyInp.value.trim();
      }
    });

    baseUrlInp?.addEventListener('input', () => markDirtyFn());
    customModelInp?.addEventListener('input', () => markDirtyFn());
    asrModelSel?.addEventListener('change', () => markDirtyFn());
    batchSizeInp?.addEventListener('input', () => markDirtyFn());
    tempInp?.addEventListener('input', () => markDirtyFn());

    // Connection Test
    testBtn?.addEventListener('click', async () => {
      const key = (apiKeyInp?.value || '').trim();
      const baseUrl = (baseUrlInp?.value || 'https://codecraftapi.com/v1').trim();
      let model = transModelSel?.value || 'gemini-3.7-flash';
      if (model === 'custom' && customModelInp?.value.trim()) {
        model = customModelInp.value.trim();
      }

      if (!key) {
        showToast(t('enterApiKeyFirst') || 'សូមបញ្ចូល CodeCraft API Key ជាមុនសិន');
        apiKeyInp?.focus();
        return;
      }

      testBtn.disabled = true;
      const origText = testBtn.innerHTML;
      testBtn.innerHTML = `<span>⏳ កំពុងតេស្ត...</span>`;

      if (statusBadge) {
        statusBadge.textContent = 'កំពុងតេស្ត... (Testing...)';
        statusBadge.style.background = 'rgba(234, 179, 8, 0.2)';
        statusBadge.style.color = '#facc15';
      }

      try {
        const res = await ipcClient.testCodecraftConnection({
          apiKey: key,
          baseUrl,
          model
        });

        if (res && res.success) {
          if (statusBadge) {
            statusBadge.textContent = '✓ បានភ្ជាប់ជោគជ័យ (Connected)';
            statusBadge.style.background = 'rgba(45, 212, 191, 0.2)';
            statusBadge.style.color = '#2dd4bf';
          }
          if (statusDesc) {
            statusDesc.textContent = res.message || 'CodeCraft API is operational and responded successfully.';
          }
          if (navBadge) {
            navBadge.hidden = false;
            navBadge.style.color = '#2dd4bf';
          }
          if (Array.isArray(res.models) && res.models.length > 0 && transModelSel) {
            const existingValues = new Set([...transModelSel.options].map(o => o.value));
            const customOpt = transModelSel.querySelector('option[value="custom"]');
            for (const mId of res.models) {
              if (!existingValues.has(mId) && !mId.includes('whisper')) {
                const opt = document.createElement('option');
                opt.value = mId;
                opt.textContent = `${mId}`;
                if (customOpt) {
                  transModelSel.insertBefore(opt, customOpt);
                } else {
                  transModelSel.appendChild(opt);
                }
                existingValues.add(mId);
              }
            }
          }
          showToast(t('codecraftConnected') || '✓ បានភ្ជាប់ទៅកាន់ CodeCraft API ជោគជ័យ!');
        } else {
          if (statusBadge) {
            statusBadge.textContent = '✕ បរាជ័យ (Failed)';
            statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            statusBadge.style.color = '#ef4444';
          }
          if (statusDesc) {
            statusDesc.textContent = res.error || 'CodeCraft connection test failed.';
          }
          showToast(res.error || 'CodeCraft connection test failed');
        }
      } catch (err) {
        if (statusBadge) {
          statusBadge.textContent = '✕ Error';
          statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
          statusBadge.style.color = '#ef4444';
        }
        showToast(`Test error: ${err.message}`);
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = origText;
      }
    });
  },

  load(settings) {
    const config = settings?.codecraft || {};

    const apiKeyInp = document.getElementById('setCodecraftApiKey');
    const baseUrlInp = document.getElementById('setCodecraftBaseUrl');
    const transModelSel = document.getElementById('setCodecraftTransModel');
    const customModelInp = document.getElementById('setCodecraftCustomModel');
    const asrModelSel = document.getElementById('setCodecraftAsrModel');
    const batchSizeInp = document.getElementById('setCodecraftBatchSize');
    const tempInp = document.getElementById('setCodecraftTemp');
    const navBadge = document.getElementById('navCodecraftBadge');
    const statusBadge = document.getElementById('setCodecraftStatusBadge');

    if (apiKeyInp) apiKeyInp.value = config.apiKey || '';
    if (baseUrlInp) baseUrlInp.value = config.baseUrl || 'https://codecraftapi.com/v1';

    const savedModel = config.translationModel || 'gemini-3.7-flash';
    if (transModelSel) {
      let found = false;
      for (const opt of transModelSel.options) {
        if (opt.value === savedModel) {
          transModelSel.value = savedModel;
          found = true;
          break;
        }
      }
      if (!found && customModelInp) {
        transModelSel.value = 'custom';
        customModelInp.style.display = 'block';
        customModelInp.value = savedModel;
      } else if (customModelInp) {
        customModelInp.style.display = 'none';
        customModelInp.value = '';
      }
    }

    if (asrModelSel && config.asrModel) asrModelSel.value = config.asrModel;
    if (batchSizeInp && config.batchSize) batchSizeInp.value = config.batchSize;
    if (tempInp && config.temperature != null) tempInp.value = config.temperature;

    if (navBadge) {
      navBadge.hidden = !config.apiKey;
    }

    if (statusBadge) {
      if (config.apiKey) {
        statusBadge.textContent = 'បានកំណត់ (Configured)';
        statusBadge.style.background = 'rgba(45, 212, 191, 0.15)';
        statusBadge.style.color = '#2dd4bf';
      } else {
        statusBadge.textContent = 'មិនទាន់ភ្ជាប់ (Not Connected)';
        statusBadge.style.background = 'rgba(255, 255, 255, 0.08)';
        statusBadge.style.color = 'var(--muted)';
      }
    }
  },

  getData() {
    const apiKeyInp = document.getElementById('setCodecraftApiKey');
    const baseUrlInp = document.getElementById('setCodecraftBaseUrl');
    const transModelSel = document.getElementById('setCodecraftTransModel');
    const customModelInp = document.getElementById('setCodecraftCustomModel');
    const asrModelSel = document.getElementById('setCodecraftAsrModel');
    const batchSizeInp = document.getElementById('setCodecraftBatchSize');
    const tempInp = document.getElementById('setCodecraftTemp');

    let translationModel = transModelSel?.value || 'gemini-3.7-flash';
    if (translationModel === 'custom' && customModelInp?.value.trim()) {
      translationModel = customModelInp.value.trim();
    }

    return {
      codecraft: {
        apiKey: (apiKeyInp?.value || '').trim(),
        baseUrl: (baseUrlInp?.value || 'https://codecraftapi.com/v1').trim(),
        translationModel,
        asrModel: asrModelSel?.value || 'whisper-1',
        batchSize: Number(batchSizeInp?.value) || 25,
        temperature: parseFloat(tempInp?.value) || 0.2
      }
    };
  }
};
