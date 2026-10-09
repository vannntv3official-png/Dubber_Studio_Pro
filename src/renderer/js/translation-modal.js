/**
 * Translation Modal Controller
 * Connects TranslationService (Gemini API / Mock), batching, progress events,
 * and updates state.rows with localized dialogue.
 */

import { ipcClient } from './ipc-client.js';
import { state } from './state.js';
import { cast } from './cast.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';
import { workflow } from './workflow.js';

let isInitialized = false;
let isTranslating = false;

export function initTranslationModal() {
  if (isInitialized) return;
  isInitialized = true;

  const modal = document.getElementById('translateModal');
  const translateBtn = document.getElementById('translateBtn');
  const tlangToolbar = document.getElementById('tlang');
  const closeBtn = document.getElementById('translateCloseBtn');
  const dismissBtn = document.getElementById('translateDismissBtn');
  const startBtn = document.getElementById('startTranslationBtn');
  const cancelJobBtn = document.getElementById('translateCancelJobBtn');

  const targetLangSelect = document.getElementById('targetLangSelect');
  const modelSelect = document.getElementById('translateModelSelect');
  const batchSizeSelect = document.getElementById('translateBatchSizeSelect');
  const glossaryInp = document.getElementById('translateGlossaryInp');

  const formBody = document.getElementById('translateFormBody');
  const progContainer = document.getElementById('translateProgressContainer');
  const progFill = document.getElementById('translateProgressFill');
  const progPct = document.getElementById('translateProgressPct');
  const progMsg = document.getElementById('translateProgressMsg');

  // Sync toolbar select with dialog target language
  if (tlangToolbar && targetLangSelect) {
    tlangToolbar.addEventListener('change', () => {
      targetLangSelect.value = tlangToolbar.value;
    });
  }

  // Open modal for advanced options (e.g. Shift+Click)
  const openModal = async () => {
    if (!state.rows || state.rows.length === 0) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      return;
    }

    if (tlangToolbar && targetLangSelect) {
      targetLangSelect.value = tlangToolbar.value;
    }

    // Preload project glossary if available
    if (glossaryInp) {
      glossaryInp.value = state.project?.glossary || '';
    }

    // Synchronize default model from settings
    try {
      const settings = await ipcClient.getSettings();
      if (settings?.gemini?.translationModel && modelSelect) {
        modelSelect.value = settings.gemini.translationModel;
      }
    } catch (_) {}

    resetDialogUI();
    modal?.classList.add('open');
  };

  // Direct Translate Click: Start immediately without dialog, or Shift+Click for modal
  const onTranslateClick = async (e) => {
    if (!state.rows || state.rows.length === 0) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      return;
    }

    if (e && e.shiftKey) {
      openModal();
      return;
    }

    if (isTranslating) {
      showToast(t('translating') || 'កំពុងបកប្រែ... (Translating...)');
      return;
    }

    await executeTranslation({ fromModal: false });
  };

  translateBtn?.addEventListener('click', onTranslateClick);

  function resetDialogUI() {
    isTranslating = false;
    formBody.hidden = false;
    progContainer.hidden = true;
    startBtn.hidden = false;
    dismissBtn.hidden = false;
    cancelJobBtn.hidden = true;
    progFill.style.width = '0%';
    progPct.textContent = '0%';
    progMsg.textContent = 'Starting translation...';
  }

  function closeModal() {
    if (isTranslating) return;
    modal?.classList.remove('open');
  }

  closeBtn?.addEventListener('click', closeModal);
  dismissBtn?.addEventListener('click', closeModal);

  // Close on outside click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal && !isTranslating) closeModal();
  });

  // Cancel Job
  cancelJobBtn?.addEventListener('click', async () => {
    try {
      await ipcClient.cancelTranslate();
      showToast('Translation cancelled');
    } catch (_) {}
    resetDialogUI();
    if (typeof workflow !== 'undefined' && workflow.hideProgress) {
      workflow.hideProgress();
    }
  });

  // Start Translation via modal start button
  startBtn?.addEventListener('click', () => {
    executeTranslation({ fromModal: true });
  });

  async function executeTranslation({ fromModal = false } = {}) {
    if (!state.rows || state.rows.length === 0) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      return;
    }

    if (isTranslating) return;
    isTranslating = true;

    const targetLang = (tlangToolbar?.value) || (targetLangSelect?.value) || 'km';
    let model = modelSelect?.value || 'gemini-3.8-flash';
    const batchSize = Number(batchSizeSelect?.value) || 30;
    const glossary = (glossaryInp?.value || state.project?.glossary || '').trim();
    if (state.project) {
      state.project.glossary = glossary;
    }

    try {
      const settings = await ipcClient.getSettings();
      if (settings?.gemini?.translationModel) {
        model = settings.gemini.translationModel;
      }
    } catch (_) {}

    const engine = model === 'mock' ? 'mock' : 'gemini';

    // Button states: show Translating...
    const origBtnContent = translateBtn ? translateBtn.innerHTML : '';
    const tableBtn = document.getElementById('tableTranslateBtn');
    const origTableBtnContent = tableBtn ? tableBtn.innerHTML : '';

    if (translateBtn) {
      translateBtn.disabled = true;
      translateBtn.classList.add('busy');
      translateBtn.innerHTML = `<span>⏳ ${t('translating') || 'Translating...'}</span>`;
    }
    if (tableBtn) {
      tableBtn.disabled = true;
      tableBtn.classList.add('busy');
      tableBtn.innerHTML = `<span>⏳ ${t('translating') || 'Translating...'}</span>`;
    }

    if (fromModal) {
      formBody.hidden = true;
      progContainer.hidden = false;
      startBtn.hidden = true;
      dismissBtn.hidden = true;
      cancelJobBtn.hidden = false;
      progFill.style.width = '5%';
      progPct.textContent = '5%';
      progMsg.textContent = `Preparing translation into ${targetLang}...`;
    } else {
      modal?.classList.remove('open');
    }

    if (typeof workflow !== 'undefined' && workflow.showProgress) {
      workflow.showProgress('translation', t('translatingProgress') || 'Translating subtitles...', 5);
    }

    const segmentsPayload = state.rows.map(r => ({
      id: r.id,
      text: r.t,
      start: r.s,
      end: r.e,
      speaker: r.speaker,
      gender: r.gender
    }));

    try {
      const res = await ipcClient.translate(segmentsPayload, {
        targetLang,
        model,
        batchSize,
        glossary,
        engine
      });

      if (!res.success) {
        throw new Error(res.error || 'Translation failed');
      }

      const results = res.results || [];
      const resultMap = new Map(results.map(item => [item.id, item.translatedText]));

      // Snapshot for Undo/Redo
      state.snapshot();

      let translatedCount = 0;
      state.rows.forEach(r => {
        if (resultMap.has(r.id)) {
          if (!r.sourceText) {
            r.sourceText = r.t;
          }
          r.t = resultMap.get(r.id);
          translatedCount++;
        }
      });

      // Update toolbar target language
      if (tlangToolbar) {
        tlangToolbar.value = targetLang;
      }

      // Auto-extract or refresh cast from translated dialogue
      cast.extractCastFromRows();

      state.emit('change', { source: 'translation' });

      showToast(`Translation complete! Localized ${translatedCount} dialogue lines.`);
      modal?.classList.remove('open');
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        setTimeout(() => workflow.hideProgress(), 800);
      }

    } catch (err) {
      showToast(`Translation error: ${err.message}`);
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        workflow.hideProgress();
      }
    } finally {
      isTranslating = false;
      if (translateBtn) {
        translateBtn.disabled = false;
        translateBtn.classList.remove('busy');
        translateBtn.innerHTML = origBtnContent;
      }
      if (tableBtn) {
        tableBtn.disabled = false;
        tableBtn.classList.remove('busy');
        tableBtn.innerHTML = origTableBtnContent;
      }
    }
  }

  // Progress events from IPC
  ipcClient.on('translation:progress', (prog) => {
    if (!isTranslating) return;
    if (progFill) progFill.style.width = `${prog.percent}%`;
    if (progPct) progPct.textContent = `${prog.percent}%`;
    if (progMsg && prog.message) progMsg.textContent = prog.message;
  });
}
