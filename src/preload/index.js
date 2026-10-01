const { contextBridge, ipcRenderer } = require('electron');

// Early theme application to prevent any flash of default colors before first paint
try {
  const initialSettings = ipcRenderer.sendSync('settings:get-sync');
  if (initialSettings?.theme) {
    const t = initialSettings.theme;
    const applyThemeEarly = () => {
      const el = document.documentElement;
      if (!el) return;
      if (t.mode === 'light') {
        el.setAttribute('data-theme', 'light');
      } else {
        el.removeAttribute('data-theme');
      }
      if (t.accentColor) {
        el.style.setProperty('--accent', t.accentColor);
        el.style.setProperty('--ambient-2', t.accentColor);
        el.style.setProperty('--accent-hover', t.accentColor + 'dd');
      }
      if (t.glassBlurIntensity != null) {
        const b = parseInt(t.glassBlurIntensity, 10);
        el.style.setProperty('--blur', `blur(${b}px) saturate(140%)`);
      }
      if (t.reduceMotion) {
        el.dataset.reduceMotion = 'true';
      }
    };
    if (document.documentElement) {
      applyThemeEarly();
    } else {
      document.addEventListener('readystatechange', () => applyThemeEarly(), { once: true });
    }
  }
} catch (_) {}

// Expose safe, tightly-scoped APIs to the renderer
contextBridge.exposeInMainWorld('api', {
  theme: {
    set: (theme) => ipcRenderer.invoke('theme:set', theme),
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
    getMemory: () => ipcRenderer.invoke('system:get-memory'),
    openLogs: () => ipcRenderer.invoke('system:open-logs'),
    getDiagnostics: () => ipcRenderer.invoke('system:get-diagnostics'),
    getCacheSize: () => ipcRenderer.invoke('system:cache-size'),
    clearCache: () => ipcRenderer.invoke('system:clear-cache'),
    exportLogs: () => ipcRenderer.invoke('system:export-logs'),
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  },
  project: {
    openDialog: (type) => ipcRenderer.invoke('project:open-dialog', type),
    saveDialog: (defaultName) => ipcRenderer.invoke('project:save-dialog', defaultName),
    createFromVideo: (videoPath, customDir) => ipcRenderer.invoke('project:create-from-video', videoPath, customDir),
    save: (projectJsonPath, data) => ipcRenderer.invoke('project:save', projectJsonPath, data),
    autosave: (projectJsonPath, data) => ipcRenderer.invoke('project:autosave', projectJsonPath, data),
    load: (projectJsonPath) => ipcRenderer.invoke('project:load', projectJsonPath),
    getRecent: (onlyExisting) => ipcRenderer.invoke('project:get-recent', onlyExisting),
    removeRecent: (projectDir) => ipcRenderer.invoke('project:remove-recent', projectDir),
    exportDialog: (defaultName, ext) => ipcRenderer.invoke('project:export-dialog', defaultName, ext),
  },
  file: {
    readText: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
    writeText: (filePath, content) => ipcRenderer.invoke('file:write-text', filePath, content),
  },
  media: {
    probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
    getPeaks: (filePath, numPeaks) => ipcRenderer.invoke('media:get-peaks', filePath, numPeaks),
    loadBgm: (params) => ipcRenderer.invoke('media:load-bgm', params),
    loadA1: (params) => ipcRenderer.invoke('media:load-a1', params),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    getSync: () => ipcRenderer.sendSync('settings:get-sync'),
    update: (partial) => ipcRenderer.invoke('settings:update', partial),
    resetSection: (section) => ipcRenderer.invoke('settings:reset-section', section),
  },
  keys: {
    list: () => ipcRenderer.invoke('keys:list'),
    status: () => ipcRenderer.invoke('keys:status'),
    add: (key) => ipcRenderer.invoke('keys:add', key),
    addBatch: (text) => ipcRenderer.invoke('keys:add-batch', text),
    remove: (id) => ipcRenderer.invoke('keys:remove', id),
    test: (idOrKey) => ipcRenderer.invoke('keys:test', idOrKey),
  },
  sidecar: {
    getHardware: () => ipcRenderer.invoke('sidecar:hardware'),
    getModelStatus: (modelSize) => ipcRenderer.invoke('sidecar:model-status', modelSize),
    downloadModel: (modelSize) => ipcRenderer.invoke('sidecar:download-model', modelSize),
    deleteModel: (modelSize) => ipcRenderer.invoke('sidecar:delete-model', modelSize),
  },
  pronunciation: {
    get: () => ipcRenderer.invoke('pronunciation:get'),
    setAll: (entries) => ipcRenderer.invoke('pronunciation:set-all', entries),
    add: (entry) => ipcRenderer.invoke('pronunciation:add', entry),
    update: (id, patch) => ipcRenderer.invoke('pronunciation:update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('pronunciation:delete', id),
    exportJson: () => ipcRenderer.invoke('pronunciation:export-json'),
    exportCsv: () => ipcRenderer.invoke('pronunciation:export-csv'),
    import: (params) => ipcRenderer.invoke('pronunciation:import', params),
    addExamples: () => ipcRenderer.invoke('pronunciation:add-examples'),
  },
  asr: {
    transcribe: (audioPath, options) => ipcRenderer.invoke('asr:transcribe', audioPath, options),
    cancel: () => ipcRenderer.invoke('asr:cancel'),
  },
  translation: {
    translate: (segments, options) => ipcRenderer.invoke('translation:translate', segments, options),
    cancel: () => ipcRenderer.invoke('translation:cancel'),
  },
  tts: {
    synthesizeBatch: (segments, options) => ipcRenderer.invoke('tts:synthesize-batch', { segments, options }),
    synthesizeSingle: (params) => ipcRenderer.invoke('tts:synthesize-single', params),
    listVoices: (engine) => ipcRenderer.invoke('tts:list-voices', { engine }),
    cancel: () => ipcRenderer.invoke('tts:cancel'),
  },
  separation: {
    isolateBgm: (params) => ipcRenderer.invoke('separation:isolate-bgm', params),
    cancel: () => ipcRenderer.invoke('separation:cancel'),
  },
  export: {
    start: (params) => ipcRenderer.invoke('export:start', params),
    cancel: () => ipcRenderer.invoke('export:cancel'),
  },
  on: (channel, callback) => {
    const validChannels = [
      'keys:status',
      'asr:progress',
      'asr:download-progress',
      'translation:progress',
      'tts:progress',
      'separation:progress',
      'export:progress'
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    return () => {};
  }
});
