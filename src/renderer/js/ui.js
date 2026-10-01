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

export const showToast = (msg, d) => ui.showToast(msg, d);
