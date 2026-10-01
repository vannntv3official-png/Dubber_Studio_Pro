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

  // Open modal
  const openModal = () => {
    if (!state.rows || state.rows.length === 0) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      return;
    }

    if (tlangToolbar) {
      targetLangSelect.value = tlangToolbar.value;
    }
    resetDialogUI();
    modal.classList.add('open');
  };

  translateBtn?.addEventListener('click', openModal);

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
    modal.classList.remove('open');
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
  });

  // Start Translation
  startBtn?.addEventListener('click', async () => {
    if (!state.rows || state.rows.length === 0) {
      showToast('No subtitle lines to translate');
      return;
    }

    const targetLang = targetLangSelect.value;
    const model = modelSelect.value;
    const batchSize = Number(batchSizeSelect.value) || 30;
    const glossary = glossaryInp.value.trim();
    const engine = model === 'mock' ? 'mock' : 'gemini';

    isTranslating = true;
    formBody.hidden = true;
    progContainer.hidden = false;
    startBtn.hidden = true;
    dismissBtn.hidden = true;
    cancelJobBtn.hidden = false;

    progFill.style.width = '5%';
    progPct.textContent = '5%';
    progMsg.textContent = `Preparing translation into ${targetLang}...`;

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
      modal.classList.remove('open');

    } catch (err) {
      showToast(`Translation error: ${err.message}`);
      resetDialogUI();
    } finally {
      isTranslating = false;
    }
  });

  // Progress events from IPC
  ipcClient.on('translation:progress', (prog) => {
    if (!isTranslating) return;
    if (progFill) progFill.style.width = `${prog.percent}%`;
    if (progPct) progPct.textContent = `${prog.percent}%`;
    if (progMsg && prog.message) progMsg.textContent = prog.message;
  });
}
