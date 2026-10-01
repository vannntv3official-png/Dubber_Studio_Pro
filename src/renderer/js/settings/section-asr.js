/**
 * Settings Section: Speech Recognition (ASR)
 * Manages ASR engines (Faster-Whisper, Gemini, Hybrid), model size selection,
 * hardware device selection, model status check, download with live progress bar,
 * model deletion, and hardware diagnostics display.
 */

import { ipcClient } from '../ipc-client.js';
import { showToast } from '../ui.js';
import { t } from '../i18n.js';

let markDirtyFn = () => {};
let notifyRestartRequiredFn = () => {};

export const sectionAsr = {
  id: 'secAsr',

  init(ctx) {
    if (ctx) {
      if (typeof ctx.markDirty === 'function') markDirtyFn = ctx.markDirty;
      if (typeof ctx.notifyRestartRequired === 'function') notifyRestartRequiredFn = ctx.notifyRestartRequired;
    }

    const engineSel = document.getElementById('setAsrEngineSelect');
    const modelSel = document.getElementById('setWhisperModelSelect');
    const devSel = document.getElementById('setWhisperDeviceSelect');
    const beamInp = document.getElementById('setWhisperBeam');
    const dlBtn = document.getElementById('setDownloadModelBtn');
    const delBtn = document.getElementById('setDeleteModelBtn');

    engineSel?.addEventListener('change', () => {
      markDirtyFn();
      notifyRestartRequiredFn('ASR engine changed');
    });

    devSel?.addEventListener('change', () => {
      markDirtyFn();
      notifyRestartRequiredFn('Hardware device mode changed');
    });

    beamInp?.addEventListener('change', () => markDirtyFn());

    modelSel?.addEventListener('change', async () => {
      markDirtyFn();
      await this.refreshModelStatus();
    });

    // Download button handler
    dlBtn?.addEventListener('click', async () => {
      const model = modelSel?.value || 'base';
      const progBox = document.getElementById('setModelProgressContainer');
      const progFill = document.getElementById('setModelProgressFill');
      const progMsg = document.getElementById('setModelProgressMsg');
      const progPct = document.getElementById('setModelProgressPct');

      if (progBox) progBox.hidden = false;
      if (dlBtn) dlBtn.disabled = true;
      if (delBtn) delBtn.disabled = true;

      if (progMsg) progMsg.textContent = `Downloading ${model}...`;
      if (progFill) progFill.style.width = '10%';
      if (progPct) progPct.textContent = '10%';

      try {
        const res = await ipcClient.downloadModel(model);
        if (res && res.success) {
          showToast(`Model ${model} downloaded successfully!`);
          await this.refreshModelStatus();
        } else {
          showToast(`Download failed: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        showToast(`Download error: ${err.message}`);
      } finally {
        if (dlBtn) dlBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
        if (progBox) progBox.hidden = true;
      }
    });

    // Delete button handler
    delBtn?.addEventListener('click', async () => {
      const model = modelSel?.value || 'base';
      if (!confirm(`Are you sure you want to delete the downloaded model '${model}'?`)) {
        return;
      }

      delBtn.disabled = true;
      try {
        const res = await ipcClient.deleteModel(model);
        if (res && res.success) {
          showToast(`Model ${model} deleted`);
          await this.refreshModelStatus();
        } else {
          showToast(`Delete failed: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        showToast(`Error deleting model: ${err.message}`);
      } finally {
        delBtn.disabled = false;
      }
    });

    // Download progress listener
    ipcClient.on('asr:download-progress', (prog) => {
      const progBox = document.getElementById('setModelProgressContainer');
      const progFill = document.getElementById('setModelProgressFill');
      const progMsg = document.getElementById('setModelProgressMsg');
      const progPct = document.getElementById('setModelProgressPct');

      if (progBox) progBox.hidden = false;
      const pct = Math.min(100, Math.max(0, prog?.percent || 0));
      if (progFill) progFill.style.width = `${pct}%`;
      if (progPct) progPct.textContent = `${pct}%`;
      if (progMsg && prog?.message) progMsg.textContent = prog.message;
    });
  },

  async load(settings) {
    const asr = settings?.asr || {};

    const engineSel = document.getElementById('setAsrEngineSelect');
    const modelSel = document.getElementById('setWhisperModelSelect');
    const devSel = document.getElementById('setWhisperDeviceSelect');
    const beamInp = document.getElementById('setWhisperBeam');

    if (engineSel) engineSel.value = asr.engine || 'faster-whisper';
    if (modelSel) modelSel.value = asr.whisperModel || 'base';
    if (devSel) devSel.value = asr.whisperDevice || 'auto';
    if (beamInp) beamInp.value = asr.beamSize ?? 5;

    await Promise.all([
      this.loadHardwareInfo(),
      this.refreshModelStatus()
    ]);
  },

  async loadHardwareInfo() {
    const hwCard = document.getElementById('setHwInfoCard');
    if (!hwCard) return;

    try {
      const hw = await ipcClient.getHardware();
      if (!hw) {
        hwCard.textContent = 'Hardware info unavailable';
        return;
      }

      const cudaBadge = hw.cuda_available
        ? `<span style="color:#10b981; font-weight:600;">✓ CUDA GPU Accelerated (${hw.gpus?.[0]?.name || 'NVIDIA GPU'})</span>`
        : `<span style="color:var(--muted);">CPU Mode (CUDA not available)</span>`;

      hwCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span><strong>Hardware Acceleration:</strong> ${cudaBadge}</span>
          <span style="font-size:10px; color:var(--muted);">Platform: ${hw.platform || 'Windows'}</span>
        </div>
        <div style="font-size:10.5px; color:var(--muted);">
          <span>CPU Threads: <strong>${hw.cpu_threads || 4}</strong></span>
          <span style="margin:0 8px;">|</span>
          <span>Recommended Compute: <strong>${hw.recommended_compute_type || 'int8'}</strong></span>
        </div>
      `;
    } catch (_) {
      hwCard.textContent = 'Failed to inspect hardware';
    }
  },

  async refreshModelStatus() {
    const modelSel = document.getElementById('setWhisperModelSelect');
    const statusTxt = document.getElementById('setModelStatusTxt');
    const pathTxt = document.getElementById('setModelPathTxt');
    const dlBtn = document.getElementById('setDownloadModelBtn');
    const delBtn = document.getElementById('setDeleteModelBtn');

    if (!modelSel || !statusTxt) return;
    const currentModel = modelSel.value;

    try {
      const status = await ipcClient.getModelStatus(currentModel);
      if (status && status.exists) {
        const sizeInfo = status.formattedSize ? ` (${status.formattedSize})` : '';
        statusTxt.textContent = `Model ${currentModel}: Downloaded & Ready ✓${sizeInfo}`;
        statusTxt.style.color = '#10b981';
        if (pathTxt) pathTxt.textContent = `Path: ${status.path || 'Local cache'}`;
        if (dlBtn) dlBtn.textContent = 'Re-download';
        if (delBtn) delBtn.hidden = false;
      } else {
        statusTxt.textContent = `Model ${currentModel}: Not downloaded locally`;
        statusTxt.style.color = 'var(--muted)';
        if (pathTxt) pathTxt.textContent = 'Path: Not present';
        if (dlBtn) dlBtn.textContent = 'Download Model';
        if (delBtn) delBtn.hidden = true;
      }
    } catch (e) {
      statusTxt.textContent = `Model ${currentModel}: Status check failed`;
      statusTxt.style.color = '#ef4444';
    }
  },

  getData() {
    const engineSel = document.getElementById('setAsrEngineSelect');
    const modelSel = document.getElementById('setWhisperModelSelect');
    const devSel = document.getElementById('setWhisperDeviceSelect');
    const beamInp = document.getElementById('setWhisperBeam');

    return {
      engine: engineSel?.value || 'faster-whisper',
      whisperModel: modelSel?.value || 'base',
      whisperDevice: devSel?.value || 'auto',
      whisperComputeType: 'auto',
      whisperLanguage: 'auto',
      beamSize: Math.max(1, Math.min(10, parseInt(beamInp?.value || '5', 10)))
    };
  }
};
