import { ipcClient } from './ipc-client.js';
import { state } from './state.js';
import { cast } from './cast.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';
import { workflow } from './workflow.js';

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
    // Set engine from settings
    ipcClient.getSettings().then(settings => {
      if (settings && settings.asrEngine) {
        engineSelect.value = settings.asrEngine;
      }
      toggleModelVisibility();
    }).catch(() => {});

    resetDialogUI();
    modal.classList.add('open');
  }

  // Direct Transcribe Click: Start immediately without dialog, or Shift+Click for modal
  transBtn.addEventListener('click', async (e) => {
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

    if (isTranscribing) {
      showToast(t('transcribing') || 'កំពុងបំប្លែងសំឡេង... (Transcribing...)');
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

  // Cancel Job
  cancelJobBtn.addEventListener('click', async () => {
    try {
      await ipcClient.cancelTranscribe();
      showToast('Transcription cancelled');
    } catch (_) {}
    resetDialogUI();
    if (typeof workflow !== 'undefined' && workflow.hideProgress) {
      workflow.hideProgress();
    }
  });

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

    let engine = engineSelect.value;
    let language = langSelect.value;
    let modelSize = modelSelect.value;

    try {
      const settings = await ipcClient.getSettings();
      if (settings?.asrEngine) {
        engine = settings.asrEngine;
      }
    } catch (_) {}

    // Button state: show Transcribing...
    const origBtnContent = transBtn ? transBtn.innerHTML : '';
    if (transBtn) {
      transBtn.disabled = true;
      transBtn.classList.add('busy');
      transBtn.innerHTML = `<span>⏳ ${t('transcribing') || 'Transcribing...'}</span>`;
    }

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

      // Update state with snapshot for undo
      state.snapshot();
      state.rows = mappedRows;
      state.selectedId = mappedRows[0]?.id || 1;
      state.nextId = mappedRows.length + 1;

      // Expand duration if subtitles extend beyond current video duration
      const maxEnd = Math.max(...mappedRows.map(r => r.e));
      if (maxEnd > state.project.duration) {
        state.project.duration = maxEnd + 1;
      }

      state.emit('change', { source: 'transcribe' });

      // Automatically populate/refresh the Cast panel with detected speakers and voices
      if (typeof cast !== 'undefined' && cast.extractCastFromRows) {
        cast.extractCastFromRows();
      }

      showToast(`Transcription complete! Generated ${mappedRows.length} segments.`);
      modal.classList.remove('open');
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        setTimeout(() => workflow.hideProgress(), 800);
      }

    } catch (err) {
      showToast(`Transcription error: ${err.message}`);
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        workflow.hideProgress();
      }
    } finally {
      isTranscribing = false;
      if (transBtn) {
        transBtn.disabled = false;
        transBtn.classList.remove('busy');
        transBtn.innerHTML = origBtnContent;
      }
    }
  }

  // Progress event listener from IPC
  ipcClient.on('asr:progress', (prog) => {
    if (!isTranscribing) return;
    if (progFill) progFill.style.width = `${prog.percent}%`;
    if (progPct) progPct.textContent = `${prog.percent}%`;
    if (progMsg && prog.message) progMsg.textContent = prog.message;
  });
}
