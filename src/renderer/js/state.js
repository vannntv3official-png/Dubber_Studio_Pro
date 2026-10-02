/**
 * Central Reactive State Store
 */

import { ipcClient } from './ipc-client.js';

export const VOICES = [
  ['A1', 'ប្រុស ០១', 'M', '#a78bfa', 'km-KH-PisethNeural'],
  ['A2', 'ប្រុស ០២', 'M', '#f9a8d4', 'km-KH-PisethNeural'],
  ['A3', 'ស្រី ០២', 'F', '#5eead4', 'km-KH-SreymomNeural'],
  ['A4', 'ប្រុស ០៩', 'M', '#fbbf24', 'km-KH-PisethNeural'],
  ['A5', 'ស្រី ០៥', 'F', '#86efac', 'km-KH-SreymomNeural']
];

export function createEmptyProject() {
  return {
    name: '',
    filename: '',
    duration: 0,
    videoFilePath: null,
    projectDir: null,
    projectJsonPath: null,
    isDirty: false
  };
}

export function createInitialState() {
  return {
    project: createEmptyProject(),
    origPeaks: [],
    dubPeaks: [],
    bgmPeaks: [],
    thumbnails: [],
    rows: [],
    nextId: 1,
    selectedId: null,
    filterVoice: -1,
    searchQuery: '',
    seriesMode: false,
    timeline: {
      zoom: 100,
      pxPerSec: null, // null = auto-fit to container on first render
      playhead: 0,
      isPlaying: false,
      autofitIndex: 2, // Med
      crowd: false,
      syncEnd: true,
      ducking: true,
      muted: false,
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
      reverb: false,
      followPlayhead: true,
      followPaused: false
    }
  };
}

class StateStore {
  constructor() {
    this.resetToEmpty(false);

    // History stack for Undo / Redo
    this.history = [];
    this.future = [];

    // Pub/Sub listeners
    this.listeners = new Map();

    // Autosave timer
    this.autosaveTimer = null;
    this.autosaveIntervalSec = 30;
    this.autosaveDebounce = null;
    this.initAutosaveLoop(30);
  }

  resetToEmpty(emitChange = true) {
    const init = createInitialState();
    this.project = init.project;
    this.origPeaks = init.origPeaks;
    this.dubPeaks = init.dubPeaks;
    this.bgmPeaks = init.bgmPeaks;
    this.thumbnails = init.thumbnails;
    this.rows = init.rows;
    this.nextId = init.nextId;
    this.selectedId = init.selectedId;
    this.filterVoice = init.filterVoice;
    this.searchQuery = init.searchQuery;
    this.seriesMode = init.seriesMode;
    this.timeline = init.timeline;
    this.history = [];
    this.future = [];

    if (emitChange) {
      this.emit('projectLoaded', this.project);
      this.emit('muteChange', this.timeline.muted);
      this.emit('change', { source: 'resetToEmpty' });
      this.emit('historyChange', { canUndo: false, canRedo: false });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in state event listener [${event}]:`, e);
        }
      }
    }
  }

  markDirty() {
    this.project.isDirty = true;
    clearTimeout(this.autosaveDebounce);
    this.autosaveDebounce = setTimeout(() => {
      this.triggerAutosave();
    }, 1500);
  }

  snapshot() {
    this.history.push(JSON.stringify({
      rows: this.rows,
      selectedId: this.selectedId,
      timeline: { ...this.timeline }
    }));
    if (this.history.length > 50) this.history.shift();
    this.future = [];
    this.markDirty();
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    this.future.push(JSON.stringify({
      rows: this.rows,
      selectedId: this.selectedId,
      timeline: { ...this.timeline }
    }));
    const prev = JSON.parse(this.history.pop());
    this.rows = prev.rows;
    this.selectedId = prev.selectedId;
    if (prev.timeline) {
      this.timeline.autofitIndex = prev.timeline.autofitIndex;
      this.timeline.syncEnd = prev.timeline.syncEnd;
      this.timeline.ducking = prev.timeline.ducking;
    }
    this.markDirty();
    this.emit('change', { source: 'undo' });
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  redo() {
    if (!this.canRedo()) return;
    this.history.push(JSON.stringify({
      rows: this.rows,
      selectedId: this.selectedId,
      timeline: { ...this.timeline }
    }));
    const next = JSON.parse(this.future.pop());
    this.rows = next.rows;
    this.selectedId = next.selectedId;
    if (next.timeline) {
      this.timeline.autofitIndex = next.timeline.autofitIndex;
      this.timeline.syncEnd = next.timeline.syncEnd;
      this.timeline.ducking = next.timeline.ducking;
    }
    this.markDirty();
    this.emit('change', { source: 'redo' });
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  getCur() {
    return this.rows.find(r => r.id === this.selectedId);
  }

  getTargets() {
    const checked = this.rows.filter(r => r.ck);
    if (checked.length > 0) return checked;
    const cur = this.getCur();
    return cur ? [cur] : [];
  }

  getFilteredRows() {
    let list = this.rows.filter(r => {
      const matchVoice = this.filterVoice < 0 || r.v === this.filterVoice;
      const matchQuery = !this.searchQuery || r.t.includes(this.searchQuery);
      return matchVoice && matchQuery;
    });

    if (this.seriesMode) {
      list = [...list].sort((a, b) => a.v - b.v || a.s - b.s);
    }
    return list;
  }

  select(id) {
    if (this.selectedId !== id) {
      this.selectedId = id;
      this.emit('selectionChange', id);
      this.emit('change', { source: 'selection' });
    }
  }

  setPlayhead(time, isSourceVideo = false) {
    const dur = this.project.duration || 0;
    this.timeline.playhead = dur > 0 ? Math.max(0, Math.min(time, dur)) : 0;
    this.emit('playheadChange', { time: this.timeline.playhead, isSourceVideo });
  }

  setMuted(muted) {
    const val = Boolean(muted);
    this.timeline.muted = val;
    this.markDirty();
    this.emit('muteChange', val);
    this.emit('change', { source: 'mute' });
    return val;
  }

  toggleMuted() {
    return this.setMuted(!this.timeline.muted);
  }

  /**
   * Populate project data from an opened or newly created project
   */
  loadProjectData(projectData, peaks = [], thumbnails = [], projectJsonPath = null, projectDir = null) {
    this.project.name = projectData.name || '';
    this.project.duration = Number(projectData.duration) || 0;
    this.project.videoFilePath = projectData.videoFilePath || null;
    this.project.paths = projectData.paths || {};
    this.project.filename = projectData.videoFilePath ? projectData.videoFilePath.split(/[\\/]/).pop() : (projectData.name ? `${projectData.name}.mp4` : '');
    this.project.projectJsonPath = projectJsonPath;
    this.project.projectDir = projectDir;
    this.project.isDirty = false;

    this.origPeaks = Array.isArray(peaks) ? peaks : [];
    this.thumbnails = Array.isArray(thumbnails) ? thumbnails : [];
    this.rows = Array.isArray(projectData.subtitles) ? projectData.subtitles : [];
    this.selectedId = this.rows[0]?.id || null;

    if (projectData.timeline) {
      this.timeline.zoom = projectData.timeline.zoom || 100;
      this.timeline.syncEnd = projectData.timeline.syncEnd ?? true;
      this.timeline.ducking = projectData.timeline.ducking ?? true;
      this.timeline.muted = projectData.timeline.muted ?? false;
    }

    this.history = [];
    this.future = [];

    this.emit('projectLoaded', this.project);
    this.emit('muteChange', this.timeline.muted);
    this.emit('change', { source: 'loadProject' });
    this.emit('historyChange', { canUndo: false, canRedo: false });
  }

  /**
   * Serialize current state into project data object
   */
  serializeProject() {
    return {
      schemaVersion: 1,
      name: this.project.name,
      videoFilePath: this.project.videoFilePath,
      duration: this.project.duration,
      subtitles: this.rows,
      timeline: {
        zoom: this.timeline.zoom,
        syncEnd: this.timeline.syncEnd,
        ducking: this.timeline.ducking,
        muted: this.timeline.muted,
        vol: this.timeline.vol,
        pitch: this.timeline.pitch
      },
      updatedAt: new Date().toISOString()
    };
  }

  async triggerAutosave() {
    if (!this.project.projectJsonPath || !this.project.isDirty) return;
    try {
      const data = this.serializeProject();
      await ipcClient.autosaveProject(this.project.projectJsonPath, data);
      this.project.isDirty = false;
      this.emit('autosaved', new Date());
    } catch (err) {
      console.warn('Autosave failed:', err);
    }
  }

  getDuration() {
    return Number(this.project?.duration) || 0;
  }

  initAutosaveLoop(intervalSec) {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (intervalSec !== undefined) {
      this.autosaveIntervalSec = Number(intervalSec);
    }
    const sec = this.autosaveIntervalSec !== undefined ? this.autosaveIntervalSec : 30;
    if (sec > 0) {
      this.autosaveTimer = setInterval(() => {
        this.triggerAutosave();
      }, sec * 1000);
      if (typeof this.autosaveTimer?.unref === 'function') {
        this.autosaveTimer.unref();
      }
    }
  }

  destroy() {
    this.initAutosaveLoop(0);
    this.listeners.clear();
  }
}

export const state = new StateStore();

export function getProjectDuration() {
  return Number(state?.project?.duration) || 0;
}
