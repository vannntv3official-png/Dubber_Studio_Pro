/**
 * Settings Section: System & Diagnostics
 * Manages system diagnostics inspection, Copy Diagnostics to clipboard,
 * application log inspection, open logs folder, export logs archive,
 * and FFmpeg thread configuration.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};
let cachedDiagnostics = null;

export function updateDeveloperModeUI(isDevMode) {
  // 1. ASR engine selects
  ['setAsrEngineSelect', 'transEngineSelect'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const mockOpt = sel.querySelector('option[value="mock"]');
    if (mockOpt) {
      mockOpt.hidden = !isDevMode;
      mockOpt.style.display = isDevMode ? '' : 'none';
      if (!isDevMode && sel.value === 'mock') {
        sel.value = 'faster-whisper';
      }
    }
  });

  // 2. Translation model select
  const transModelSel = document.getElementById('translateModelSelect');
  if (transModelSel) {
    const mockOpt = transModelSel.querySelector('option[value="mock"]');
    if (mockOpt) {
      mockOpt.hidden = !isDevMode;
      mockOpt.style.display = isDevMode ? '' : 'none';
      if (!isDevMode && transModelSel.value === 'mock') {
        transModelSel.value = 'gemini-3.8-flash';
      }
    }
  }

  // 3. TTS engine select
  const ttsEngineSel = document.getElementById('setTtsEngineSelect');
  if (ttsEngineSel) {
    const mockOpt = ttsEngineSel.querySelector('option[value="mock"]');
    if (mockOpt) {
      mockOpt.hidden = !isDevMode;
      mockOpt.style.display = isDevMode ? '' : 'none';
      if (!isDevMode && ttsEngineSel.value === 'mock') {
        ttsEngineSel.value = 'edge-tts';
      }
    }
  }

  // 4. Separation engine select
  const sepEngineSel = document.getElementById('setSepEngineSelect');
  if (sepEngineSel) {
    const mockOpt = sepEngineSel.querySelector('option[value="mock"]');
    if (mockOpt) {
      mockOpt.hidden = !isDevMode;
      mockOpt.style.display = isDevMode ? '' : 'none';
      if (!isDevMode && sepEngineSel.value === 'mock') {
        sepEngineSel.value = 'demucs';
      }
    }
  }
}

export const sectionSystem = {
  id: 'secSystem',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const copyBtn = document.getElementById('setSysCopyDiagBtn');
    const openLogsBtn = document.getElementById('setSysOpenLogsBtn');
    const exportLogsBtn = document.getElementById('setSysExportLogsBtn');
    const ffmpegThreadsSel = document.getElementById('setSysFfmpegThreads');
    const devModeCheck = document.getElementById('setSysDeveloperMode');
    const sepEngineSel = document.getElementById('setSepEngineSelect');

    ffmpegThreadsSel?.addEventListener('change', () => markDirtyFn());
    sepEngineSel?.addEventListener('change', () => markDirtyFn());

    devModeCheck?.addEventListener('change', () => {
      markDirtyFn();
      updateDeveloperModeUI(Boolean(devModeCheck.checked));
      showToast(devModeCheck.checked ? 'Developer mode enabled: MOCK providers visible' : 'Developer mode disabled: MOCK providers hidden');
    });

    openLogsBtn?.addEventListener('click', async () => {
      try {
        await ipcClient.openLogsFolder();
      } catch (err) {
        showToast(`Failed to open logs folder: ${err.message}`);
      }
    });

    exportLogsBtn?.addEventListener('click', async () => {
      exportLogsBtn.disabled = true;
      try {
        const res = await ipcClient.exportLogs();
        if (res && res.success) {
          showToast(`Logs exported to: ${res.path}`);
        } else if (res && res.error) {
          showToast(`Export failed: ${res.error}`);
        }
      } catch (err) {
        showToast(`Export error: ${err.message}`);
      } finally {
        exportLogsBtn.disabled = false;
      }
    });

    copyBtn?.addEventListener('click', async () => {
      if (!cachedDiagnostics) return;
      try {
        const text = JSON.stringify(cachedDiagnostics, null, 2);
        await navigator.clipboard.writeText(text);
        showToast('System diagnostics copied to clipboard ✓');
      } catch (err) {
        showToast(`Failed to copy: ${err.message}`);
      }
    });
  },

  async load(settings) {
    const sys = settings?.system || {};
    const ffmpegThreadsSel = document.getElementById('setSysFfmpegThreads');
    if (ffmpegThreadsSel) {
      ffmpegThreadsSel.value = String(sys.ffmpegThreads ?? 0);
    }

    const devModeCheck = document.getElementById('setSysDeveloperMode');
    const isDevMode = Boolean(sys.developerMode);
    if (devModeCheck) {
      devModeCheck.checked = isDevMode;
    }

    const sep = settings?.separation || {};
    const sepEngineSel = document.getElementById('setSepEngineSelect');
    if (sepEngineSel) {
      sepEngineSel.value = sep.engine || 'demucs';
    }

    updateDeveloperModeUI(isDevMode);

    await this.refreshDiagnostics();
  },

  async refreshDiagnostics() {
    const grid = document.getElementById('setSysDiagnosticsGrid');
    const logPathTxt = document.getElementById('setSysLogPathTxt');
    if (!grid) return;

    try {
      const diag = await ipcClient.getDiagnostics();
      cachedDiagnostics = diag;

      if (logPathTxt && diag?.logsPath) {
        logPathTxt.textContent = `Path: ${diag.logsPath}`;
      }

      grid.innerHTML = `
        <div><strong class="muted">App Version:</strong> ${diag.appVersion || '1.0.0'}</div>
        <div><strong class="muted">Electron:</strong> ${diag.electronVersion || 'N/A'}</div>
        <div><strong class="muted">Node.js:</strong> ${diag.nodeVersion || 'N/A'}</div>
        <div><strong class="muted">Chromium:</strong> ${diag.chromeVersion || 'N/A'}</div>
        <div><strong class="muted">OS / Arch:</strong> ${diag.osPlatform} (${diag.osArch})</div>
        <div><strong class="muted">CPUs:</strong> ${diag.cpus || 4} cores</div>
        <div><strong class="muted">RAM (Free/Total):</strong> ${diag.memoryFreeMB} MB / ${diag.memoryTotalMB} MB</div>
        <div><strong class="muted">GPU / CUDA:</strong> ${diag.gpus || 'Default Display'}</div>
        <div><strong class="muted">FFmpeg:</strong> ${diag.ffmpegVersion ? 'Available ✓' : 'N/A'}</div>
        <div><strong class="muted">Faster-Whisper:</strong> ${diag.fasterWhisperAvailable ? 'Installed ✓' : 'Not installed'}</div>
      `;
    } catch (err) {
      grid.innerHTML = `<div style="color:#ef4444;">Failed to load system diagnostics: ${err.message}</div>`;
    }
  },

  getData() {
    const ffmpegThreadsSel = document.getElementById('setSysFfmpegThreads');
    const devModeCheck = document.getElementById('setSysDeveloperMode');
    return {
      ffmpegThreads: parseInt(ffmpegThreadsSel?.value || '0', 10),
      developerMode: Boolean(devModeCheck?.checked)
    };
  },

  getSeparationData() {
    const sepEngineSel = document.getElementById('setSepEngineSelect');
    return {
      engine: sepEngineSel?.value || 'demucs'
    };
  }
};
