/**
 * Export Video & Intro/Outro Modals Module
 * Coordinates video rendering, audio mixing parameters, video overlay effects (blur/watermark),
 * intro/outro concatenation, and live FFmpeg progress tracking.
 */

import { state } from './state.js';
import { ipcClient } from './ipc-client.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';

let isExporting = false;
let exportModalEl = null;
let introOutroModalEl = null;

export function initExportModal() {
  exportModalEl = document.getElementById('exportModal');
  introOutroModalEl = document.getElementById('introOutroModal');

  if (!exportModalEl) return;

  // Sliders readout
  const bgmVolSlider = document.getElementById('exportBgmVol');
  const bgmVolOut = document.getElementById('exportBgmVolOut');
  bgmVolSlider?.addEventListener('input', () => {
    if (bgmVolOut) bgmVolOut.textContent = `${Number(bgmVolSlider.value).toFixed(2)}x`;
  });

  const dubVolSlider = document.getElementById('exportDubVol');
  const dubVolOut = document.getElementById('exportDubVolOut');
  dubVolSlider?.addEventListener('input', () => {
    if (dubVolOut) dubVolOut.textContent = `${Number(dubVolSlider.value).toFixed(1)}x`;
  });

  // Re-encode vs Stream-copy badge updater
  const updateModeBadge = () => {
    const badge = document.getElementById('exportModeBadge');
    if (!badge) return;

    const blurChecked = document.getElementById('exportBlurCheck')?.checked;
    const wmChecked = document.getElementById('exportWatermarkCheck')?.checked;
    const hasIntro = Boolean(document.getElementById('exportIntroInp')?.value.trim());
    const hasOutro = Boolean(document.getElementById('exportOutroInp')?.value.trim());

    const needsReencode = blurChecked || wmChecked || hasIntro || hasOutro;
    if (needsReencode) {
      badge.textContent = `⚙️ ${i18n.t('reencodeBadge')}`;
      badge.className = 'badge-reencode';
    } else {
      badge.textContent = `⚡ ${i18n.t('streamCopyBadge')}`;
      badge.className = 'badge-fast';
    }
  };

  ['exportBlurCheck', 'exportWatermarkCheck'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateModeBadge);
  });

  // Output destination file picker
  document.getElementById('exportBrowseBtn')?.addEventListener('click', async () => {
    const defaultName = `${state.project.name || 'dubbed_video'}_dubbed.mp4`;
    const res = await ipcClient.saveFileDialog(defaultName);
    if (!res.canceled && res.filePath) {
      const outputInp = document.getElementById('exportOutputInp');
      if (outputInp) outputInp.value = res.filePath;
    }
  });

  // Intro / Outro Browse in Export Modal
  document.getElementById('exportIntroBrowseBtn')?.addEventListener('click', async () => {
    const res = await ipcClient.openFileDialog('video');
    if (!res.canceled && res.filePaths?.length) {
      const inp = document.getElementById('exportIntroInp');
      if (inp) inp.value = res.filePaths[0];
      state.project.introPath = res.filePaths[0];
      updateModeBadge();
    }
  });

  document.getElementById('exportIntroClearBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('exportIntroInp');
    if (inp) inp.value = '';
    state.project.introPath = null;
    updateModeBadge();
  });

  document.getElementById('exportOutroBrowseBtn')?.addEventListener('click', async () => {
    const res = await ipcClient.openFileDialog('video');
    if (!res.canceled && res.filePaths?.length) {
      const inp = document.getElementById('exportOutroInp');
      if (inp) inp.value = res.filePaths[0];
      state.project.outroPath = res.filePaths[0];
      updateModeBadge();
    }
  });

  document.getElementById('exportOutroClearBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('exportOutroInp');
    if (inp) inp.value = '';
    state.project.outroPath = null;
    updateModeBadge();
  });

  // BGM picker button in export modal
  document.getElementById('exportPickBgmBtn')?.addEventListener('click', async () => {
    const res = await ipcClient.openFileDialog('audio');
    if (!res.canceled && res.filePaths?.length) {
      const bgmPath = res.filePaths[0];
      const loadRes = await ipcClient.loadBgm(bgmPath, state.project.projectJsonPath);
      if (loadRes.success) {
        state.project.bgmPath = loadRes.audioPath;
        state.bgmPeaks = loadRes.peaks || [];
        const nameEl = document.getElementById('exportBgmName');
        if (nameEl) nameEl.textContent = bgmPath.split(/[\\/]/).pop();
        state.emit('change', { source: 'bgmLoaded' });
        ui.showToast(i18n.t('bgmLoaded'));
      }
    }
  });

  // Close / Dismiss buttons
  const closeBtn = document.getElementById('exportCloseBtn');
  const dismissBtn = document.getElementById('exportDismissBtn');
  const cancelJobBtn = document.getElementById('exportCancelJobBtn');
  const startBtn = document.getElementById('exportStartBtn');

  const closeDialog = () => {
    if (isExporting) {
      if (!confirm('Export is in progress. Do you want to cancel and exit?')) return;
      ipcClient.cancelExport();
      isExporting = false;
    }
    exportModalEl.classList.remove('open');
  };

  closeBtn?.addEventListener('click', closeDialog);
  dismissBtn?.addEventListener('click', closeDialog);
  exportModalEl?.addEventListener('click', (e) => {
    if (e.target === exportModalEl) closeDialog();
  });

  // Cancel running export
  cancelJobBtn?.addEventListener('click', async () => {
    if (!isExporting) return;
    await ipcClient.cancelExport();
    isExporting = false;
    ui.showToast(i18n.t('exportCancelled'));
    resetExportUi();
  });

  // Start Export Button
  startBtn?.addEventListener('click', async () => {
    await runExportProcess();
  });

  // Subscribe to real-time progress events from main process
  ipcClient.on('export:progress', (data) => {
    if (!data) return;
    const pct = Math.max(0, Math.min(100, Math.round(data.percent || 0)));
    const fillEl = document.getElementById('exportProgressFill');
    const pctEl = document.getElementById('exportProgressPct');
    const msgEl = document.getElementById('exportProgressMsg');
    const detailsEl = document.getElementById('exportProgressDetails');

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (msgEl && data.message) msgEl.textContent = data.message;

    if (detailsEl) {
      const fpsText = data.fps ? `FPS: ${Math.round(data.fps)}` : '';
      const timeText = data.timeSec ? `Time: ${ui.formatTime(data.timeSec)}` : '';
      detailsEl.textContent = [fpsText, timeText].filter(Boolean).join(' | ') || 'Processing...';
    }
  });

  // Init Intro/Outro Dedicated Modal
  initIntroOutroModal();
}

function resetExportUi() {
  const container = document.getElementById('exportProgressContainer');
  const startBtn = document.getElementById('exportStartBtn');
  const cancelBtn = document.getElementById('exportCancelJobBtn');
  const dismissBtn = document.getElementById('exportDismissBtn');
  const statusTxt = document.getElementById('exportStatusText');

  if (container) container.hidden = true;
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.hidden = false;
  }
  if (cancelBtn) cancelBtn.hidden = true;
  if (dismissBtn) dismissBtn.disabled = false;
  if (statusTxt) statusTxt.textContent = '';
}

export function openExportModal() {
  if (!exportModalEl) return;

  // Sync state values to form
  const outInp = document.getElementById('exportOutputInp');
  if (outInp && (!outInp.value || outInp.value.endsWith('.mp4'))) {
    const projName = state.project.name || 'dubbed_video';
    const projDir = state.project.projectDir || '';
    if (projDir) {
      outInp.value = `${projDir}\\${projName}_dubbed.mp4`;
    } else {
      outInp.value = `C:\\DubbedVideos\\${projName}_dubbed.mp4`;
    }
  }

  // BGM
  const bgmCheck = document.getElementById('exportBgmCheck');
  const bgmName = document.getElementById('exportBgmName');
  if (bgmName) {
    bgmName.textContent = state.project.bgmPath
      ? state.project.bgmPath.split(/[\\/]/).pop()
      : (state.project.videoFilePath ? 'Video Audio BGM' : 'Project BGM');
  }
  if (bgmCheck) bgmCheck.checked = true;

  // Ducking & Mute Original
  const duckCheck = document.getElementById('exportDuckCheck');
  if (duckCheck) duckCheck.checked = state.timeline.ducking !== false;

  const duckPresetSelect = document.getElementById('exportDuckPreset');
  if (duckPresetSelect) {
    duckPresetSelect.value = state.timeline.duckingPreset || 'balanced';
  }

  const muteCheck = document.getElementById('exportMuteOrigCheck');
  if (muteCheck) muteCheck.checked = state.timeline.muted !== false;

  const revCheck = document.getElementById('exportReverbCheck');
  if (revCheck) revCheck.checked = Boolean(state.timeline.reverb);

  const crowdCheck = document.getElementById('exportCrowdCheck');
  if (crowdCheck) crowdCheck.checked = Boolean(state.timeline.crowd);

  // Sync Intro & Outro from state
  const introInp = document.getElementById('exportIntroInp');
  if (introInp) introInp.value = state.project.introPath || '';

  const outroInp = document.getElementById('exportOutroInp');
  if (outroInp) outroInp.value = state.project.outroPath || '';

  // Watermark text
  const wmInp = document.getElementById('exportWatermarkTextInp');
  if (wmInp && !wmInp.value) wmInp.value = 'AI Dubbing Studio';

  resetExportUi();

  // Trigger badge update
  const blurCheck = document.getElementById('exportBlurCheck');
  if (blurCheck) blurCheck.checked = Boolean(state.previewBlur);
  const wmCheck = document.getElementById('exportWatermarkCheck');
  if (wmCheck) wmCheck.checked = Boolean(state.previewWatermark);

  const badge = document.getElementById('exportModeBadge');
  if (badge) {
    const needsReencode = (blurCheck && blurCheck.checked) || (wmCheck && wmCheck.checked) || state.project.introPath || state.project.outroPath;
    badge.textContent = needsReencode ? `⚙️ ${i18n.t('reencodeBadge')}` : `⚡ ${i18n.t('streamCopyBadge')}`;
    badge.className = needsReencode ? 'badge-reencode' : 'badge-fast';
  }

  exportModalEl.classList.add('open');
}

export function closeExportModal() {
  if (exportModalEl) exportModalEl.classList.remove('open');
}

async function runExportProcess() {
  const outInp = document.getElementById('exportOutputInp');
  let outputPath = outInp?.value.trim();

  if (!outputPath) {
    const defaultName = `${state.project.name || 'dubbed_video'}_dubbed.mp4`;
    const res = await ipcClient.saveFileDialog(defaultName);
    if (res.canceled || !res.filePath) return;
    outputPath = res.filePath;
    if (outInp) outInp.value = outputPath;
  }

  // Ensure video path is present
  const videoPath = state.project.videoFilePath;
  if (!videoPath) {
    ui.showToast('Please open or import a video file first before exporting.', 4000);
    return;
  }

  // Options
  const blurHardSubs = Boolean(document.getElementById('exportBlurCheck')?.checked);
  const watermark = Boolean(document.getElementById('exportWatermarkCheck')?.checked);
  const watermarkText = document.getElementById('exportWatermarkTextInp')?.value || 'AI Dubbing Studio';
  const introPath = document.getElementById('exportIntroInp')?.value.trim() || null;
  const outroPath = document.getElementById('exportOutroInp')?.value.trim() || null;
  const preset = document.getElementById('exportPresetSelect')?.value || 'veryfast';

  const ducking = Boolean(document.getElementById('exportDuckCheck')?.checked);
  const duckingPreset = document.getElementById('exportDuckPreset')?.value || (state.timeline.duckingPreset || 'balanced');
  const muteOriginal = Boolean(document.getElementById('exportMuteOrigCheck')?.checked);
  const bgmEnabled = Boolean(document.getElementById('exportBgmCheck')?.checked);
  const bgmVolume = parseFloat(document.getElementById('exportBgmVol')?.value) || 0.4;
  const volume = parseFloat(document.getElementById('exportDubVol')?.value) || 1.0;
  const reverb = Boolean(document.getElementById('exportReverbCheck')?.checked);
  const crowd = Boolean(document.getElementById('exportCrowdCheck')?.checked);
  const pitch = parseInt(document.getElementById('exportPitchSelect')?.value || '0', 10);

  const bgmPath = bgmEnabled ? (state.project.bgmPath || state.project.paths?.originalAudio || null) : null;
  const originalAudioPath = state.project.paths?.originalAudio || null;

  // UI state for export in progress
  isExporting = true;
  const container = document.getElementById('exportProgressContainer');
  const startBtn = document.getElementById('exportStartBtn');
  const cancelBtn = document.getElementById('exportCancelJobBtn');
  const dismissBtn = document.getElementById('exportDismissBtn');
  const statusTxt = document.getElementById('exportStatusText');

  if (container) container.hidden = false;
  if (startBtn) startBtn.hidden = true;
  if (cancelBtn) cancelBtn.hidden = false;
  if (dismissBtn) dismissBtn.disabled = true;
  if (statusTxt) statusTxt.textContent = i18n.t('exporting');

  try {
    const exportParams = {
      videoPath,
      segments: state.rows,
      bgmPath,
      originalAudioPath,
      outputPath,
      projectDir: state.project.projectDir || null,
      options: {
        blurHardSubs,
        watermark,
        watermarkText,
        watermarkXPercent: state.project.overlays?.watermark?.xPercent ?? 82,
        watermarkYPercent: state.project.overlays?.watermark?.yPercent ?? 14,
        subtitleXPercent: state.project.overlays?.subtitle?.xPercent ?? 50,
        subtitleYPercent: state.project.overlays?.subtitle?.yPercent ?? 86,
        introPath,
        outroPath,
        preset,
        ducking,
        duckingPreset,
        muteOriginal,
        bgmVolume,
        volume,
        reverb,
        crowd,
        pitch
      }
    };

    const res = await ipcClient.exportVideo(exportParams);

    if (res.success) {
      ui.showToast(i18n.t('exportSuccess'), 3500);
      if (statusTxt) statusTxt.textContent = `✓ ${i18n.t('exportSuccess')}`;
      setTimeout(() => {
        closeExportModal();
        resetExportUi();
      }, 1500);
    } else {
      const errMsg = res.error || 'Export failed';
      ui.showToast(i18n.t('exportError', { error: errMsg }), 4500);
      if (statusTxt) statusTxt.textContent = `✗ ${errMsg}`;
      resetExportUi();
    }
  } catch (err) {
    ui.showToast(i18n.t('exportError', { error: err.message }), 4500);
    if (statusTxt) statusTxt.textContent = `✗ ${err.message}`;
    resetExportUi();
  } finally {
    isExporting = false;
  }
}

// ----------------------------------------------------
// Intro & Outro Dedicated Modal Handling
// ----------------------------------------------------
function initIntroOutroModal() {
  if (!introOutroModalEl) return;

  const closeBtn = document.getElementById('introOutroCloseBtn');
  const dismissBtn = document.getElementById('introOutroDismissBtn');
  const saveBtn = document.getElementById('introOutroSaveBtn');

  const closeDlg = () => introOutroModalEl.classList.remove('open');
  closeBtn?.addEventListener('click', closeDlg);
  dismissBtn?.addEventListener('click', closeDlg);
  introOutroModalEl.addEventListener('click', (e) => {
    if (e.target === introOutroModalEl) closeDlg();
  });

  document.getElementById('introModalBrowseBtn')?.addEventListener('click', async () => {
    const res = await ipcClient.openFileDialog('video');
    if (!res.canceled && res.filePaths?.length) {
      const inp = document.getElementById('introModalInp');
      if (inp) inp.value = res.filePaths[0];
    }
  });

  document.getElementById('introModalClearBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('introModalInp');
    if (inp) inp.value = '';
  });

  document.getElementById('outroModalBrowseBtn')?.addEventListener('click', async () => {
    const res = await ipcClient.openFileDialog('video');
    if (!res.canceled && res.filePaths?.length) {
      const inp = document.getElementById('outroModalInp');
      if (inp) inp.value = res.filePaths[0];
    }
  });

  document.getElementById('outroModalClearBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('outroModalInp');
    if (inp) inp.value = '';
  });

  saveBtn?.addEventListener('click', () => {
    const introVal = document.getElementById('introModalInp')?.value.trim() || null;
    const outroVal = document.getElementById('outroModalInp')?.value.trim() || null;

    state.project.introPath = introVal;
    state.project.outroPath = outroVal;
    state.markDirty();
    state.emit('change', { source: 'introOutroSaved' });

    // Also update inputs in export modal if present
    const expIntro = document.getElementById('exportIntroInp');
    const expOutro = document.getElementById('exportOutroInp');
    if (expIntro) expIntro.value = introVal || '';
    if (expOutro) expOutro.value = outroVal || '';

    closeDlg();
    ui.showToast(i18n.t('voicePresetSaved') || 'Intro/Outro settings saved');
  });
}

export function openIntroOutroModal() {
  if (!introOutroModalEl) return;
  const introInp = document.getElementById('introModalInp');
  const outroInp = document.getElementById('outroModalInp');
  if (introInp) introInp.value = state.project.introPath || '';
  if (outroInp) outroInp.value = state.project.outroPath || '';
  introOutroModalEl.classList.add('open');
}
