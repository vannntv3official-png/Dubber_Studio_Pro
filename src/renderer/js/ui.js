/**
 * UI Utilities: Toast notifications, Modals, Popovers, System Status
 */

import { state, VOICES } from './state.js';
import { i18n } from './i18n.js';
import { ipcClient } from './ipc-client.js';

let toastTimer = null;

export const ui = {
  formatTime(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const m = Math.floor(s / 60);
    const rem = (s % 60).toFixed(2);
    return `${String(m).padStart(2, '0')}:${rem.padStart(5, '0')}`;
  },

  showToast(message, durationMs = 2000, action = null) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerHTML = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    el.appendChild(textSpan);

    if (action && typeof action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.className = 'toast-action-btn';
      btn.style.marginLeft = '12px';
      btn.style.padding = '2px 8px';
      btn.style.background = 'var(--accent, #10b981)';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = 'bold';
      btn.textContent = action.text || 'Undo';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(toastTimer);
        el.classList.remove('show');
        action.onClick();
      });
      el.appendChild(btn);
    }

    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, durationMs);
  },

  showError(rawError, context = '') {
    const errorStr = String(rawError?.message || rawError?.error || rawError || 'Unknown error');
    const isKm = i18n.currentLang === 'km';

    let userMessage = '';
    let recommendation = '';

    if (errorStr.includes('No Gemini API keys') || errorStr.includes('API key')) {
      userMessage = isKm ? 'មិនទាន់មាន Gemini API Key នៅឡើយទេ' : 'No Gemini API key configured';
      recommendation = isKm ? 'សូមចូលទៅកាន់ ការកំណត់ > Gemini Keys ដើម្បីបន្ថែម Key' : 'Please open Settings > Gemini Keys to add an API key';
    } else if (errorStr.includes('quota') || errorStr.includes('RESOURCE_EXHAUSTED')) {
      userMessage = isKm ? 'អស់កូតាប្រើប្រាស់ API (Quota Exceeded)' : 'API quota limit exceeded';
      recommendation = isKm ? 'សូមរង់ចាំបន្តិច ឬបន្ថែម API Key ផ្សេងទៀត' : 'Please wait a moment or add an additional API key in Settings';
    } else if (errorStr.includes('cancelled') || errorStr.includes('Cancelled')) {
      userMessage = isKm ? 'ប្រតិបត្តិការត្រូវបានបោះបង់' : 'Operation was cancelled';
      recommendation = isKm ? 'អ្នកអាចចាប់ផ្តើមម្តងទៀតនៅពេលណាក៏បាន' : 'You can restart the operation anytime';
    } else if (errorStr.includes('ENOSPC') || errorStr.includes('disk') || errorStr.includes('space')) {
      userMessage = isKm ? 'ទំហំថាសរឹងមិនគ្រប់គ្រាន់ (Disk Full)' : 'Insufficient disk storage space';
      recommendation = isKm ? 'សូមពិនិត្យទំហំផ្ទុកនៅលើកុំព្យូទ័ររបស់អ្នក' : 'Please free up disk storage space and retry';
    } else if (errorStr.includes('network') || errorStr.includes('fetch') || errorStr.includes('No audio was received')) {
      userMessage = isKm ? 'បញ្ហាតភ្ជាប់បណ្តាញអ៊ីនធឺណិត ឬសេវា TTS' : 'Network connection or TTS service issue';
      recommendation = isKm ? 'សូមពិនិត្យអ៊ីនធឺណិតរបស់អ្នក ហើយព្យាយាមម្តងទៀត' : 'Please check your internet connection and retry';
    } else {
      userMessage = isKm ? `កំហុស៖ ${errorStr.slice(0, 60)}` : `Error: ${errorStr.slice(0, 60)}`;
      recommendation = isKm ? 'សូមពិនិត្យព័ត៌មានលម្អិត ឬព្យាយាមម្តងទៀត' : 'Please check details or retry';
    }

    const fullDetails = `Error: ${errorStr}\nContext: ${context}\nTimestamp: ${new Date().toISOString()}\nPlatform: ${navigator.platform}`;
    const displayMsg = `${userMessage}. ${recommendation}`;

    this.showToast(displayMsg, 6000, {
      text: isKm ? '📋 ចម្លង' : '📋 Copy details',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(fullDetails);
          this.showToast(isKm ? '✓ បានចម្លងព័ត៌មានលម្អិត' : '✓ Copied error details to clipboard', 2000);
        } catch (_) {}
      }
    });
  },

  openFindReplaceModal() {
    const modal = document.getElementById('frModal');
    const input = document.getElementById('fInp');
    if (modal) {
      modal.classList.add('open');
      setTimeout(() => input?.focus(), 50);
    }
  },

  closeFindReplaceModal() {
    const modal = document.getElementById('frModal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  openWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.classList.add('open');
  },

  closeWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.classList.remove('open');
  },

  toggleCastPopover() {
    const pop = document.getElementById('pop');
    if (!pop) return;

    const isHidden = !pop.hidden;
    pop.hidden = isHidden;

    if (!isHidden) {
      // Render Cast distribution
      pop.innerHTML = VOICES.map((v, idx) => {
        const count = state.rows.filter(r => r.v === idx).length;
        const rowsLabel = i18n.t('rowsCount', { count });
        return `<div>
          <span>
            <span class="tag" style="background:${v[3]}">${v[0]}</span>
            ${v[1]} <span class="g ${v[2]}">${v[2]}</span>
          </span>
          <span class="muted">${rowsLabel}</span>
        </div>`;
      }).join('');
    }
  },

  hideCastPopover() {
    const pop = document.getElementById('pop');
    if (pop) pop.hidden = true;
  },

  async updateSystemStatus() {
    try {
      const mem = await ipcClient.getMemoryUsage();
      const memStatusTxt = document.getElementById('memStatusTxt');
      const memStatusEl = document.getElementById('memStatus');
      if (memStatusTxt && mem) {
        memStatusTxt.textContent = `App: ${mem.appMemoryMb || 120} MB`;
      }
      if (memStatusEl && mem) {
        memStatusEl.title = `Application Memory: ${mem.appMemoryMb || 120} MB (Combined Working Set across Main, Renderer, GPU processes) | Private Bytes: ${mem.appPrivateMb || 0} MB | System RAM: ${mem.usedSystemGb || '0'} / ${mem.totalSystemGb || '0'} GB (${mem.percentage}%)`;
      }
    } catch (_) {}
  },

  initStatusPoller() {
    this.updateSystemStatus();
    setInterval(() => this.updateSystemStatus(), 10000);
  }
};

export const showToast = (msg, d, a) => ui.showToast(msg, d, a);
export const showError = (err, ctx) => ui.showError(err, ctx);
