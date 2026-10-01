/**
 * Redesigned Settings Modal Orchestrator
 * Connects 9 modular sections, responsive sidebar navigation, cross-section search filter,
 * dirty-state management, focus trapping, and persistence.
 */

import { ipcClient } from './ipc-client.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

import { sectionGeneral } from './settings/section-general.js';
import { sectionTheme } from './settings/section-theme.js';
import { sectionKeys } from './settings/section-keys.js';
import { sectionAsr } from './settings/section-asr.js';
import { sectionVoices } from './settings/section-voices.js';
import { sectionPronunciation } from './settings/section-pronunciation.js';
import { sectionShortcuts } from './settings/section-shortcuts.js';
import { sectionSystem, updateDeveloperModeUI } from './settings/section-system.js';
import { sectionAbout } from './settings/section-about.js';

const SECTIONS = [
  sectionGeneral,
  sectionTheme,
  sectionKeys,
  sectionAsr,
  sectionVoices,
  sectionPronunciation,
  sectionShortcuts,
  sectionSystem,
  sectionAbout
];

let isInitialized = false;
let isDirty = false;
let restartRequired = false;
let currentLoadedSettings = null;
let activeSectionId = 'secGeneral';
let previousActiveElement = null;

export function initSettingsModal() {
  if (isInitialized) return;
  isInitialized = true;

  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('settings');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const dismissBtn = document.getElementById('settingsDismissBtn');
  const saveBtn = document.getElementById('settingsSaveBtn');

  const searchInp = document.getElementById('settingsSearchInp');
  const clearSearchBtn = document.getElementById('settingsClearSearchBtn');

  // Set initial tooltip on disabled Save button
  if (saveBtn) {
    saveBtn.title = 'No changes to save';
  }

  const updateDirtyUI = (dirty) => {
    const statusEl = document.getElementById('settingsFooterDirtyIndicator');
    const savedEl = document.getElementById('settingsSavedIndicator');
    if (statusEl) statusEl.hidden = !dirty;
    if (savedEl) savedEl.hidden = dirty;
    if (saveBtn) {
      saveBtn.disabled = !dirty;
      saveBtn.title = dirty ? '' : 'No changes to save';
    }
  };

  // Context passed to sections
  const sectionContext = {
    markDirty: () => {
      isDirty = true;
      updateDirtyUI(true);
    },
    notifyRestartRequired: (reason) => {
      restartRequired = true;
      const badge = document.getElementById('settingsRestartBadge');
      if (badge) badge.hidden = false;
    },
    ipcClient,
    showToast,
    t
  };

  // Initialize all section modules
  SECTIONS.forEach(sec => {
    try {
      sec.init(sectionContext);
    } catch (err) {
      console.error(`Failed to init section ${sec.id}:`, err);
    }
  });

  // Sidebar navigation click handlers
  const navButtons = document.querySelectorAll('.settings-nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSecId = btn.dataset.section;
      if (targetSecId) {
        // Clear search if switching sections manually
        if (searchInp && searchInp.value.trim()) {
          searchInp.value = '';
          if (clearSearchBtn) clearSearchBtn.hidden = true;
          resetSearchFilter();
        }
        switchToSection(targetSecId);
      }
    });
  });

  // Open modal
  openBtn?.addEventListener('click', async () => {
    previousActiveElement = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    // Reset state
    isDirty = false;
    restartRequired = false;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.title = 'No changes to save'; }
    const badge = document.getElementById('settingsRestartBadge');
    if (badge) badge.hidden = true;
    const indicator = document.getElementById('settingsSavedIndicator');
    if (indicator) indicator.hidden = true;
    const dirtyIndicator = document.getElementById('settingsFooterDirtyIndicator');
    if (dirtyIndicator) dirtyIndicator.hidden = true;

    // Load data from backend
    await loadAllSettings();

    // Default to Section 1 or remember last
    switchToSection(activeSectionId || 'secGeneral');

    // Focus search or active tab
    setTimeout(() => {
      searchInp?.focus();
    }, 50);
  });

  // Close handlers
  const attemptClose = () => {
    if (isDirty) {
      const confirmDiscard = confirm('អ្នកមានការកែប្រែដែលមិនទាន់បានរក្សាទុក។ តើអ្នកពិតជាចង់បោះបង់មែនទេ?\n(You have unsaved changes. Discard them?)');
      if (!confirmDiscard) return;
    }
    closeModal();
  };

  closeBtn?.addEventListener('click', attemptClose);
  dismissBtn?.addEventListener('click', attemptClose);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      attemptClose();
    }
  });

  // Search filter
  searchInp?.addEventListener('input', () => {
    const q = searchInp.value.trim().toLowerCase();
    if (clearSearchBtn) clearSearchBtn.hidden = !q;
    applySearchFilter(q);
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInp) searchInp.value = '';
    clearSearchBtn.hidden = true;
    resetSearchFilter();
    switchToSection(activeSectionId);
    searchInp?.focus();
  });

  // Save Settings handler
  saveBtn?.addEventListener('click', async () => {
    await saveAllSettings();
  });

  // Focus trap & Esc / Ctrl+F keydown in modal
  window.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;

    // Ctrl+F inside modal: Focus settings search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      e.stopPropagation();
      searchInp?.focus();
      searchInp?.select();
      return;
    }

    // Escape: Close modal
    if (e.key === 'Escape') {
      e.preventDefault();
      attemptClose();
      return;
    }

    // Tab key focus trap
    if (e.key === 'Tab') {
      trapFocus(modal, e);
    }
  });
}

function switchToSection(sectionId) {
  activeSectionId = sectionId;
  const navButtons = document.querySelectorAll('.settings-nav-btn');
  const sections = document.querySelectorAll('.settings-section-view');

  navButtons.forEach(b => {
    const isTarget = b.dataset.section === sectionId;
    b.classList.toggle('active', isTarget);
    b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  sections.forEach(s => {
    s.hidden = s.id !== sectionId;
  });

  const scrollArea = document.getElementById('settingsScrollArea');
  if (scrollArea) scrollArea.scrollTop = 0;

  // Stop any active previews
  sectionVoices.stopAudio();
}

function applySearchFilter(query) {
  const sections = document.querySelectorAll('.settings-section-view');
  const searchEmpty = document.getElementById('settingsSearchEmpty');
  const cards = document.querySelectorAll('.settings-card');

  if (!query) {
    resetSearchFilter();
    switchToSection(activeSectionId);
    return;
  }

  let totalMatches = 0;

  // Unhide all sections so matching cards are shown
  sections.forEach(s => {
    let sectionMatches = 0;
    const sectionCards = s.querySelectorAll('.settings-card');

    sectionCards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const isMatch = text.includes(query);

      if (isMatch) {
        card.style.display = '';
        card.classList.add('search-highlight-match');
        sectionMatches++;
        totalMatches++;
      } else {
        card.style.display = 'none';
        card.classList.remove('search-highlight-match');
      }
    });

    // Hide section view if it has no matching cards
    s.hidden = sectionMatches === 0;
  });

  if (searchEmpty) {
    searchEmpty.hidden = totalMatches > 0;
  }
}

function resetSearchFilter() {
  const cards = document.querySelectorAll('.settings-card');
  cards.forEach(card => {
    card.style.display = '';
    card.classList.remove('search-highlight-match');
  });

  const searchEmpty = document.getElementById('settingsSearchEmpty');
  if (searchEmpty) searchEmpty.hidden = true;
}

function trapFocus(modal, e) {
  const focusables = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      last.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
}

function closeModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');

  sectionVoices.stopAudio();
  resetSearchFilter();

  const searchInp = document.getElementById('settingsSearchInp');
  if (searchInp) searchInp.value = '';

  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    previousActiveElement.focus();
  }
}

async function loadAllSettings() {
  try {
    const settings = await ipcClient.getSettings();
    currentLoadedSettings = settings;

    for (const sec of SECTIONS) {
      if (typeof sec.load === 'function') {
        try {
          await sec.load(settings);
        } catch (err) {
          console.error(`Error loading section ${sec.id}:`, err);
        }
      }
    }

    // Ensure mock providers visibility matches loaded developerMode
    updateDeveloperModeUI(Boolean(settings?.system?.developerMode));
  } catch (err) {
    showToast(`Failed to load settings: ${err.message}`);
  }
}

async function saveAllSettings() {
  const saveBtn = document.getElementById('settingsSaveBtn');
  const indicator = document.getElementById('settingsSavedIndicator');

  if (saveBtn) saveBtn.disabled = true;

  try {
    // Gather updated settings from all sections
    const generalData = sectionGeneral.getData();
    const themeData = sectionTheme.getData();
    const geminiData = sectionKeys.getData();
    const asrData = sectionAsr.getData();
    const voiceData = sectionVoices.getData();
    const ttsData = sectionVoices.getTtsData ? sectionVoices.getTtsData() : { engine: 'edge-tts', concurrency: 4 };
    const shortcutsData = sectionShortcuts.getData();
    const systemData = sectionSystem.getData();
    const separationData = sectionSystem.getSeparationData ? sectionSystem.getSeparationData() : { engine: 'demucs' };

    const fullSettings = {
      general: generalData,
      theme: themeData,
      gemini: geminiData,
      asr: asrData,
      tts: ttsData,
      separation: separationData,
      voicePresets: voiceData,
      shortcuts: shortcutsData,
      system: systemData
    };

    const res = await ipcClient.updateSettings(fullSettings);

    if (res && res.success) {
      isDirty = false;
      currentLoadedSettings = res.settings || fullSettings;

      // Show saved indicator animation
      if (indicator) {
        indicator.hidden = false;
        setTimeout(() => {
          indicator.hidden = true;
        }, 3000);
      }

      showToast(t('projectSaved') || 'Settings saved successfully ✓');

      // Update shortcuts and settings in live app instance
      window.dispatchEvent(new CustomEvent('app:shortcuts-updated', { detail: shortcutsData }));
      window.dispatchEvent(new CustomEvent('app:settings-updated', { detail: fullSettings }));

      // If restart is required, leave badge visible
      if (restartRequired) {
        const badge = document.getElementById('settingsRestartBadge');
        if (badge) badge.hidden = false;
      }
    } else {
      showToast(`Failed to save settings: ${res?.error || 'Unknown error'}`);
      if (saveBtn) saveBtn.disabled = false;
    }
  } catch (err) {
    showToast(`Save error: ${err.message}`);
    if (saveBtn) saveBtn.disabled = false;
  }
}
