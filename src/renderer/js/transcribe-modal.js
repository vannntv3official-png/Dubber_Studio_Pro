import { ipcClient } from './ipc-client.js';
import { state } from './state.js';
import { cast } from './cast.js';
import { ui, showToast } from './ui.js';
import { t } from './i18n.js';
import { workflow } from './workflow.js';
import { resolveOverlaps } from './subtitle-utils.js';

function getAudioSource() {
  if (state.project?.projectDir && state.project?.media?.orig16k) {
    return `${state.project.projectDir}/${state.project.media.orig16k}`.replace(/\\/g, '/');
  }
  if (state.project?.projectDir && state.project?.media?.origAudio) {
    return `${state.project.projectDir}/${state.project.media.origAudio}`.replace(/\\/g, '/');
  }
  return state.project?.paths?.audio16k || state.project?.paths?.origAudio || state.project?.paths?.originalAudio || state.project?.videoFilePath || state.project?.videoPath;
}

let isInitialized = false;
let isTranscribing = false;

export function initTranscribeModal() {
  if (isInitialized) return;
  isInitialized = true;

  const modal = document.getElementById('transcribeModal');
  const transBtn = document.getElementById('trans');
  const closeBtn = document.getElementById('transCloseBtn');
  const dismissBtn = document.getElementById('transDismissBtn');
  const startBtn = document.getElementById('transStartBtn');
  const cancelJobBtn = document.getElementById('transCancelJobBtn');

  const engineSelect = document.getElementById('transEngineSelect');
  const langSelect = document.getElementById('transLangSelect');
  const modelSelect = document.getElementById('transModelSelect');
  const modelGroup = document.getElementById('transModelGroup');

  const formBody = document.getElementById('transFormBody');
  const progContainer = document.getElementById('transProgressContainer');
  const progFill = document.getElementById('transProgressFill');
  const progPct = document.getElementById('transProgressPct');
  const progMsg = document.getElementById('transProgressMsg');

  function openModal() {
    resetDialogUI();
    modal.classList.add('open');

    // Set engine and model from settings
    ipcClient.getSettings().then(settings => {
      if (settings?.asr?.engine) {
        engineSelect.value = settings.asr.engine;
      } else if (settings?.asrEngine) {
        engineSelect.value = settings.asrEngine;
      }
      if (settings?.asr?.whisperModel && modelSelect) {
        modelSelect.value = settings.asr.whisperModel;
      }
      toggleModelVisibility();
    }).catch(() => {});
  }

  const subtitleToolbar = document.getElementById('subtitleToolbar');

  function setAmbientEffect(_active) {
    // Ambient scanning beam removed as requested
  }

  function updateTransBtnState(active, percent = null) {
    if (!transBtn) return;
    if (active) {
      transBtn.disabled = false;
      transBtn.classList.remove('busy');
      transBtn.classList.add('job-active-transcribing');
      transBtn.title = 'កំពុងបម្លែងសំឡេង... ចុចលើប៊ូតុងនេះដើម្បីបោះបង់ (Transcribing... Click to Cancel)';
      const pctStr = (percent != null && percent > 0 && percent < 100) ? ` ${Math.round(percent)}%` : '';
      transBtn.innerHTML = `
        <span class="job-active-spinner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </span>
        <span class="job-active-label">${t('transcribing') || 'Transcribing...'}${pctStr}</span>
        <span class="job-cancel-pill" title="${t('cancel') || 'Cancel'}">✕ ${t('cancel') || 'Cancel'}</span>
      `;
      setAmbientEffect(true);
    } else {
      transBtn.disabled = false;
      transBtn.classList.remove('job-active-transcribing', 'busy');
      transBtn.title = t('transcribe') || 'Transcribe speech';
      transBtn.innerHTML = `<span>${t('transcribe') || 'Transcribe'}</span>`;
      setAmbientEffect(false);
    }
  }

  async function cancelTranscription() {
    isTranscribing = false;
    updateTransBtnState(false);
    resetDialogUI();
    modal.classList.remove('open');
    try {
      await ipcClient.cancelTranscribe();
      showToast(t('cancel') || 'បានបោះបង់ការបម្លែងសម្លេង (Transcription cancelled)');
    } catch (_) {}
    if (typeof workflow !== 'undefined' && workflow.hideProgress) {
      workflow.hideProgress();
    }
  }

  // Direct Transcribe Click: Cancel if running, or Start immediately without dialog, or Shift+Click for modal
  transBtn.addEventListener('click', async (e) => {
    if (isTranscribing) {
      await cancelTranscription();
      return;
    }

    // Check if audio/video is loaded
    const audioPath = getAudioSource();
    if (!audioPath) {
      showToast('សូមបើកវីដេអូមុនពេលចាប់ផ្តើមបម្លែងសម្លេង (Please load a video first)');
      return;
    }

    if (e.shiftKey) {
      openModal();
      return;
    }

    await executeTranscription({ fromModal: false });
  });

  function toggleModelVisibility() {
    const isWhisperOrHybrid = engineSelect.value === 'faster-whisper' || engineSelect.value === 'hybrid';
    modelGroup.style.display = isWhisperOrHybrid ? 'flex' : 'none';
  }

  engineSelect.addEventListener('change', toggleModelVisibility);

  function resetDialogUI() {
    isTranscribing = false;
    formBody.hidden = false;
    progContainer.hidden = true;
    startBtn.hidden = false;
    dismissBtn.hidden = false;
    cancelJobBtn.hidden = true;
    progFill.style.width = '0%';
    progPct.textContent = '0%';
    progMsg.textContent = 'Starting transcription...';
  }

  function closeModal() {
    if (isTranscribing) return;
    modal.classList.remove('open');
  }

  closeBtn.addEventListener('click', closeModal);
  dismissBtn.addEventListener('click', closeModal);

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal && !isTranscribing) closeModal();
  });

  // Cancel Job from modal button
  cancelJobBtn.addEventListener('click', cancelTranscription);

  // Start Transcription via modal start button
  startBtn.addEventListener('click', () => {
    executeTranscription({ fromModal: true });
  });

  async function executeTranscription({ fromModal = false } = {}) {
    const audioPath = getAudioSource();
    if (!audioPath) {
      showToast('សូមបើកវីដេអូមុនពេលចាប់ផ្តើមបម្លែងសម្លេង (Please load a video first)');
      return;
    }

    if (isTranscribing) return;
    isTranscribing = true;

    // Immediate button & workflow feedback on click
    updateTransBtnState(true, 5);

    if (fromModal) {
      formBody.hidden = true;
      progContainer.hidden = false;
      startBtn.hidden = true;
      dismissBtn.hidden = true;
      cancelJobBtn.hidden = false;
      progFill.style.width = '5%';
      progPct.textContent = '5%';
      progMsg.textContent = 'Initializing transcription engine...';
    } else {
      modal.classList.remove('open');
    }

    if (typeof workflow !== 'undefined' && workflow.showProgress) {
      workflow.showProgress('asr', t('transcribingProgress') || 'Transcribing speech...', 5);
    }

    let engine = engineSelect.value;
    let language = langSelect.value;
    let modelSize = modelSelect.value;

    if (!fromModal) {
      try {
        const settings = await ipcClient.getSettings();
        if (settings?.asr?.engine) {
          engine = settings.asr.engine;
        } else if (settings?.asrEngine) {
          engine = settings.asrEngine;
        }
        if (settings?.asr?.whisperModel) {
          modelSize = settings.asr.whisperModel;
        }
      } catch (_) {}
    }

    if (engine === 'gemini') {
      try {
        const keyStatus = await ipcClient.getKeyPoolStatus();
        if (!keyStatus || keyStatus.total === 0) {
          isTranscribing = false;
          updateTransBtnState(false);
          resetDialogUI();
          if (typeof workflow !== 'undefined' && workflow.hideProgress) {
            workflow.hideProgress();
          }
          showToast('⚠️ មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមបន្ថែម Key ក្នុង Settings (⚙️) -> Gemini API Keys ជាមុនសិន!');
          return;
        }
      } catch (_) {}
    }

    try {
      const res = await ipcClient.transcribe(audioPath, {
        engine,
        language,
        modelSize
      });

      if (!res.success) {
        throw new Error(res.error || 'Transcription failed');
      }

      const rawSegments = res.segments || [];
      if (rawSegments.length === 0) {
        showToast('No dialogue segments detected in audio.');
        modal.classList.remove('open');
        return;
      }

      // Map raw segments into application row model matching state schema: { id, s, e, t, v, speaker, gender, sp, ok, ck }
      const mappedRows = rawSegments.map((seg, idx) => {
        const isFemale = (seg.gender || '').toLowerCase() === 'female';
        const voiceIdx = isFemale ? 2 : 0; // A3 (Female) or A1 (Male)
        return {
          id: idx + 1,
          s: Number(seg.start),
          e: Number(seg.end),
          t: String(seg.text || '').trim(),
          sourceText: String(seg.text || '').trim(),
          v: voiceIdx,
          speaker: seg.speaker || (isFemale ? 'Speaker 2' : 'Speaker 1'),
          gender: isFemale ? 'female' : 'male',
          sp: 1.0,
          ok: false,
          ck: false
        };
      });

      // Automatically resolve any overlapping timestamps
      resolveOverlaps(mappedRows);

      // Update state with snapshot for undo
      state.snapshot();
      state.rows = mappedRows;
      state.selectedId = mappedRows[0]?.id || 1;
      state.nextId = mappedRows.length + 1;

      // Expand duration if subtitles extend beyond current video duration
      if (mappedRows.length > 0 && state.project) {
        const maxEnd = Math.max(...mappedRows.map(r => r.e || 0));
        if (maxEnd > (state.project.duration || 0)) {
          state.project.duration = maxEnd + 1;
        }
      }

      state.emit('change', { source: 'transcribe' });

      // Automatically populate/refresh the Cast panel with detected speakers and voices
      if (typeof cast !== 'undefined' && cast.extractCastFromRows) {
        cast.extractCastFromRows(true);
      }

      showToast(`Transcription complete! Generated ${mappedRows.length} segments.`);
      modal.classList.remove('open');
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        setTimeout(() => workflow.hideProgress(), 800);
      }

    } catch (err) {
      const isCancelled = err?.message?.toLowerCase().includes('cancel') || !isTranscribing;
      if (isCancelled) {
        showToast(t('cancel') || 'បានបោះបង់ការបម្លែងសម្លេង (Transcription cancelled)');
      } else {
        if (typeof ui !== 'undefined' && ui.showError) {
          ui.showError(err, 'transcription');
        } else {
          showToast(`Transcription error: ${err.message}`);
        }
      }
      resetDialogUI();
      modal.classList.remove('open');
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        workflow.hideProgress();
      }
    } finally {
      isTranscribing = false;
      updateTransBtnState(false);
    }
  }

  // Progress event listener from IPC
  ipcClient.on('asr:progress', (prog) => {
    if (!isTranscribing) return;
    if (progFill) progFill.style.width = `${prog.percent}%`;
    if (progPct) progPct.textContent = `${prog.percent}%`;
    if (progMsg && prog.message) progMsg.textContent = prog.message;
    if (prog && prog.percent != null && prog.percent < 100) {
      updateTransBtnState(true, prog.percent);
    }
  });
}
