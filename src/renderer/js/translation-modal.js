/**
 * Translation Modal Controller
 * Connects TranslationService (Gemini API / Mock), batching, progress events,
 * and updates state.rows with localized dialogue.
 */

import { ipcClient } from './ipc-client.js';
import { state } from './state.js';
import { cast } from './cast.js';
import { table } from './table.js';
import { ui, showToast } from './ui.js';
import { t } from './i18n.js';
import { workflow } from './workflow.js';
import { openSettingsToSection } from './settings-modal.js';

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
  const toneSelect = document.getElementById('translateToneSelect');
  const glossaryInp = document.getElementById('translateGlossaryInp');

  const keyWarning = document.getElementById('translateKeyWarning');
  const keyWarningTxt = document.getElementById('translateKeyWarningTxt');
  const addKeyBtn = document.getElementById('translateAddKeyBtn');

  const formBody = document.getElementById('translateFormBody');
  const progContainer = document.getElementById('translateProgressContainer');
  const progFill = document.getElementById('translateProgressFill');
  const progPct = document.getElementById('translateProgressPct');
  const progMsg = document.getElementById('translateProgressMsg');

  async function updateKeyWarningUI() {
    if (!keyWarning) return;
    const curModel = modelSelect?.value || 'gemini-3.8-flash';
    if (curModel === 'mock') {
      keyWarning.style.display = 'none';
      return;
    }

    const isCodecraft = curModel.startsWith('codecraft');
    if (isCodecraft) {
      try {
        const settings = await ipcClient.getSettings();
        if (!settings?.codecraft?.apiKey) {
          keyWarning.style.display = 'flex';
          if (keyWarningTxt) keyWarningTxt.textContent = '⚠️ មិនទាន់មាន CodeCraft API Key នៅឡើយទេ។ សូមបន្ថែម Key ជាមុនសិន។';
          return;
        }
      } catch (_) {}
    } else {
      try {
        const status = await ipcClient.getKeyPoolStatus();
        if (!status || status.total === 0) {
          keyWarning.style.display = 'flex';
          if (keyWarningTxt) keyWarningTxt.textContent = '⚠️ មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមបន្ថែម Key ជាមុនសិន។';
          return;
        }
      } catch (_) {}
    }
    keyWarning.style.display = 'none';
  }

  modelSelect?.addEventListener('change', updateKeyWarningUI);
  addKeyBtn?.addEventListener('click', () => {
    modal?.classList.remove('open');
    const isCodecraft = modelSelect?.value?.startsWith('codecraft');
    openSettingsToSection(isCodecraft ? 'secCodecraft' : 'secKeys');
  });

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

    resetDialogUI();
    modal?.classList.add('open');

    // Synchronize default model from settings in background
    try {
      const settings = await ipcClient.getSettings();
      if (settings?.gemini?.translationModel && modelSelect) {
        modelSelect.value = settings.gemini.translationModel;
      }
    } catch (_) {}

    updateKeyWarningUI();
  };

  const subtitleToolbar = document.getElementById('subtitleToolbar');

  function setAmbientEffect(_active) {
    // Ambient scanning beam removed as requested
  }

  function updateTranslateBtnState(active, percent = null) {
    if (!translateBtn) return;
    if (active) {
      translateBtn.disabled = false;
      translateBtn.classList.remove('busy');
      translateBtn.classList.add('job-active-translating');
      translateBtn.title = 'កំពុងបកប្រែ... ចុចលើប៊ូតុងនេះដើម្បីបោះបង់ (Translating... Click to Cancel)';
      const pctStr = (percent != null && percent > 0 && percent < 100) ? ` ${Math.round(percent)}%` : '';
      translateBtn.innerHTML = `
        <span class="job-active-spinner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </span>
        <span class="job-active-label">${t('translating') || 'Translating...'}${pctStr}</span>
        <span class="job-cancel-pill" title="${t('cancel') || 'Cancel'}">✕ ${t('cancel') || 'Cancel'}</span>
      `;
      setAmbientEffect(true);
    } else {
      translateBtn.disabled = false;
      translateBtn.classList.remove('job-active-translating', 'busy');
      translateBtn.title = t('translate') || 'Translate subtitles';
      translateBtn.innerHTML = `<span>${t('translate') || 'បកប្រែ (Translate)'}</span>`;
      setAmbientEffect(false);
    }
  }

  async function cancelTranslation() {
    isTranslating = false;
    updateTranslateBtnState(false);
    resetDialogUI();
    modal?.classList.remove('open');
    try {
      await ipcClient.cancelTranslate();
      showToast(t('cancel') || 'បានបោះបង់ការបកប្រែ (Translation cancelled)');
    } catch (_) {}
    if (typeof workflow !== 'undefined' && workflow.hideProgress) {
      workflow.hideProgress();
    }
  }

  // Translate button click: Cancel if running, or start direct 1-click translation!
  const onTranslateClick = async () => {
    if (isTranslating) {
      await cancelTranslation();
      return;
    }

    if (!state.rows || state.rows.length === 0) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      return;
    }

    // Direct 1-Click Translation: Translate directly without blocking modal dialog!
    executeTranslation({ fromModal: false });
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

  // Cancel Job from modal button
  cancelJobBtn?.addEventListener('click', cancelTranslation);

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

    // Immediate button & workflow feedback on click
    updateTranslateBtnState(true, 5);

    const tlangToolbarEl = document.getElementById('tlang');
    const ttoneToolbarEl = document.getElementById('ttone');
    const targetLang = tlangToolbarEl?.value || targetLangSelect?.value || 'Khmer';
    const tone = ttoneToolbarEl?.value || toneSelect?.value || 'cinema';

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

    let model = 'gemini-3.8-flash';
    let engine = 'gemini';
    let loadedSettings = null;

    if (fromModal && modelSelect && modelSelect.value) {
      model = modelSelect.value;
      if (model.startsWith('codecraft:') || model.startsWith('codecraft')) {
        engine = 'codecraft';
        model = model.replace(/^codecraft:/, '');
      } else if (model === 'mock') {
        engine = 'mock';
      } else {
        engine = 'gemini';
      }
    } else {
      try {
        loadedSettings = await ipcClient.getSettings();
        if (loadedSettings?.general?.defaultTranslationEngine === 'codecraft' || loadedSettings?.codecraft?.translationEngineActive) {
          engine = 'codecraft';
          model = loadedSettings.codecraft?.translationModel || 'gemini-3.7-flash';
        } else if (loadedSettings?.gemini?.translationModel) {
          model = loadedSettings.gemini.translationModel;
        }
      } catch (_) {}
    }

    if (engine === 'codecraft' && (model === 'gemini-3.8-flash' || model.startsWith('gemini-3.5'))) {
      model = 'gemini-3.7-flash';
    }

    const batchSize = Number(batchSizeSelect?.value) || 30;
    const glossary = (glossaryInp?.value || state.project?.glossary || '').trim();
    if (state.project) {
      state.project.glossary = glossary;
    }

    if (model === 'mock') {
      engine = 'mock';
    } else if (model.startsWith('codecraft:') || model.startsWith('codecraft')) {
      engine = 'codecraft';
      model = model.replace(/^codecraft:/, '');
      if (model === 'gemini-3.8-flash' || model.startsWith('gemini-3.5')) {
        model = 'gemini-3.7-flash';
      }
    }

    // Pre-flight check API keys to prevent getting stuck at 5% progress
    if (engine === 'gemini') {
      try {
        const keyStatus = await ipcClient.getKeyPoolStatus();
        if (!keyStatus || keyStatus.total === 0) {
          isTranslating = false;
          updateTranslateBtnState(false);
          resetDialogUI();
          if (typeof workflow !== 'undefined' && workflow.hideProgress) {
            workflow.hideProgress();
          }
          showToast('⚠️ មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមបន្ថែម Key ក្នុង Settings (⚙️) -> Gemini API Keys ជាមុនសិន!');
          openSettingsToSection('secKeys');
          return;
        }
      } catch (_) {}
    } else if (engine === 'codecraft') {
      try {
        const settings = loadedSettings || await ipcClient.getSettings();
        if (!settings?.codecraft?.apiKey) {
          isTranslating = false;
          updateTranslateBtnState(false);
          resetDialogUI();
          if (typeof workflow !== 'undefined' && workflow.hideProgress) {
            workflow.hideProgress();
          }
          showToast('⚠️ មិនទាន់មាន CodeCraft API Key នៅឡើយទេ។ សូមបន្ថែម Key ក្នុង Settings (⚙️) -> CodeCraft ជាមុនសិន!');
          openSettingsToSection('secCodecraft');
          return;
        }
      } catch (_) {}
    }

    const checkedRows = state.rows.filter(r => r.ck);
    const targetRows = checkedRows.length > 0 ? checkedRows : state.rows;
    if (!targetRows.length) {
      showToast('សូមបង្កើត ឬនាំចូលអត្ថបទរងជាមុនសិន (Please import or transcribe subtitles first)');
      isTranslating = false;
      updateTranslateBtnState(false);
      resetDialogUI();
      return;
    }

    const segmentsPayload = targetRows.map(r => ({
      id: r.id,
      text: r.sourceText || r.t,
      start: r.s,
      end: r.e,
      speaker: r.speaker,
      gender: r.gender
    }));

    try {
      const tone = toneSelect?.value || 'cinema';
      const projectCast = state.project?.cast || [];

      const res = await ipcClient.translate(segmentsPayload, {
        targetLang,
        model,
        batchSize,
        glossary,
        tone,
        cast: projectCast,
        engine
      });

      if (!res.success) {
        throw new Error(res.error || 'Translation failed');
      }

      const results = res.results || [];
      const resultMap = new Map(results.map(item => [String(item.id), item.translatedText]));

      // Snapshot for Undo/Redo
      state.snapshot();

      let translatedCount = 0;
      targetRows.forEach(r => {
        const strId = String(r.id);
        if (resultMap.has(strId)) {
          if (!r.sourceText) {
            r.sourceText = r.t;
          }
          r.t = resultMap.get(strId);
          r.ok = false;
          r.audioPath = null;
          r.overflow = false;
          translatedCount++;
        }
      });

      // Update toolbar target language
      if (tlangToolbar) {
        tlangToolbar.value = targetLang;
      }

      // Auto-extract or refresh cast from translated dialogue
      if (typeof cast !== 'undefined' && typeof cast.extractCastFromRows === 'function') {
        cast.extractCastFromRows(true);
      }

      state.emit('change', { source: 'translation' });
      if (typeof table !== 'undefined' && typeof table.render === 'function') {
        table.render();
      }

      showToast(t('translationSuccess', { count: translatedCount }) || `✓ បានបកប្រែជោគជ័យ ${translatedCount} បន្ទាត់!`);
      modal?.classList.remove('open');
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        setTimeout(() => workflow.hideProgress(), 800);
      }

    } catch (err) {
      if (typeof ui !== 'undefined' && ui.showError) {
        ui.showError(err, 'translation');
      } else {
        showToast(`Translation error: ${err.message}`);
      }
      resetDialogUI();
      if (typeof workflow !== 'undefined' && workflow.hideProgress) {
        workflow.hideProgress();
      }
    } finally {
      isTranslating = false;
      updateTranslateBtnState(false);
    }
  }

  // Progress events from IPC
  ipcClient.on('translation:progress', (prog) => {
    if (!isTranslating) return;
    if (progFill) progFill.style.width = `${prog.percent}%`;
    if (progPct) progPct.textContent = `${prog.percent}%`;
    if (progMsg && prog.message) progMsg.textContent = prog.message;
    if (prog && prog.percent != null && prog.percent < 100) {
      updateTranslateBtnState(true, prog.percent);
    }
  });
}
