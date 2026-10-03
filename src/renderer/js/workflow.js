/**
 * Workflow & Job Progress Controller
 * Manages:
 * 1. Primary button logic (Transcribe -> Translate -> Generate Audio -> Export)
 * 2. Export button prerequisite state (disabled with tooltip until audio is generated)
 * 3. Subtitle table empty state ("Load Video", "Transcribe", "Import SRT", "Add Text")
 * 4. Running job progress display (ASR, Translation, TTS, Export) with percent, ETA & Cancel
 */

import { state } from './state.js';
import { ipcClient } from './ipc-client.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';

export const workflow = {
  progressContainer: null,
  progressMsg: null,
  progressPct: null,
  progressEta: null,
  progressFill: null,
  cancelBtn: null,

  emptyState: null,
  emptyIcon: null,
  emptyTitle: null,
  emptyDesc: null,
  emptyBtnPrimary: null,
  emptyBtnOpenProj: null,
  emptyBtnNewProj: null,
  emptyBtnSampleProj: null,
  emptyBtnImport: null,
  emptyBtnAdd: null,
  emptyRecentsContainer: null,
  emptyRecentsList: null,
  exportTopBtn: null,

  currentRunningJob: null,

  init() {
    this.progressContainer = document.getElementById('jobProgressBanner');
    this.progressMsg = document.getElementById('jobProgressMsg');
    this.progressPct = document.getElementById('jobProgressPct');
    this.progressEta = document.getElementById('jobProgressEta');
    this.progressFill = document.getElementById('jobProgressFill');
    this.cancelBtn = document.getElementById('jobCancelBtn');

    this.emptyState = document.getElementById('tableEmptyState');
    this.emptyIcon = document.getElementById('emptyIcon');
    this.emptyTitle = document.getElementById('emptyTitle');
    this.emptyDesc = document.getElementById('emptyDesc');
    this.emptyBtnPrimary = document.getElementById('emptyBtnPrimary');
    this.emptyBtnOpenProj = document.getElementById('emptyBtnOpenProj');
    this.emptyBtnNewProj = document.getElementById('emptyBtnNewProj');
    this.emptyBtnSampleProj = document.getElementById('emptyBtnSampleProj');
    this.emptyBtnImport = document.getElementById('emptyBtnImport');
    this.emptyBtnAdd = document.getElementById('emptyBtnAdd');
    this.emptyRecentsContainer = document.getElementById('emptyRecentsContainer');
    this.emptyRecentsList = document.getElementById('emptyRecentsList');
    this.exportTopBtn = document.getElementById('export');

    this.attachEventListeners();
    this.attachProgressListeners();

    state.on('change', (payload) => {
      if (payload && payload.source === 'transcribe' && this.currentRunningJob === 'asr') {
        setTimeout(() => this.hideProgress(), 600);
      } else if (payload && payload.source === 'translation' && this.currentRunningJob === 'translation') {
        setTimeout(() => this.hideProgress(), 600);
      } else if (payload && payload.source === 'generateAudioComplete' && this.currentRunningJob === 'tts') {
        setTimeout(() => this.hideProgress(), 600);
      }
      this.update();
    });
    state.on('projectLoaded', () => this.update());
    state.on('languageChange', () => this.update());

    this.update();
  },

  getWorkflowData() {
    const hasVideo = Boolean(
      state.project.videoFilePath ||
      state.project.videoPath ||
      (state.thumbnails && state.thumbnails.length > 0)
    );
    const hasSegments = Array.isArray(state.rows) && state.rows.length > 0;
    const hasTranslation = hasSegments && state.rows.some(r => r.t && r.t.trim().length > 0);
    const hasVoices = hasSegments && state.rows.some(r => r.v != null && r.v >= 0);
    const hasAudio = hasSegments && (state.rows.some(r => r.ok) || Boolean(state.project.a1Path));

    return {
      hasVideo,
      hasSegments,
      hasTranslation,
      hasVoices,
      hasAudio
    };
  },

  update() {
    const { hasVideo, hasSegments, hasTranslation, hasAudio } = this.getWorkflowData();

    // 1. Top Bar Export Video Button prerequisite validation
    if (this.exportTopBtn) {
      this.exportTopBtn.disabled = !hasAudio;
      this.exportTopBtn.classList.toggle('disabled', !hasAudio);
      this.exportTopBtn.title = !hasAudio
        ? (i18n.t('generateAudioFirstTooltip') || i18n.t('generateAudioFirst') || 'Generate audio before exporting video')
        : (i18n.t('exportVideo') || 'Export Video');
    }

    // 2. Subtitle Table Empty State
    this.updateTableEmptyState(hasVideo, hasSegments);

    // 3. Dynamically update primary workflow button and disabled states
    this.updateWorkflowButtons();
  },

  updateWorkflowButtons() {
    const transBtn = document.getElementById('trans');
    const translateBtn = document.getElementById('translateBtn');
    const genBtn = document.getElementById('gen');
    const exportBtn = document.getElementById('export');

    [transBtn, translateBtn, genBtn, exportBtn].forEach(b => b?.classList.remove('primary'));

    const { hasVideo, hasSegments, hasTranslation, hasAudio } = this.getWorkflowData();

    // Primary button logic:
    // No segments -> Transcribe is primary
    // Segments not all translated -> Translate is primary
    // Translated -> Generate Selected Audio is primary
    // Audio generated -> Export Video is primary
    if (!hasSegments) {
      if (transBtn) {
        transBtn.classList.add('primary');
        transBtn.title = hasVideo ? (i18n.t('transcribe') || 'Transcribe speech') : (i18n.t('loadVideoFirst') || 'Load video first');
      }
      if (translateBtn) {
        translateBtn.disabled = true;
        translateBtn.title = i18n.t('transcribeFirst') || 'Transcribe speech first';
      }
      if (genBtn) {
        genBtn.disabled = true;
        genBtn.title = i18n.t('transcribeFirst') || 'Transcribe speech first';
      }
    } else if (!hasTranslation) {
      if (translateBtn) {
        translateBtn.disabled = false;
        translateBtn.classList.add('primary');
        translateBtn.title = i18n.t('translate') || 'Translate subtitles';
      }
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.title = i18n.t('generateSelected') || 'Generate Audio';
      }
    } else if (!hasAudio) {
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.classList.add('primary');
        genBtn.title = i18n.t('generateSelected') || 'Generate Audio';
      }
      if (translateBtn) {
        translateBtn.disabled = false;
      }
    } else {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.classList.add('primary');
        exportBtn.title = i18n.t('exportVideo') || 'Export finished video';
      }
      if (genBtn) genBtn.disabled = false;
      if (translateBtn) translateBtn.disabled = false;
    }
  },

  updateTableEmptyState(hasVideo, hasSegments) {
    if (!this.emptyState) return;

    const tableEl = document.querySelector('.scroll-table-container table');

    if (!hasSegments) {
      this.emptyState.hidden = false;
      if (tableEl) tableEl.style.display = 'none';

      if (!hasVideo) {
        if (this.emptyIcon) {
          this.emptyIcon.innerHTML = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>`;
        }
        if (this.emptyTitle) this.emptyTitle.textContent = i18n.t('noVideoLoaded') || 'Load a video to start';
        if (this.emptyDesc) this.emptyDesc.textContent = i18n.t('noVideoLoadedDesc') || 'Choose a video file to begin transcription, translation, and AI dubbing';
        if (this.emptyBtnPrimary) {
          this.emptyBtnPrimary.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg><span>${i18n.t('loadVideoBtn') || 'Load Video'}</span>`;
          this.emptyBtnPrimary.dataset.action = 'loadVideo';
        }
        if (this.emptyBtnOpenProj) this.emptyBtnOpenProj.hidden = false;
        if (this.emptyBtnNewProj) this.emptyBtnNewProj.hidden = false;
        if (this.emptyBtnSampleProj) this.emptyBtnSampleProj.hidden = false;
        if (this.emptyBtnImport) this.emptyBtnImport.hidden = true;
        if (this.emptyBtnAdd) this.emptyBtnAdd.hidden = true;
        if (this.emptyRecentsContainer) {
          this.emptyRecentsContainer.hidden = false;
          this.renderRecentProjects();
        }
      } else {
        if (this.emptyIcon) {
          this.emptyIcon.innerHTML = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`;
        }
        if (this.emptyTitle) this.emptyTitle.textContent = i18n.t('noSubsYet') || 'No subtitles yet';
        if (this.emptyDesc) this.emptyDesc.textContent = i18n.t('noSubsYetDesc') || 'Run speech recognition to generate subtitles, import an existing SRT file, or add text manually';
        if (this.emptyBtnPrimary) {
          this.emptyBtnPrimary.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg><span>${i18n.t('transcribeBtn') || 'Transcribe'}</span>`;
          this.emptyBtnPrimary.dataset.action = 'transcribe';
        }
        if (this.emptyBtnOpenProj) this.emptyBtnOpenProj.hidden = true;
        if (this.emptyBtnNewProj) this.emptyBtnNewProj.hidden = true;
        if (this.emptyBtnSampleProj) this.emptyBtnSampleProj.hidden = true;
        if (this.emptyRecentsContainer) this.emptyRecentsContainer.hidden = true;
        if (this.emptyBtnImport) {
          this.emptyBtnImport.hidden = false;
          this.emptyBtnImport.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span>${i18n.t('importSrtBtn') || 'Import SRT/VTT'}</span>`;
        }
        if (this.emptyBtnAdd) {
          this.emptyBtnAdd.hidden = false;
          this.emptyBtnAdd.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg><span>${i18n.t('addTextBtn') || 'Add Text'}</span>`;
        }
      }
    } else {
      this.emptyState.hidden = true;
      if (this.emptyRecentsContainer) this.emptyRecentsContainer.hidden = true;
      if (tableEl) tableEl.style.display = '';
    }
  },

  async renderRecentProjects() {
    if (!this.emptyRecentsList) return;
    try {
      const recents = await ipcClient.getRecentProjects(true);
      if (!recents || recents.length === 0) {
        this.emptyRecentsList.innerHTML = `<div class="empty-recents-none">${i18n.t('noRecentProjects') || 'No recent projects'}</div>`;
        return;
      }

      this.emptyRecentsList.innerHTML = '';
      recents.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'recent-item';

        const main = document.createElement('div');
        main.className = 'recent-item-main';

        const nameEl = document.createElement('div');
        nameEl.className = 'recent-item-name';
        nameEl.textContent = proj.name || 'Untitled';

        const pathEl = document.createElement('div');
        pathEl.className = 'recent-item-path';
        pathEl.textContent = proj.projectDir || '';
        pathEl.title = proj.projectDir || '';

        main.appendChild(nameEl);
        main.appendChild(pathEl);

        const dateEl = document.createElement('div');
        dateEl.className = 'recent-item-date';
        dateEl.textContent = proj.lastOpenedAt ? new Date(proj.lastOpenedAt).toLocaleDateString() : '';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn ic recent-remove-btn';
        removeBtn.title = i18n.t('removeFromList') || 'Remove from list';
        removeBtn.setAttribute('aria-label', i18n.t('removeFromList') || 'Remove from list');
        removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await ipcClient.removeRecentProject(proj.projectDir);
          await this.renderRecentProjects();
        });

        main.addEventListener('click', () => {
          if (window.__app?.openProjectFromDir) {
            window.__app.openProjectFromDir(proj.projectDir);
          } else if (window.__app?.openProjectFile) {
            window.__app.openProjectFile(proj.projectJsonPath || `${proj.projectDir}/project.json`);
          }
        });

        item.appendChild(main);
        item.appendChild(dateEl);
        item.appendChild(removeBtn);
        this.emptyRecentsList.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to render recent projects:', err);
    }
  },

  attachEventListeners() {
    // Empty state action buttons
    if (this.emptyBtnPrimary) {
      this.emptyBtnPrimary.addEventListener('click', () => {
        const action = this.emptyBtnPrimary.dataset.action;
        if (action === 'loadVideo') {
          const loadBtn = document.getElementById('loadVideoBtn') || document.getElementById('openBtn');
          loadBtn?.click();
        } else {
          document.getElementById('trans')?.click();
        }
      });
    }

    if (this.emptyBtnOpenProj) {
      this.emptyBtnOpenProj.addEventListener('click', () => {
        document.getElementById('openBtn')?.click();
      });
    }

    if (this.emptyBtnNewProj) {
      this.emptyBtnNewProj.addEventListener('click', () => {
        document.getElementById('newBtn')?.click();
      });
    }

    if (this.emptyBtnSampleProj) {
      this.emptyBtnSampleProj.addEventListener('click', async () => {
        try {
          const samplePath = await ipcClient.getSampleProjectPath();
          if (!samplePath) {
            ui.showToast('Sample project file not found', 3000);
            return;
          }
          if (window.app && typeof window.app.openProjectFile === 'function') {
            await window.app.openProjectFile(samplePath);
          }
        } catch (err) {
          ui.showError(err, 'openSampleProject');
        }
      });
    }

    if (this.emptyBtnImport) {
      this.emptyBtnImport.addEventListener('click', () => {
        document.getElementById('importSrtBtn')?.click();
      });
    }

    if (this.emptyBtnAdd) {
      this.emptyBtnAdd.addEventListener('click', () => {
        document.getElementById('add')?.click();
      });
    }

    // Cancel running task button
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', async () => {
        const job = this.currentRunningJob;
        try {
          if (job === 'asr') {
            await ipcClient.cancelTranscribe();
          } else if (job === 'translation') {
            await ipcClient.cancelTranslate();
          } else if (job === 'tts') {
            await ipcClient.cancelTts();
          } else if (job === 'export') {
            await ipcClient.cancelExport();
          }
        } catch (_) {}
        this.hideProgress();
        if (job) {
          ui.showToast(i18n.t('cancel') || 'Operation cancelled');
        }
      });
    }
  },

  showProgress(jobType, msg, percent, eta = null) {
    this.currentRunningJob = jobType;

    if (this.progressContainer) {
      this.progressContainer.hidden = false;
    }
    if (this.progressMsg) {
      this.progressMsg.textContent = msg;
    }
    const cleanPct = Math.min(100, Math.max(0, Math.round(percent)));
    if (this.progressPct) {
      this.progressPct.textContent = `${cleanPct}%`;
    }
    if (this.progressEta) {
      this.progressEta.textContent = eta ? `(ETA: ${eta})` : '';
    }
    if (this.progressFill) {
      this.progressFill.style.width = `${cleanPct}%`;
    }
    if (this.cancelBtn) {
      this.cancelBtn.hidden = (cleanPct >= 100);
    }
    const spinner = this.progressContainer?.querySelector('.job-progress-spinner');
    if (spinner) {
      spinner.style.display = cleanPct >= 100 ? 'none' : 'inline-flex';
    }
  },

  hideProgress() {
    this.currentRunningJob = null;
    if (this.progressContainer) {
      this.progressContainer.hidden = true;
    }
    if (this.cancelBtn) {
      this.cancelBtn.hidden = false;
    }
    const spinner = this.progressContainer?.querySelector('.job-progress-spinner');
    if (spinner) {
      spinner.style.display = 'inline-flex';
    }
    this.update();
  },

  attachProgressListeners() {
    // 1. ASR Transcription progress
    ipcClient.on('asr:progress', (prog) => {
      if (prog && prog.percent != null) {
        if (prog.percent >= 100) {
          this.showProgress('asr', prog.message || i18n.t('transcribeSuccess') || 'Transcription complete!', 100);
          setTimeout(() => this.hideProgress(), 800);
        } else {
          this.showProgress('asr', prog.message || i18n.t('transcribingProgress') || 'Transcribing speech...', prog.percent, prog.eta);
        }
      }
    });

    // 2. Translation progress
    ipcClient.on('translation:progress', (prog) => {
      if (prog && prog.percent != null) {
        if (prog.percent >= 100) {
          this.showProgress('translation', prog.message || i18n.t('translationSuccess') || 'Translation complete!', 100);
          setTimeout(() => this.hideProgress(), 800);
        } else {
          this.showProgress('translation', prog.message || i18n.t('translatingProgress') || 'Translating subtitles...', prog.percent, prog.eta);
        }
      }
    });

    // 3. TTS Generation progress
    ipcClient.on('tts:progress', (prog) => {
      if (prog && prog.percent != null) {
        if (prog.percent >= 100) {
          this.showProgress('tts', prog.message || 'Voice audio generated!', 100);
          setTimeout(() => this.hideProgress(), 800);
        } else {
          this.showProgress('tts', prog.message || i18n.t('generatingAudioProgress') || 'Generating voice audio...', prog.percent, prog.eta);
        }
      }
    });

    // 4. Export Video progress
    ipcClient.on('export:progress', (prog) => {
      if (prog && prog.percent != null) {
        if (prog.percent >= 100) {
          this.showProgress('export', prog.message || i18n.t('exportSuccess') || 'Video export complete!', 100);
          setTimeout(() => this.hideProgress(), 800);
        } else {
          this.showProgress('export', prog.message || i18n.t('exportingVideoProgress') || 'Exporting video...', prog.percent, prog.eta);
        }
      }
    });
  }
};
