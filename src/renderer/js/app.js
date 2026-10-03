/**
 * Main Application Orchestrator
 * Wires together State, i18n, Theme, UI, Table, Timeline, Player, and IPC
 */

import { state, VOICES, getProjectDuration } from './state.js';
import { i18n } from './i18n.js';
import { theme } from './theme.js';
import { ui } from './ui.js';
import { table } from './table.js';
import { timeline } from './timeline.js';
import { player } from './player.js';
import { ipcClient } from './ipc-client.js';
import { parseSubtitles, serializeToSrt, serializeToVtt } from './subtitle-utils.js';
import { initSettingsModal } from './settings-modal.js';
import { initTranscribeModal } from './transcribe-modal.js';
import { initTranslationModal } from './translation-modal.js';
import { initExportModal, openExportModal, openIntroOutroModal } from './export-modal.js';
import { initCoverModal } from './cover-modal.js';
import { initVisualTools } from './visual-tools.js';
import { cast } from './cast.js';
import { workflow } from './workflow.js';
import { updateDeveloperModeUI } from './settings/section-system.js';

export class App {
  constructor() {
    this.initialized = false;
    this.isIsolatingBgm = false;
  }

  init() {
    if (this.initialized) return;

    // 1. Initialize core system modules
    theme.init();
    i18n.init();
    ui.initStatusPoller();

    // 2. Initialize UI components
    table.init();
    timeline.init();
    player.init();
    cast.init();
    workflow.init();
    initSettingsModal();
    initTranscribeModal();
    initTranslationModal();
    initExportModal();
    initCoverModal();
    initVisualTools();


    this.initWelcomeModal();

    window.__app = {
      state,
      timeline,
      player,
      ui,
      i18n,
      workflow,
      table,
      theme,
      createNewProject: () => this.createNewProject(),
      openProjectFile: (path) => this.openProjectFile(path),
      openProjectFromDir: (dir) => this.openProjectFromDir(dir)
    };
    window.state = state;

    // Init Gemini Key Pool status
    this.initKeysStatus();
    this.initTtsStatusListener();

    // 2b. Initialize dynamic keyboard shortcuts from settings
    this.shortcuts = {
      playPause: 'Space',
      split: 'KeyS',
      save: 'Ctrl+KeyS',
      undo: 'Ctrl+KeyZ',
      redo: 'Ctrl+KeyY',
      findReplace: 'Ctrl+KeyF',
      deleteRow: 'Delete',
      prevRow: 'ArrowUp',
      nextRow: 'ArrowDown'
    };

    this.confirmDelete = true;

    ipcClient.getSettings().then(s => {
      if (s?.shortcuts) this.shortcuts = { ...this.shortcuts, ...s.shortcuts };
      if (s?.general?.autosaveIntervalSec !== undefined) {
        state.initAutosaveLoop(s.general.autosaveIntervalSec);
      }
      if (s?.general?.confirmDelete !== undefined) {
        this.confirmDelete = s.general.confirmDelete;
      }
      if (s?.system?.developerMode !== undefined) {
        updateDeveloperModeUI(Boolean(s.system.developerMode));
      }
    }).catch(() => {});

    window.addEventListener('app:shortcuts-updated', e => {
      if (e.detail) this.shortcuts = { ...this.shortcuts, ...e.detail };
    });

    window.addEventListener('app:settings-updated', e => {
      const s = e.detail;
      if (s?.general?.autosaveIntervalSec !== undefined) {
        state.initAutosaveLoop(s.general.autosaveIntervalSec);
      }
      if (s?.general?.confirmDelete !== undefined) {
        this.confirmDelete = s.general.confirmDelete;
      }
      if (s?.shortcuts) {
        this.shortcuts = { ...this.shortcuts, ...s.shortcuts };
      }
      if (s?.system?.developerMode !== undefined) {
        updateDeveloperModeUI(Boolean(s.system.developerMode));
      }
    });

    // 3. Setup event listeners and keyboard shortcuts
    this.bindHeaderActions();
    this.bindSubtitleActions();
    this.bindWorkspaceToolActions();
    this.bindFindReplaceActions();
    this.bindKeyboardShortcuts();

    // 4. Update undo/redo button states on history changes
    state.on('historyChange', ({ canUndo, canRedo }) => {
      const undoBtn = document.getElementById('undo');
      const redoBtn = document.getElementById('redo');
      if (undoBtn) {
        undoBtn.disabled = !canUndo;
        undoBtn.title = canUndo ? (i18n.t('undo') || 'Undo (Ctrl+Z)') : 'No actions to undo (Ctrl+Z)';
      }
      if (redoBtn) {
        redoBtn.disabled = !canRedo;
        redoBtn.title = canRedo ? (i18n.t('redo') || 'Redo (Ctrl+Y)') : 'No actions to redo (Ctrl+Y)';
      }
    });

    // 5. Update Project UI and Workspace Tools upon project load and state change
    state.on('projectLoaded', (proj) => {
      this.updateProjectDisplay(proj);
      this.updateWorkspaceToolsUI();
    });

    state.on('change', () => {
      this.updateWorkspaceToolsUI();
    });

    state.on('muteChange', () => {
      this.updateMuteUI();
    });

    // 6. Autosave notification
    state.on('autosaved', () => {
      const footerPname = document.getElementById('pname');
      if (footerPname) {
        const origText = footerPname.textContent;
        footerPname.textContent = `${origText} (✓ ${i18n.t('autosavedStatus')})`;
        setTimeout(() => {
          footerPname.textContent = origText;
        }, 2000);
      }
    });

    // Close popovers when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('#cast') && !e.target.closest('#pop')) {
        ui.hideCastPopover();
      }
    });

    this.initialized = true;
    console.log('AI Dubbing Studio initialized successfully.');

    // 7. Startup action (clean start screen vs reopen last project)
    this.handleStartupAction();
  }

  updateProjectDisplay(proj) {
    const projHeader = document.getElementById('proj');
    const projFooter = document.getElementById('pname');
    const fileInfo = document.querySelector('.file-info');

    const name = proj?.name || '';
    if (name) {
      document.title = `${name} - AI Dubbing Studio`;
      if (projHeader) projHeader.textContent = name;
      if (projFooter) projFooter.textContent = name;
      const filename = proj.filename || name + '.mp4';
      if (fileInfo) {
        fileInfo.title = filename;
        fileInfo.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg><span>${filename}</span>`;
      }
    } else {
      document.title = 'AI Dubbing Studio';
      if (projHeader) projHeader.textContent = '';
      if (projFooter) projFooter.textContent = i18n.t('noProject') || 'No project loaded';
      if (fileInfo) {
        fileInfo.title = '';
        fileInfo.innerHTML = '';
      }
    }
    this.updateWorkspaceToolsUI();
  }

  updateWorkspaceToolsUI() {
    // 1. Video Button
    const videoBtn = document.getElementById('loadVideoBtn');
    const videoBadge = document.getElementById('videoLoadedBadge');
    const hasVideo = Boolean(state.project?.videoFilePath);
    if (videoBtn) {
      videoBtn.classList.toggle('has-file', hasVideo);
      if (hasVideo) {
        const vName = state.project.videoFilePath.split(/[\\/]/).pop();
        videoBtn.title = `Video: ${vName} (Click to replace)`;
      } else {
        videoBtn.title = 'Load Video';
      }
    }
    if (videoBadge) {
      videoBadge.hidden = !hasVideo;
    }

    // 2. BGM Button
    const bgmBtn = document.getElementById('loadBgmBtn');
    const bgmBadge = document.getElementById('bgmLoadedBadge');
    const bgmClear = document.getElementById('bgmClearBtn');
    const hasBgm = Boolean(state.project?.bgmPath);
    if (bgmBtn) {
      bgmBtn.classList.toggle('has-file', hasBgm);
      if (hasBgm) {
        const bName = state.project.bgmPath.split(/[\\/]/).pop();
        bgmBtn.title = `BGM: ${bName} (Click to change, right-click to unload)`;
      } else {
        bgmBtn.title = 'Load BGM audio track';
      }
    }
    if (bgmBadge) bgmBadge.hidden = !hasBgm;
    if (bgmClear) bgmClear.hidden = !hasBgm;

    // 3. A1 Dub Button
    const a1Btn = document.getElementById('loadA1Btn');
    const a1Badge = document.getElementById('a1LoadedBadge');
    const a1Clear = document.getElementById('a1ClearBtn');
    const hasA1 = Boolean(state.project?.a1Path);
    if (a1Btn) {
      a1Btn.classList.toggle('has-file', hasA1);
      if (hasA1) {
        const aName = state.project.a1Path.split(/[\\/]/).pop();
        a1Btn.title = `A1 Dub: ${aName} (Click to change, right-click to unload)`;
      } else {
        a1Btn.title = 'Load A1 dub audio track';
      }
    }
    if (a1Badge) a1Badge.hidden = !hasA1;
    if (a1Clear) a1Clear.hidden = !hasA1;

    // 4. Isolate BGM Button
    const isoBtn = document.getElementById('isolateBgmBtn');
    if (isoBtn && !this.isIsolatingBgm) {
      const hasAudioSource = Boolean(state.project?.videoFilePath || state.project?.paths?.originalAudio);
      isoBtn.disabled = !hasAudioSource;
      isoBtn.classList.toggle('has-file', hasBgm);
      isoBtn.title = hasBgm
        ? 'BGM already separated. Click to re-isolate'
        : (hasAudioSource ? 'Isolate BGM and vocals using AI (Demucs)' : 'Load a video first to isolate BGM');
    }

    // 5. Mute Button
    this.updateMuteUI();

    // 6. Export SRT Button
    const expBtn = document.getElementById('exportSrtBtn');
    const srtCountBadge = document.getElementById('exportSrtCountBadge');
    const rowCount = state.rows ? state.rows.length : 0;
    if (expBtn) {
      expBtn.title = rowCount > 0
        ? `Export ${rowCount} subtitle segments (SRT / VTT / TXT)`
        : 'No subtitles to export yet (Transcribe or import first)';
      expBtn.classList.toggle('has-file', rowCount > 0);
    }
    if (srtCountBadge) {
      srtCountBadge.hidden = rowCount === 0;
      srtCountBadge.textContent = String(rowCount);
    }

    // 7. Intro & Outro Button
    const ioBtn = document.getElementById('introOutroBtn');
    const ioBadge = document.getElementById('introOutroBadge');
    const hasIntro = Boolean(state.project?.introPath);
    const hasOutro = Boolean(state.project?.outroPath);
    const hasIo = hasIntro || hasOutro;
    if (ioBtn) {
      ioBtn.classList.toggle('has-file', hasIo);
      if (hasIo) {
        const label = (hasIntro && hasOutro) ? 'Intro+Outro' : (hasIntro ? 'Intro' : 'Outro');
        ioBtn.title = `Configured: ${label} (Click to edit)`;
        if (ioBadge) {
          ioBadge.hidden = false;
          ioBadge.textContent = label;
        }
      } else {
        ioBtn.title = 'Configure Intro & Outro clips';
        if (ioBadge) {
          ioBadge.hidden = true;
          ioBadge.textContent = '✓';
        }
      }
    }

    this.updateMuteUI();
  }

  updateMuteUI() {
    const isMuted = Boolean(state.timeline?.muted);
    const muteBtn = document.getElementById('mute');
    if (muteBtn) {
      muteBtn.classList.toggle('on', isMuted);
      muteBtn.classList.toggle('muted-active', isMuted);
      muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');

      const iconSpan = muteBtn.querySelector('.tool-icon');
      const labelSpan = muteBtn.querySelector('.tool-label') || muteBtn.querySelector('span:not(.tool-icon)');

      if (iconSpan) {
        iconSpan.innerHTML = isMuted
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      }
      if (labelSpan) {
        labelSpan.textContent = isMuted
          ? (i18n.t('audioMuted') || 'បិទសម្លេងដើម')
          : (i18n.t('audioUnmuted') || 'សម្លេងដើមបើក');
      }
      muteBtn.title = isMuted
        ? 'Original video audio is muted. Click to unmute (M)'
        : 'Original video audio is active. Click to mute (M)';
    }

    const tlMuteOrig = document.getElementById('tlMuteOrig');
    if (tlMuteOrig) {
      tlMuteOrig.classList.toggle('on', isMuted);
      tlMuteOrig.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    }
  }

  createNewProject() {
    state.resetToEmpty(true);
    player.unloadVideo();
    this.updateProjectDisplay(state.project);
    ui.showToast(i18n.t('newProjectCreated') || 'New project created', 2000);
  }

  async openProjectFromDir(projectDir) {
    const projectJsonPath = `${projectDir}/project.json`.replace(/\\/g, '/');
    return await this.openProjectFile(projectJsonPath);
  }

  async handleStartupAction() {
    try {
      const settings = await ipcClient.getSettings();
      const startupAction = settings?.general?.startupAction || 'startScreen';
      if (startupAction === 'reopenLast') {
        const recents = await ipcClient.getRecentProjects(true);
        if (recents && recents.length > 0) {
          const last = recents[0];
          const success = await this.openProjectFile(last.projectJsonPath || `${last.projectDir}/project.json`);
          if (!success) {
            ui.showToast(i18n.t('projectNotFound') || 'Project folder not found on disk, returning to start screen', 4000);
            this.createNewProject();
          }
        } else {
          this.updateProjectDisplay(state.project);
        }
      } else {
        this.updateProjectDisplay(state.project);
      }
    } catch (err) {
      console.warn('Error during startup action:', err);
      this.updateProjectDisplay(state.project);
    }
  }

  async importVideo(videoPath) {
    ui.showToast(i18n.t('videoImporting'), 4000);
    try {
      const res = await ipcClient.createProjectFromVideo(videoPath);
      if (res.error) {
        ui.showToast(`Error: ${res.error}`, 4000);
        return;
      }

      state.loadProjectData(
        res.project,
        res.peaks,
        res.thumbnails,
        res.projectJsonPath,
        res.projectDir
      );

      this.updateProjectDisplay(res.project);
      ui.showToast(i18n.t('videoImportSuccess'), 2500);
    } catch (err) {
      console.error('Failed to import video:', err);
      ui.showToast(`Import failed: ${err.message}`, 4000);
    }
  }

  async openProjectFile(projectJsonPath) {
    try {
      const res = await ipcClient.loadProject(projectJsonPath);
      if (res.error) {
        ui.showToast(`${i18n.t('projectNotFound') || 'Project not found'}: ${res.error}`, 4000);
        return false;
      }

      state.loadProjectData(
        res.project,
        res.peaks,
        res.thumbnails,
        res.projectJsonPath,
        res.projectDir
      );

      this.updateProjectDisplay(res.project);
      ui.showToast(i18n.t('projectLoaded'), 2500);
      return true;
    } catch (err) {
      console.error('Failed to load project:', err);
      ui.showToast(`Load failed: ${err.message}`, 4000);
      return false;
    }
  }

  async saveCurrentProject() {
    try {
      if (!state.project.projectJsonPath) {
        const dialogRes = await ipcClient.saveFileDialog(`${state.project.name}.json`);
        if (dialogRes.canceled || !dialogRes.filePath) return;
        state.project.projectJsonPath = dialogRes.filePath;
      }

      const data = state.serializeProject();
      await ipcClient.saveProject(state.project.projectJsonPath, data);
      state.project.isDirty = false;
      ui.showToast(i18n.t('projectSaved'), 2000);
    } catch (err) {
      console.error('Failed to save project:', err);
      ui.showToast(`Save failed: ${err.message}`, 3000);
    }
  }

  async exportSrt() {
    try {
      if (!state.rows || state.rows.length === 0) {
        ui.showToast(i18n.t('noSubtitlesToExport') || 'មិនទាន់មានអត្ថបទរងសម្រាប់នាំចេញទេ (No subtitles to export)', 3000);
        return;
      }

      const defaultName = `${state.project.name || 'subtitles'}.srt`;
      const res = await ipcClient.exportSubtitleDialog(defaultName, 'srt');
      if (res.canceled || !res.filePath) return;

      const lower = res.filePath.toLowerCase();
      let content = '';
      if (lower.endsWith('.vtt')) {
        content = serializeToVtt(state.rows);
      } else if (lower.endsWith('.txt')) {
        content = state.rows.map(r => r.t).filter(Boolean).join('\n');
      } else {
        content = serializeToSrt(state.rows);
      }

      await ipcClient.writeFileText(res.filePath, content);
      ui.showToast(i18n.t('srtExportSuccess') || `បាននាំចេញអត្ថបទរង ${state.rows.length} ជួរដោយជោគជ័យ!`, 2500);
    } catch (err) {
      console.error('Failed to export subtitles:', err);
      ui.showToast(`Export failed: ${err.message}`, 3000);
    }
  }

  async importSubtitles() {
    try {
      const res = await ipcClient.openFileDialog('srt');
      if (res.canceled || !res.filePaths?.length) return;

      const filePath = res.filePaths[0];
      const readRes = await ipcClient.readFileText(filePath);
      if (!readRes.success || !readRes.content) {
        ui.showToast('Could not read subtitle file');
        return;
      }

      const parsed = parseSubtitles(readRes.content);
      if (!parsed.length) {
        ui.showToast('No subtitle segments found in file');
        return;
      }

      // If existing subtitles exist, confirm replacement or append
      let shouldAppend = false;
      if (state.rows && state.rows.length > 0) {
        const replaceChoice = confirm(
          `អ្នកមានអត្ថបទរងចំនួន ${state.rows.length} ជួរបច្ចុប្បន្ន។\n\n- ចុច [OK] ដើម្បីជំនួសចាស់ទាំងអស់ (Replace All)\n- ចុច [Cancel] ដើម្បីបន្ថែមបន្តពីក្រោយ (Append after existing)`
        );
        shouldAppend = !replaceChoice;
      }

      state.snapshot();
      if (shouldAppend) {
        const lastEnd = state.rows.length > 0 ? Math.max(...state.rows.map(r => r.e)) : 0;
        const offset = lastEnd > 0 ? (lastEnd + 0.5) : 0;
        const appended = parsed.map(p => ({
          ...p,
          id: state.nextId++,
          s: Math.round((p.s + offset) * 100) / 100,
          e: Math.round((p.e + offset) * 100) / 100
        }));
        state.rows = [...state.rows, ...appended];
        ui.showToast(`បានបន្ថែមអត្ថបទរង ${parsed.length} ជួរបន្តដោយជោគជ័យ`, 2500);
      } else {
        state.rows = parsed.map((p, idx) => ({ ...p, id: idx + 1 }));
        state.nextId = state.rows.length + 1;
        state.selectedId = state.rows[0]?.id || 1;
        ui.showToast(i18n.t('srtImportSuccess', { count: parsed.length }), 2500);
      }

      // Expand duration if subtitles extend beyond current video duration
      const maxEnd = Math.max(...state.rows.map(p => p.e));
      if (maxEnd > state.project.duration) {
        state.project.duration = maxEnd + 1;
      }

      state.emit('change', { source: 'importSubtitles' });
    } catch (err) {
      console.error('Failed to import subtitles:', err);
      ui.showToast(`Import failed: ${err.message}`, 3000);
    }
  }

  unloadBgm() {
    state.snapshot();
    state.project.bgmPath = null;
    state.bgmPeaks = [];
    player.unloadBgmAudio();
    state.emit('change', { source: 'bgmUnloaded' });
    ui.showToast(i18n.t('bgmUnloaded') || 'បានដកតន្ត្រី BGM ចេញ', 2000);
  }

  unloadA1() {
    state.snapshot();
    state.project.a1Path = null;
    state.dubPeaks = [];
    player.unloadA1Audio();
    state.emit('change', { source: 'a1Unloaded' });
    ui.showToast(i18n.t('a1Unloaded') || 'បានដកសម្លេង A1 ចេញ', 2000);
  }

  toggleMute() {
    const isMuted = state.toggleMuted();
    this.updateMuteUI();
    if (player.videoEl) {
      player.videoEl.muted = isMuted;
      player.updateEffectiveVolume();
    }
    ui.showToast(isMuted ? (i18n.t('mutedOriginal') || 'Original audio muted') : (i18n.t('unmutedOriginal') || 'Original audio unmuted'));
  }

  bindHeaderActions() {
    // New project
    document.getElementById('newBtn')?.addEventListener('click', () => {
      this.createNewProject();
    });

    // Open project or media
    document.getElementById('openBtn')?.addEventListener('click', async () => {
      const res = await ipcClient.openFileDialog('all');
      if (!res.canceled && res.filePaths?.length) {
        const selected = res.filePaths[0];
        if (selected.endsWith('.json')) {
          await this.openProjectFile(selected);
        } else {
          await this.importVideo(selected);
        }
      }
    });

    // Undo / Redo
    document.getElementById('undo')?.addEventListener('click', () => {
      state.undo();
    });

    document.getElementById('redo')?.addEventListener('click', () => {
      state.redo();
    });

    // Language switch
    document.getElementById('lang')?.addEventListener('click', () => {
      const next = i18n.toggleLanguage();
      ui.showToast(next === 'km' ? i18n.t('switchedLanguage') : 'Language switched to English');
    });

    // Theme switch
    document.getElementById('theme')?.addEventListener('click', () => {
      const nextTheme = theme.toggleTheme();
      ui.showToast(nextTheme === 'light' ? 'Light mode enabled' : 'Dark mode enabled');
    });

    // Welcome Guide
    document.getElementById('welcomeBtn')?.addEventListener('click', () => {
      ui.openWelcomeModal();
    });

    // Export Video Modal
    document.getElementById('export')?.addEventListener('click', () => {
      openExportModal();
    });
  }

  async initKeysStatus() {
    const keysTxt = document.getElementById('keysStatusTxt');
    const keysFooter = document.getElementById('keysStatus');
    const update = (status) => {
      if (keysTxt && status) {
        keysTxt.textContent = `Keys ${status.available}/${status.total}`;
      }
      if (keysFooter && status) {
        keysFooter.title = `Gemini API Keys: ${status.available} active of ${status.total} configured (Auto-rotation enabled)`;
      }
    };

    try {
      const status = await ipcClient.getKeysStatus();
      update(status);
    } catch (_) {}

    ipcClient.on('keys:status', (status) => {
      update(status);
    });
  }

  initTtsStatusListener() {
    ipcClient.on('tts:progress', (prog) => {
      if (prog && prog.segmentId) {
        const row = state.rows.find(r => r.id === prog.segmentId);
        if (row) {
          row.generating = false;
          row.ok = true;
          if (prog.audioPath) row.audioPath = prog.audioPath;
          if (prog.duration) row.audioDuration = prog.duration;
          row.overflow = Boolean(prog.overflow);
          row.overflowDelta = prog.overflowDelta || 0;
          state.emit('change', { source: 'ttsProgress' });
        }
      }
    });
  }

  initWelcomeModal() {
    const closeBtn = document.getElementById('welcomeCloseBtn');
    const doneBtn = document.getElementById('welcomeDoneBtn');
    const sampleBtn = document.getElementById('welcomeSampleBtn');
    const testKeyBtn = document.getElementById('welcomeTestKeyBtn');
    const keyInput = document.getElementById('welcomeGeminiKey');
    const keyStatus = document.getElementById('welcomeKeyStatus');
    const modelSelect = document.getElementById('welcomeWhisperModel');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        ui.closeWelcomeModal();
        try { localStorage.setItem('has_seen_welcome_guide', 'true'); } catch (_) {}
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener('click', async () => {
        try {
          if (modelSelect?.value) {
            await ipcClient.updateSettings({ asr: { whisperModel: modelSelect.value } });
          }
          if (keyInput?.value?.trim()) {
            await ipcClient.addGeminiKey(keyInput.value.trim());
          }
          localStorage.setItem('has_seen_welcome_guide', 'true');
        } catch (_) {}
        ui.closeWelcomeModal();
        ui.showToast(i18n.t('settingsSaved') || 'Settings saved', 2000);
      });
    }

    if (sampleBtn) {
      sampleBtn.addEventListener('click', async () => {
        ui.closeWelcomeModal();
        try { localStorage.setItem('has_seen_welcome_guide', 'true'); } catch (_) {}
        const samplePath = await ipcClient.getSampleProjectPath();
        if (samplePath) {
          await this.openProjectFile(samplePath);
        } else {
          ui.showToast('Sample project file not found', 3000);
        }
      });
    }

    if (testKeyBtn && keyInput) {
      testKeyBtn.addEventListener('click', async () => {
        const key = keyInput.value.trim();
        if (!key) {
          if (keyStatus) {
            keyStatus.textContent = 'Please enter an API key to test';
            keyStatus.style.color = 'var(--danger, #f87171)';
          }
          return;
        }
        if (keyStatus) {
          keyStatus.textContent = 'Testing connection...';
          keyStatus.style.color = 'var(--accent, #10b981)';
        }
        testKeyBtn.disabled = true;
        try {
          const res = await ipcClient.testKey(key);
          if (res?.valid) {
            if (keyStatus) {
              keyStatus.textContent = '✓ Connection successful (Gemini API verified)';
              keyStatus.style.color = '#10b981';
            }
          } else {
            if (keyStatus) {
              keyStatus.textContent = `✗ ${res?.error || 'Invalid API key or network error'}`;
              keyStatus.style.color = 'var(--danger, #f87171)';
            }
          }
        } catch (err) {
          if (keyStatus) {
            keyStatus.textContent = `✗ ${err.message}`;
            keyStatus.style.color = 'var(--danger, #f87171)';
          }
        } finally {
          testKeyBtn.disabled = false;
        }
      });
    }

    // First run prompt: show welcome modal if user hasn't seen it and no project is loaded
    try {
      if (!localStorage.getItem('has_seen_welcome_guide') && !state.project?.videoFilePath) {
        setTimeout(() => ui.openWelcomeModal(), 400);
      }
    } catch (_) {}
  }

  bindSubtitleActions() {
    // Add subtitle row
    document.getElementById('add')?.addEventListener('click', () => {
      state.snapshot();
      const cur = state.getCur();
      const start = cur ? cur.e : 0;
      const total = getProjectDuration();
      const end = total > 0 ? Math.min(start + 3.0, total) : (start + 3.0);

      const newRow = {
        id: ++state.nextId,
        s: start,
        e: end,
        t: i18n.t('newTextPlaceholder'),
        v: cur ? cur.v : 0,
        sp: 1.0,
        ok: false,
        ck: false
      };

      const insertIdx = cur ? state.rows.indexOf(cur) + 1 : state.rows.length;
      state.rows.splice(insertIdx, 0, newRow);
      state.selectedId = newRow.id;
      state.emit('change', { source: 'addRow' });
    });

    // Edit button (focus current editable text)
    document.getElementById('edit')?.addEventListener('click', () => {
      const el = document.querySelector('tr.sel .txt');
      if (el) el.focus();
    });

    // Delete button respecting confirmDelete setting with Undo toast
    document.getElementById('del')?.addEventListener('click', () => {
      const targets = state.getTargets();
      if (!targets.length) return;

      if (this.confirmDelete !== false) {
        const msg = targets.length > 1
          ? (i18n.t('confirmDeleteRows', { count: targets.length }) || `Delete ${targets.length} rows?`)
          : (i18n.t('confirmDeleteRow') || 'Delete selected subtitle row?');
        if (!window.confirm(msg)) {
          return;
        }
      }

      state.snapshot();
      state.rows = state.rows.filter(r => !targets.includes(r));
      state.selectedId = state.rows[0]?.id || null;
      state.emit('change', { source: 'deleteRows' });
      ui.showToast(i18n.t('deletedRows', { count: targets.length }) || `Deleted ${targets.length} row(s)`, 4000, {
        text: i18n.t('undo') || 'Undo',
        onClick: () => {
          state.undo();
        }
      });
    });

    // Series sorting toggle
    document.getElementById('series')?.addEventListener('click', e => {
      state.seriesMode = !state.seriesMode;
      e.target.classList.toggle('on', state.seriesMode);
      table.render();
    });

    // Set Voice Popover toggle and outside-click handling
    const setVoiceBtn = document.getElementById('setVoicePopoverBtn');
    const setVoicePopover = document.getElementById('setVoicePopover');
    setVoiceBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (setVoicePopover) {
        setVoicePopover.hidden = !setVoicePopover.hidden;
      }
    });

    // More (...) options toggle
    const moreMenuBtn = document.getElementById('moreMenuBtn');
    const moreMenuDropdown = document.getElementById('moreMenuDropdown');
    moreMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (moreMenuDropdown) {
        moreMenuDropdown.hidden = !moreMenuDropdown.hidden;
      }
    });

    // Dismiss popovers on outside click
    window.addEventListener('click', (e) => {
      if (!e.target.closest('#setVoicePopover') && !e.target.closest('#setVoicePopoverBtn')) {
        if (setVoicePopover) setVoicePopover.hidden = true;
      }
      if (!e.target.closest('#moreMenuDropdown') && !e.target.closest('#moreMenuBtn')) {
        if (moreMenuDropdown) moreMenuDropdown.hidden = true;
      }
    });

    // ResizeObserver on Subtitle Toolbar to collapse items into More menu at narrow widths
    const toolbarEl = document.getElementById('subtitleToolbar');
    const moreWrapper = document.getElementById('moreMenuWrapper');
    const seriesBtn = document.getElementById('series');
    const rightGroup = document.querySelector('.toolbar-group.right');

    if (toolbarEl && window.ResizeObserver) {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width < 680) {
            if (seriesBtn && seriesBtn.parentElement !== moreMenuDropdown) {
              moreMenuDropdown?.appendChild(seriesBtn);
              if (moreWrapper) moreWrapper.hidden = false;
            }
          } else {
            if (seriesBtn && seriesBtn.parentElement === moreMenuDropdown) {
              rightGroup?.insertBefore(seriesBtn, rightGroup.firstChild);
              if (moreWrapper) moreWrapper.hidden = true;
            }
          }
        }
      });
      ro.observe(toolbarEl);
    }

    // Bulk voice assignment (Male / Female)
    const applyVoiceBulk = (gender, selectId) => {
      const selectEl = document.getElementById(selectId);
      if (!selectEl) return;
      const voiceIdx = Number(selectEl.value);

      const checked = state.rows.filter(r => r.ck);
      const targets = checked.length > 0
        ? checked.filter(r => VOICES[r.v]?.[2] === gender)
        : state.rows.filter(r => VOICES[r.v]?.[2] === gender);

      if (!targets.length) {
        ui.showToast(i18n.t('noMatchingGender'));
        return;
      }

      state.snapshot();
      targets.forEach(r => { r.v = voiceIdx; });
      state.emit('change', { source: 'bulkVoice' });
      ui.showToast(i18n.t('assignedVoice', {
        count: targets.length,
        voice: VOICES[voiceIdx][0]
      }));

      // Close popover after successful assignment
      if (setVoicePopover) setVoicePopover.hidden = true;
    };

    document.getElementById('mvOk')?.addEventListener('click', () => applyVoiceBulk('M', 'mv'));
    document.getElementById('fvOk')?.addEventListener('click', () => applyVoiceBulk('F', 'fv'));

    // Find & Replace trigger
    document.getElementById('fr')?.addEventListener('click', () => {
      ui.openFindReplaceModal();
    });

    document.getElementById('gen')?.addEventListener('click', async () => {
      const checked = state.rows.filter(r => r.ck);
      const targets = checked.length > 0 ? checked : state.rows;
      if (!targets.length) {
        ui.showToast('No segments to generate');
        return;
      }

      const genBtn = document.getElementById('gen');
      if (genBtn) {
        genBtn.disabled = true;
        genBtn.classList.add('loading');
      }

      state.snapshot();

      // Mark targets as generating
      targets.forEach(r => {
        r.generating = true;
      });
      state.emit('change', { source: 'generateAudioStart' });
      ui.showToast(i18n.t('generatingAudio') || 'Generating audio...');

      const afLevels = ['off', 'low', 'med', 'high'];
      const autoFitMode = afLevels[state.timeline.autofitIndex] || 'med';
      const syncEnd = state.timeline.syncEnd;

      try {
        const settings = await ipcClient.getSettings();
        const ttsEngine = (settings && settings.asrEngine === 'mock') ? 'mock' : 'edge-tts';

        const res = await ipcClient.synthesizeBatch(targets, {
          engine: ttsEngine,
          autoFitMode,
          syncEnd,
          projectDir: state.project.projectDir || state.project.dir || null
        });

        if (res.success && Array.isArray(res.results)) {
          res.results.forEach(item => {
            const row = state.rows.find(r => r.id === item.id);
            if (row) {
              row.generating = false;
              if (item.ok) {
                row.ok = true;
                row.audioPath = item.audioPath;
                row.audioDuration = item.duration;
                row.overflow = Boolean(item.overflow);
                row.overflowDelta = item.overflowDelta || 0;
                row.appliedTempo = item.appliedTempo || 1.0;
                if (item.clipStart !== undefined) row.clipStart = item.clipStart;
                if (item.clipEnd !== undefined) row.clipEnd = item.clipEnd;
              } else {
                row.ok = false;
              }
            }
          });

          player.syncAudioTracks();
          state.emit('change', { source: 'generateAudioComplete' });

          const activeSegments = state.rows.filter(r => r.ok && r.audioPath);
          if (activeSegments.length > 0) {
            ipcClient.assembleDubTrack({
              segments: activeSegments,
              projectDir: state.project.projectDir || state.project.dir || null,
              totalDuration: getProjectDuration() || 10
            }).then(assembleRes => {
              if (assembleRes && assembleRes.success && assembleRes.audioPath) {
                state.project.a1Path = assembleRes.audioPath;
                if (assembleRes.peaks) state.dubPeaks = assembleRes.peaks;
                player.syncAudioTracks();
                state.emit('change', { source: 'dubTrackAssembled' });
              }
            }).catch(() => {});
          }
          const successCount = res.results.filter(x => x.ok).length;
          ui.showToast(i18n.t('audioBatchSuccess', { count: successCount }));
          state.triggerAutosave();
        } else {
          targets.forEach(r => { r.generating = false; });
          state.emit('change', { source: 'generateAudioError' });
          ui.showToast(`Audio generation failed: ${res.error || 'Unknown error'}`);
        }
      } catch (err) {
        targets.forEach(r => { r.generating = false; });
        state.emit('change', { source: 'generateAudioError' });
        ui.showToast(`Generation error: ${err.message}`);
      } finally {
        if (genBtn) {
          genBtn.disabled = false;
          genBtn.classList.remove('loading');
        }
        if (workflow && typeof workflow.hideProgress === 'function') {
          setTimeout(() => workflow.hideProgress(), 800);
        }
      }
    });
  }

  bindFindReplaceActions() {
    const modal = document.getElementById('frModal');
    const fInp = document.getElementById('fInp');
    const rInp = document.getElementById('rInp');
    const caseCheck = document.getElementById('frCase');
    const selOnlyCheck = document.getElementById('frSelOnly');
    const matchesDiv = document.getElementById('frMatches');
    const cancelBtn = document.getElementById('frCancel');
    const nextBtn = document.getElementById('frNext');
    const okBtn = document.getElementById('frOk');

    const updateMatches = () => {
      const findText = fInp?.value || '';
      if (!findText) {
        if (matchesDiv) matchesDiv.textContent = '';
        return;
      }

      const isCase = Boolean(caseCheck?.checked);
      const isSelOnly = Boolean(selOnlyCheck?.checked);
      const scope = isSelOnly ? state.getTargets() : state.rows;

      let count = 0;
      scope.forEach(r => {
        const text = isCase ? r.t : r.t.toLowerCase();
        const query = isCase ? findText : findText.toLowerCase();
        if (text.includes(query)) count++;
      });

      if (matchesDiv) {
        matchesDiv.textContent = count > 0 
          ? i18n.t('frMatchCount', { count })
          : i18n.t('frNoMatches');
      }
    };

    fInp?.addEventListener('input', updateMatches);
    caseCheck?.addEventListener('change', updateMatches);
    selOnlyCheck?.addEventListener('change', updateMatches);

    cancelBtn?.addEventListener('click', () => ui.closeFindReplaceModal());

    // Replace Next
    nextBtn?.addEventListener('click', () => {
      const findText = fInp?.value || '';
      const replaceText = rInp?.value || '';
      if (!findText) return;

      const isCase = Boolean(caseCheck?.checked);
      const isSelOnly = Boolean(selOnlyCheck?.checked);
      const scope = isSelOnly ? state.getTargets() : state.rows;

      const match = scope.find(r => {
        const text = isCase ? r.t : r.t.toLowerCase();
        const query = isCase ? findText : findText.toLowerCase();
        return text.includes(query);
      });

      if (match) {
        state.snapshot();
        if (isCase) {
          match.t = match.t.replace(findText, replaceText);
        } else {
          const reg = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          match.t = match.t.replace(reg, replaceText);
        }
        state.select(match.id);
        state.emit('change', { source: 'findReplace' });
        updateMatches();
      }
    });

    // Replace All
    okBtn?.addEventListener('click', () => {
      const findText = fInp?.value || '';
      const replaceText = rInp?.value || '';
      if (!findText) return;

      const isCase = Boolean(caseCheck?.checked);
      const isSelOnly = Boolean(selOnlyCheck?.checked);
      const scope = isSelOnly ? state.getTargets() : state.rows;

      state.snapshot();
      let matchCount = 0;
      const regex = new RegExp(
        findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        isCase ? 'g' : 'gi'
      );

      scope.forEach(r => {
        if (regex.test(r.t)) {
          matchCount++;
          r.t = r.t.replace(regex, replaceText);
        }
      });

      state.emit('change', { source: 'findReplace' });
      ui.closeFindReplaceModal();
      ui.showToast(i18n.t('replacedRows', { count: matchCount }));
    });

    modal?.addEventListener('click', e => {
      if (e.target === modal) ui.closeFindReplaceModal();
    });
  }

  bindWorkspaceToolActions() {
    // 1. Load Video button
    document.getElementById('loadVideoBtn')?.addEventListener('click', async () => {
      const res = await ipcClient.openFileDialog('video');
      if (!res.canceled && res.filePaths?.length) {
        await this.importVideo(res.filePaths[0]);
      }
    });

    // 2. Load BGM button with Quick Clear support and right-click unload
    const bgmBtn = document.getElementById('loadBgmBtn');
    bgmBtn?.addEventListener('click', async (e) => {
      if (e.target.closest('#bgmClearBtn') || e.target.closest('.tool-clear')) {
        e.stopPropagation();
        this.unloadBgm();
        return;
      }
      const res = await ipcClient.openFileDialog('audio');
      if (!res.canceled && res.filePaths?.length) {
        const bgmPath = res.filePaths[0];
        const loadRes = await ipcClient.loadBgm(bgmPath, state.project.projectJsonPath);
        if (loadRes.success) {
          state.project.bgmPath = loadRes.audioPath;
          state.bgmPeaks = loadRes.peaks || [];
          state.setMuted(true);
          state.emit('change', { source: 'bgmLoaded' });
          ui.showToast(i18n.t('bgmLoaded') || 'BGM loaded successfully');
        } else {
          ui.showToast(`Failed to load BGM: ${loadRes.error || 'Unknown error'}`);
        }
      }
    });

    bgmBtn?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (state.project.bgmPath) {
        if (confirm('តើអ្នកចង់ដកតន្ត្រី BGM ចេញមែនទេ? (Remove loaded BGM track?)')) {
          this.unloadBgm();
        }
      }
    });

    // 3. Load A1 (Dub audio) button with Quick Clear support and right-click unload
    const a1Btn = document.getElementById('loadA1Btn');
    a1Btn?.addEventListener('click', async (e) => {
      if (e.target.closest('#a1ClearBtn') || e.target.closest('.tool-clear')) {
        e.stopPropagation();
        this.unloadA1();
        return;
      }
      const res = await ipcClient.openFileDialog('audio');
      if (!res.canceled && res.filePaths?.length) {
        const a1Path = res.filePaths[0];
        const loadRes = await ipcClient.loadA1(a1Path, state.project.projectJsonPath);
        if (loadRes.success) {
          state.project.a1Path = loadRes.audioPath;
          state.dubPeaks = loadRes.peaks || [];
          state.emit('change', { source: 'a1Loaded' });
          ui.showToast(i18n.t('a1Loaded') || 'A1 dub audio loaded');
        } else {
          ui.showToast(`Failed to load A1: ${loadRes.error || 'Unknown error'}`);
        }
      }
    });

    a1Btn?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (state.project.a1Path) {
        if (confirm('តើអ្នកចង់ដកសម្លេង A1 ចេញមែនទេ? (Remove loaded A1 audio?)')) {
          this.unloadA1();
        }
      }
    });

    // 4. Isolate BGM button (vocal & accompaniment separation with progress animation and duplicate guards)
    const isolateBtn = document.getElementById('isolateBgmBtn');
    isolateBtn?.addEventListener('click', async () => {
      if (this.isIsolatingBgm) {
        ui.showToast('កំពុងដំណើរការបំបែកសម្លេង... (Separation in progress...)');
        return;
      }

      let audioSource = null;
      if (state.project.projectDir && state.project.media?.origAudio) {
        audioSource = `${state.project.projectDir}/${state.project.media.origAudio}`.replace(/\\/g, '/');
      }
      if (!audioSource) {
        audioSource = state.project.paths?.originalAudio || state.project.videoFilePath;
      }
      if (!audioSource) {
        ui.showToast('សូមបើកវីដេអូ ឬសម្លេងជាមុនសិន (Please load a video or audio file first)');
        return;
      }

      if (state.project.bgmPath) {
        const proceed = confirm('តន្ត្រី BGM ត្រូវបានញែករួចរាល់ហើយ។ តើអ្នកចង់ញែកម្តងទៀតទេ?\n(BGM is already isolated. Re-run separation?)');
        if (!proceed) return;
      }

      this.isIsolatingBgm = true;
      isolateBtn.classList.add('loading');
      isolateBtn.disabled = true;

      const originalIcon = isolateBtn.querySelector('.tool-icon')?.innerHTML;
      const labelSpan = isolateBtn.querySelector('.tool-label') || isolateBtn.querySelector('span:not(.tool-icon)');
      if (isolateBtn.querySelector('.tool-icon')) {
        isolateBtn.querySelector('.tool-icon').innerHTML = '<span class="tool-spinner"></span>';
      }
      if (labelSpan) labelSpan.textContent = 'កំពុងញែក...';

      ui.showToast(i18n.t('isolatingBgm') || 'កំពុងញែកតន្ត្រី BGM និងសម្លេង... (AI Separation in progress)', 8000);

      try {
        const outDir = state.project.projectDir || '';
        const settings = await ipcClient.getSettings();
        const isDev = Boolean(settings?.system?.developerMode);
        const engine = (isDev && (settings?.separation?.engine === 'mock' || settings?.asrEngine === 'mock')) ? 'mock' : (settings?.separation?.engine || 'demucs');
        const res = await ipcClient.isolateBgm(audioSource, outDir, { engine });
        const bgmFile = res.bgmPath || res.accompanimentPath;
        if (res.success && bgmFile) {
          const loadRes = await ipcClient.loadBgm(bgmFile, state.project.projectJsonPath);
          if (loadRes.success) {
            state.project.bgmPath = loadRes.audioPath;
            state.bgmPeaks = loadRes.peaks || [];
            state.setMuted(true);
            state.emit('change', { source: 'bgmIsolated' });
            ui.showToast(i18n.t('isolateBgmSuccess') || 'BGM isolated and loaded successfully!');
          } else {
            ui.showToast(`Failed to load isolated BGM: ${loadRes.error || 'Unknown error'}`);
          }
        } else {
          ui.showToast(`Separation failed: ${res.error || 'Unknown separation error'}`);
        }
      } catch (err) {
        ui.showToast(`Separation error: ${err.message}`);
      } finally {
        this.isIsolatingBgm = false;
        isolateBtn.classList.remove('loading');
        isolateBtn.disabled = false;
        if (isolateBtn.querySelector('.tool-icon') && originalIcon) {
          isolateBtn.querySelector('.tool-icon').innerHTML = originalIcon;
        }
        if (labelSpan) labelSpan.textContent = i18n.t('isolateBgm') || 'ញែកតន្ត្រី';
        this.updateWorkspaceToolsUI();
      }
    });

    // 5. Mute original video audio toggle
    const muteBtn = document.getElementById('mute');
    if (muteBtn) {
      this.updateMuteUI();
      muteBtn.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // 6. Intro & Outro Modal trigger
    document.getElementById('introOutroBtn')?.addEventListener('click', () => {
      openIntroOutroModal();
    });

    // 7. Export SRT button
    document.getElementById('exportSrtBtn')?.addEventListener('click', () => {
      this.exportSrt();
    });

    // 8. Import SRT/VTT button
    document.getElementById('importSrtBtn')?.addEventListener('click', () => {
      this.importSubtitles();
    });

    // Initial state refresh for all workspace buttons
    this.updateWorkspaceToolsUI();

    // Blur overlay button in preview toolbar
    const blurBtn = document.getElementById('btnBlur');
    const blurOverlay = document.getElementById('blurOverlay');
    blurBtn?.addEventListener('click', () => {
      state.previewBlur = !state.previewBlur;
      blurBtn.classList.toggle('on', state.previewBlur);
      if (blurOverlay) blurOverlay.hidden = !state.previewBlur;
      ui.showToast(state.previewBlur ? i18n.t('blurEnabled') : i18n.t('blurDisabled'));
    });

    // Watermark overlay button in preview toolbar
    const wmBtn = document.getElementById('btnWatermark');
    const wmOverlay = document.getElementById('watermarkOverlay');
    wmBtn?.addEventListener('click', () => {
      state.previewWatermark = !state.previewWatermark;
      wmBtn.classList.toggle('on', state.previewWatermark);
      if (wmOverlay) wmOverlay.hidden = !state.previewWatermark;
      ui.showToast(state.previewWatermark ? i18n.t('watermarkEnabled') : i18n.t('watermarkDisabled'));
    });

    // Preview toolbar stubs (previous frame, snapshot, crop, aspect ratio, filters, grid, tools)
    // Feature flag: keep code behind flag, hidden by default per Item 11
    const ENABLE_PREVIEW_STUBS = false;
    const stubsGroup = document.getElementById('previewToolbarStubs');
    if (stubsGroup) {
      stubsGroup.hidden = !ENABLE_PREVIEW_STUBS;
      stubsGroup.style.display = ENABLE_PREVIEW_STUBS ? '' : 'none';
    }
    if (ENABLE_PREVIEW_STUBS) {
      document.querySelectorAll('#previewToolbarStubs .btn').forEach(btn => {
        btn.addEventListener('click', () => {
          ui.showToast(i18n.t('featureUpcoming'));
        });
      });
    }
  }

  matchesShortcut(e, comboStr) {
    if (!comboStr) return false;
    const parts = comboStr.split('+');
    const hasCtrl = parts.includes('Ctrl');
    const hasAlt = parts.includes('Alt');
    const hasShift = parts.includes('Shift');
    const mainKey = parts[parts.length - 1];

    if (Boolean(e.ctrlKey || e.metaKey) !== hasCtrl) return false;
    if (Boolean(e.altKey) !== hasAlt) return false;
    if (Boolean(e.shiftKey) !== hasShift) return false;

    if (mainKey === 'Space') return e.code === 'Space' || e.key === ' ';
    if (mainKey.startsWith('Key')) return e.code === mainKey || e.key.toUpperCase() === mainKey.replace('Key', '');
    if (mainKey.startsWith('Digit')) return e.code === mainKey || e.key === mainKey.replace('Digit', '');
    if (mainKey === 'Delete') return e.code === 'Delete' || e.key === 'Delete';
    if (mainKey === 'ArrowUp') return e.code === 'ArrowUp' || e.key === 'ArrowUp';
    if (mainKey === 'ArrowDown') return e.code === 'ArrowDown' || e.key === 'ArrowDown';

    return e.key.toUpperCase() === mainKey.toUpperCase() || e.code === mainKey;
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      // Play / Pause
      if (this.matchesShortcut(e, this.shortcuts.playPause) && !isInput) {
        e.preventDefault();
        player.togglePlay();
        return;
      }

      // Split at playhead
      if (this.matchesShortcut(e, this.shortcuts.split) && !isInput) {
        e.preventDefault();
        timeline.splitAtPlayhead();
        return;
      }

      // Toggle Mute (M)
      if ((e.code === 'KeyM' || e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
        e.preventDefault();
        this.toggleMute();
        return;
      }

      // New Project (Ctrl+N)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyN' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        this.createNewProject();
        return;
      }

      // Save Project
      if (this.matchesShortcut(e, this.shortcuts.save)) {
        e.preventDefault();
        this.saveCurrentProject();
        return;
      }

      // Undo
      if (this.matchesShortcut(e, this.shortcuts.undo)) {
        if (!isInput) {
          e.preventDefault();
          state.undo();
        }
        return;
      }

      // Redo
      if (this.matchesShortcut(e, this.shortcuts.redo)) {
        if (!isInput) {
          e.preventDefault();
          state.redo();
        }
        return;
      }

      // Find & Replace
      if (this.matchesShortcut(e, this.shortcuts.findReplace)) {
        e.preventDefault();
        ui.openFindReplaceModal();
        return;
      }

      // Escape: Close modal / popovers
      if (e.key === 'Escape') {
        ui.closeFindReplaceModal();
        ui.hideCastPopover();
        return;
      }

      // Delete selected subtitle row
      if (this.matchesShortcut(e, this.shortcuts.deleteRow) && !isInput) {
        const delBtn = document.getElementById('del');
        delBtn?.click();
        return;
      }
    });
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.app = app;
  app.init();
});
