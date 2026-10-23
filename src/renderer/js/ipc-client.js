/**
 * Safe wrapper around window.api (Electron IPC)
 * Provides graceful fallbacks if accessed outside Electron (e.g. testing in browser)
 */

const hasElectronApi = typeof window !== 'undefined' && Boolean(window.api);

let _cachedSettings = null;
let _settingsInFlight = null;
let _cachedKeysStatus = null;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('app:settings-updated', (e) => {
    if (e?.detail) {
      _cachedSettings = e.detail;
    } else {
      _cachedSettings = null;
    }
  });
}

export const ipcClient = {
  isElectron: hasElectronApi,

  async setTheme(theme) {
    if (hasElectronApi && window.api.theme?.set) {
      return await window.api.theme.set(theme);
    }
    return { success: true, theme };
  },

  async getSystemInfo() {
    if (hasElectronApi && window.api.system?.getInfo) {
      return await window.api.system.getInfo();
    }
    return {
      appName: 'AI Dubbing Studio',
      version: '1.0.0',
      platform: 'browser',
      electronVersion: 'N/A'
    };
  },

  async getMemoryUsage() {
    if (hasElectronApi && window.api.system?.getMemory) {
      return await window.api.system.getMemory();
    }
    return {
      processRssBytes: 120 * 1024 * 1024,
      percentage: 52,
      status: 'Moderate'
    };
  },

  async openLogsFolder() {
    if (hasElectronApi && window.api.system?.openLogs) {
      return await window.api.system.openLogs();
    }
    console.log('Open logs folder (browser stub)');
    return false;
  },

  async selectOverlayImage() {
    if (hasElectronApi && window.api.project?.openDialog) {
      const res = await window.api.project.openDialog('image');
      if (res && !res.canceled && res.filePath) {
        return { filePath: res.filePath };
      }
    }
    return { canceled: true };
  },

  async openFileDialog(type = 'all') {
    if (hasElectronApi && window.api.project?.openDialog) {
      return await window.api.project.openDialog(type);
    }
    console.log('Open file dialog (browser stub)', type);
    return { canceled: true };
  },

  async saveFileDialog(defaultName) {
    if (hasElectronApi && window.api.project?.saveDialog) {
      return await window.api.project.saveDialog(defaultName);
    }
    console.log('Save file dialog (browser stub)', defaultName);
    return { canceled: true };
  },

  async exportSubtitleDialog(defaultName, ext = 'srt') {
    if (hasElectronApi && window.api.project?.exportDialog) {
      return await window.api.project.exportDialog(defaultName, ext);
    }
    return { canceled: true };
  },

  async readFileText(filePath) {
    if (hasElectronApi && window.api.file?.readText) {
      return await window.api.file.readText(filePath);
    }
    return { success: false, error: 'File API not available' };
  },

  async writeFileText(filePath, content) {
    if (hasElectronApi && window.api.file?.writeText) {
      return await window.api.file.writeText(filePath, content);
    }
    return { success: false, error: 'File API not available' };
  },

  async createProjectFromVideo(videoPath, customDir = null) {
    if (hasElectronApi && window.api.project?.createFromVideo) {
      return await window.api.project.createFromVideo(videoPath, customDir);
    }
    throw new Error('Electron API not available');
  },

  async saveProject(projectJsonPath, data) {
    if (hasElectronApi && window.api.project?.save) {
      return await window.api.project.save(projectJsonPath, data);
    }
    return { success: true };
  },

  async autosaveProject(projectJsonPath, data) {
    if (hasElectronApi && window.api.project?.autosave) {
      return await window.api.project.autosave(projectJsonPath, data);
    }
    return { success: true };
  },

  async loadProject(projectJsonPath) {
    if (hasElectronApi && window.api.project?.load) {
      return await window.api.project.load(projectJsonPath);
    }
    throw new Error('Electron API not available');
  },

  async getSampleProjectPath() {
    if (hasElectronApi && window.api.project?.getSamplePath) {
      return await window.api.project.getSamplePath();
    }
    return null;
  },

  async getRecentProjects(onlyExisting = true) {
    if (hasElectronApi && window.api.project?.getRecent) {
      return await window.api.project.getRecent(onlyExisting);
    }
    return [];
  },

  async removeRecentProject(projectDir) {
    if (hasElectronApi && window.api.project?.removeRecent) {
      return await window.api.project.removeRecent(projectDir);
    }
    return [];
  },

  async probeMedia(filePath) {
    if (hasElectronApi && window.api.media?.probe) {
      return await window.api.media.probe(filePath);
    }
    return { duration: 0, hasVideo: false, hasAudio: false };
  },

  async getWaveformPeaks(filePath, numPeaks = 600) {
    if (hasElectronApi && window.api.media?.getPeaks) {
      return await window.api.media.getPeaks(filePath, numPeaks);
    }
    return [];
  },
  async getSettings(forceRefresh = false) {
    if (!forceRefresh && _cachedSettings) {
      return _cachedSettings;
    }
    if (_settingsInFlight) {
      return await _settingsInFlight;
    }
    _settingsInFlight = (async () => {
      try {
        if (hasElectronApi && window.api.settings?.get) {
          _cachedSettings = await window.api.settings.get();
          return _cachedSettings;
        }
        return {
          asrEngine: 'faster-whisper',
          whisperModel: 'base',
          whisperDevice: 'auto',
          whisperLanguage: 'auto',
          geminiModel: 'gemini-3.8-flash'
        };
      } finally {
        _settingsInFlight = null;
      }
    })();
    return await _settingsInFlight;
  },

  async updateSettings(partial) {
    _cachedSettings = null;
    if (hasElectronApi && window.api.settings?.update) {
      const updated = await window.api.settings.update(partial);
      _cachedSettings = updated;
      return updated;
    }
    return partial;
  },

  async listKeys() {
    if (hasElectronApi && window.api.keys?.list) {
      return await window.api.keys.list();
    }
    return [];
  },

  async getKeysStatus(forceRefresh = false) {
    if (!forceRefresh && _cachedKeysStatus) {
      return _cachedKeysStatus;
    }
    if (hasElectronApi && window.api.keys?.status) {
      _cachedKeysStatus = await window.api.keys.status();
      return _cachedKeysStatus;
    }
    return { available: 0, total: 0 };
  },

  async addKey(rawKey) {
    if (hasElectronApi && window.api.keys?.add) {
      return await window.api.keys.add(rawKey);
    }
    return { success: false, error: 'API not available' };
  },

  async removeKey(id) {
    if (hasElectronApi && window.api.keys?.remove) {
      return await window.api.keys.remove(id);
    }
    return { success: false };
  },

  async testKey(keyOrId) {
    if (hasElectronApi && window.api.keys?.test) {
      return await window.api.keys.test(keyOrId);
    }
    return { valid: false, error: 'API not available' };
  },

  async testAllKeys() {
    if (hasElectronApi && window.api.keys?.testAll) {
      return await window.api.keys.testAll();
    }
    return { success: false, results: [] };
  },

  async resetKeyCooldowns() {
    if (hasElectronApi && window.api.keys?.resetCooldowns) {
      return await window.api.keys.resetCooldowns();
    }
    return { success: false };
  },

  async getHardware() {
    if (hasElectronApi && window.api.sidecar?.getHardware) {
      return await window.api.sidecar.getHardware();
    }
    return { cuda_available: false, cpu_threads: 4 };
  },

  async getModelStatus(modelSize) {
    if (hasElectronApi && window.api.sidecar?.getModelStatus) {
      return await window.api.sidecar.getModelStatus(modelSize);
    }
    return { modelSize, exists: false };
  },

  async downloadModel(modelSize) {
    if (hasElectronApi && window.api.sidecar?.downloadModel) {
      return await window.api.sidecar.downloadModel(modelSize);
    }
    return { success: false, error: 'API not available' };
  },

  async transcribe(audioPath, options = {}) {
    if (hasElectronApi && window.api.asr?.transcribe) {
      return await window.api.asr.transcribe(audioPath, options);
    }
    return { success: false, error: 'ASR API not available' };
  },

  async cancelTranscribe() {
    if (hasElectronApi && window.api.asr?.cancel) {
      return await window.api.asr.cancel();
    }
    return { success: true };
  },

  async translate(segments, options = {}) {
    if (hasElectronApi && window.api.translation?.translate) {
      return await window.api.translation.translate(segments, options);
    }
    return { success: false, error: 'Translation API not available' };
  },

  async cancelTranslate() {
    if (hasElectronApi && window.api.translation?.cancel) {
      return await window.api.translation.cancel();
    }
    return { success: true };
  },

  async condense(items, options = {}) {
    if (hasElectronApi && window.api.translation?.condense) {
      return await window.api.translation.condense(items, options);
    }
    const list = Array.isArray(items) ? items : [items];
    return {
      success: true,
      results: list.map((it, idx) => ({
        id: it.id != null ? it.id : idx + 1,
        condensedText: (it.text || it.t || '').replace(/^តើ\s*/, ''),
        alternatives: []
      }))
    };
  },

  async synthesizeBatch(segments, options = {}) {
    if (hasElectronApi && window.api.tts?.synthesizeBatch) {
      return await window.api.tts.synthesizeBatch(segments, options);
    }
    return { success: false, error: 'TTS API not available' };
  },

  async synthesizeSingle(params) {
    if (hasElectronApi && window.api.tts?.synthesizeSingle) {
      return await window.api.tts.synthesizeSingle(params);
    }
    return { success: false, error: 'TTS API not available' };
  },

  async listVoices(engine = 'edge-tts') {
    if (hasElectronApi && window.api.tts?.listVoices) {
      const res = await window.api.tts.listVoices(engine);
      if (res && res.success && Array.isArray(res.voices) && res.voices.length > 0) {
        return res;
      }
    }

    if (engine === 'camb-ai') {
      return {
        success: true,
        voices: [
          { name: '147320', short_name: '147320', voice_id: 147320, gender: 'Male', locale: 'km-KH', label: 'Camb.ai Khmer (Sophat - Male)' },
          { name: '147321', short_name: '147321', voice_id: 147321, gender: 'Female', locale: 'km-KH', label: 'Camb.ai Khmer (Kolab - Female)' },
          { name: '147322', short_name: '147322', voice_id: 147322, gender: 'Male', locale: 'km-KH', label: 'Camb.ai Khmer (Vannak - Cinema Male)' },
          { name: '147323', short_name: '147323', voice_id: 147323, gender: 'Female', locale: 'km-KH', label: 'Camb.ai Khmer (Bopha - Soft Female)' },
          { name: '147300', short_name: '147300', voice_id: 147300, gender: 'Female', locale: 'en-US', label: 'Camb.ai English (Elena - Female)' },
          { name: '147301', short_name: '147301', voice_id: 147301, gender: 'Male', locale: 'en-US', label: 'Camb.ai English (David - Male)' }
        ]
      };
    }

    return { success: false, voices: [] };
  },

  async cancelTts() {
    if (hasElectronApi && window.api.tts?.cancel) {
      return await window.api.tts.cancel();
    }
    return { success: true };
  },

  async loadBgm(audioPath, projectJsonPath = null) {
    if (hasElectronApi && window.api.media?.loadBgm) {
      return await window.api.media.loadBgm({ audioPath, projectJsonPath });
    }
    return { success: false, error: 'Media API not available' };
  },

  async loadA1(audioPath, projectJsonPath = null) {
    if (hasElectronApi && window.api.media?.loadA1) {
      return await window.api.media.loadA1({ audioPath, projectJsonPath });
    }
    return { success: false, error: 'Media API not available' };
  },

  async assembleDubTrack(params) {
    if (hasElectronApi && window.api.media?.assembleDubTrack) {
      return await window.api.media.assembleDubTrack(params);
    }
    return { success: false, error: 'Media API not available' };
  },

  async generateThumbnails(params) {
    if (hasElectronApi && window.api.media?.generateThumbnails) {
      return await window.api.media.generateThumbnails(params);
    }
    return { success: false, error: 'Media API not available', thumbnails: [] };
  },

  async isolateBgm(audioPath, outputDir, options = {}) {
    if (hasElectronApi && window.api.separation?.isolateBgm) {
      return await window.api.separation.isolateBgm({ audioPath, outputDir, options });
    }
    return { success: false, error: 'Separation API not available' };
  },

  async cancelSeparation() {
    if (hasElectronApi && window.api.separation?.cancel) {
      return await window.api.separation.cancel();
    }
    return { success: true };
  },

  async exportVideo(params) {
    if (hasElectronApi && window.api.export?.start) {
      return await window.api.export.start(params);
    }
    return { success: false, error: 'Export API not available' };
  },

  async cancelExport() {
    if (hasElectronApi && window.api.export?.cancel) {
      return await window.api.export.cancel();
    }
    return { success: true };
  },

  async resetSectionSettings(section) {
    if (hasElectronApi && window.api.settings?.resetSection) {
      return await window.api.settings.resetSection(section);
    }
    return null;
  },

  async testCodecraftConnection(config) {
    if (hasElectronApi && window.api?.codecraft?.testConnection) {
      return await window.api.codecraft.testConnection(config);
    }
    return { success: false, error: 'API not available in this environment' };
  },

  async testCambAiConnection(config) {
    if (hasElectronApi && window.api?.cambai?.testConnection) {
      try {
        const res = await window.api.cambai.testConnection(config);
        if (res) return res;
      } catch (err) {
        // If main process hasn't been restarted yet and throws "No handler registered", fall through to direct fetch
        if (!err.message || !err.message.includes('No handler registered')) {
          return { success: false, error: err.message };
        }
      }
    }

    // Direct fetch fallback
    try {
      const apiKey = (config?.apiKey || '').trim();
      if (!apiKey) {
        return { success: false, error: 'Camb.ai API Key is required' };
      }

      const res = await window.fetch('https://client.camb.ai/apis/list-voices', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      });

      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const body = await res.text();
          const json = JSON.parse(body);
          if (json.message || json.error) errDetail = json.message || json.error;
          else if (body) errDetail = body.slice(0, 150);
        } catch (_) {}
        return { success: false, error: `Camb.ai error: ${errDetail}` };
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data.payload) ? data.payload : (Array.isArray(data.data) ? data.data : []));
      const count = list.length;

      return {
        success: true,
        count,
        message: count > 0
          ? `Connected to Camb.ai successfully! ${count} neural voices discovered.`
          : 'Connected to Camb.ai successfully! MARS-8 / Mars-Flash Dubbing API is active.'
      };
    } catch (fetchErr) {
      return { success: false, error: `Camb.ai connection failed: ${fetchErr.message}` };
    }
  },

  async addKeyBatch(rawText) {
    if (hasElectronApi && window.api.keys?.addBatch) {
      const text = Array.isArray(rawText) ? rawText.join('\n') : String(rawText || '');
      return await window.api.keys.addBatch(text);
    }
    return { success: false, error: 'API not available' };
  },

  async addKeysBatch(rawInput) {
    return await this.addKeyBatch(rawInput);
  },

  async deleteModel(modelSize) {
    if (hasElectronApi && window.api.sidecar?.deleteModel) {
      return await window.api.sidecar.deleteModel(modelSize);
    }
    return { success: false };
  },

  async getPronunciation() {
    if (hasElectronApi && window.api.pronunciation?.get) {
      return await window.api.pronunciation.get();
    }
    return [];
  },

  async pronunciationGetRules() {
    return await this.getPronunciation();
  },

  async setPronunciationAll(entries) {
    if (hasElectronApi && window.api.pronunciation?.setAll) {
      return await window.api.pronunciation.setAll(entries);
    }
    return false;
  },

  async addPronunciation(entry) {
    if (hasElectronApi && window.api.pronunciation?.add) {
      return await window.api.pronunciation.add(entry);
    }
    return { success: false };
  },

  async pronunciationAddRule(entry) {
    return await this.addPronunciation(entry);
  },

  async updatePronunciation(id, patch) {
    if (hasElectronApi && window.api.pronunciation?.update) {
      return await window.api.pronunciation.update(id, patch);
    }
    return { success: false };
  },

  async pronunciationUpdateRule(id, patch) {
    return await this.updatePronunciation(id, patch);
  },

  async deletePronunciation(id) {
    if (hasElectronApi && window.api.pronunciation?.delete) {
      return await window.api.pronunciation.delete(id);
    }
    return { success: false };
  },

  async pronunciationDeleteRule(id) {
    return await this.deletePronunciation(id);
  },

  async exportPronunciationJson() {
    if (hasElectronApi && window.api.pronunciation?.exportJson) {
      return await window.api.pronunciation.exportJson();
    }
    return '[]';
  },

  async exportPronunciationCsv() {
    if (hasElectronApi && window.api.pronunciation?.exportCsv) {
      return await window.api.pronunciation.exportCsv();
    }
    return '';
  },

  async pronunciationExport(format = 'json') {
    if (format === 'csv') {
      const csv = await this.exportPronunciationCsv();
      const count = typeof csv === 'string' ? Math.max(0, csv.trim().split('\n').length - 1) : 0;
      return { success: true, count, data: csv };
    }
    const json = await this.exportPronunciationJson();
    const count = typeof json === 'string' ? JSON.parse(json).length : (Array.isArray(json) ? json.length : 0);
    return { success: true, count, data: json };
  },

  async importPronunciation(content, format = 'json') {
    if (hasElectronApi && window.api.pronunciation?.import) {
      return await window.api.pronunciation.import({ content, format });
    }
    return { success: false };
  },

  async pronunciationImport(content, format = 'json') {
    return await this.importPronunciation(content, format);
  },

  async pronunciationAddExamples() {
    if (hasElectronApi && window.api.pronunciation?.addExamples) {
      return await window.api.pronunciation.addExamples();
    }
    return { success: false, error: 'IPC not available' };
  },

  async getDiagnostics() {
    if (hasElectronApi && window.api.system?.getDiagnostics) {
      return await window.api.system.getDiagnostics();
    }
    return {};
  },

  async getCacheSize() {
    if (hasElectronApi && window.api.system?.getCacheSize) {
      return await window.api.system.getCacheSize();
    }
    return { bytes: 0, formatted: '0 MB', fileCount: 0, path: '' };
  },

  async clearCache() {
    if (hasElectronApi && window.api.system?.clearCache) {
      return await window.api.system.clearCache();
    }
    return { success: false };
  },

  async exportLogs() {
    if (hasElectronApi && window.api.system?.exportLogs) {
      return await window.api.system.exportLogs();
    }
    return { canceled: true };
  },

  async selectFolder() {
    if (hasElectronApi && window.api.system?.selectFolder) {
      return await window.api.system.selectFolder();
    }
    return { canceled: true };
  },

  cover: {
    async getTemplates() {
      if (hasElectronApi && window.api?.cover?.getTemplates) {
        return await window.api.cover.getTemplates();
      }
      return { groups: [], templates: [] };
    },
    async select() {
      if (hasElectronApi && window.api?.cover?.select) {
        return await window.api.cover.select();
      }
      return null;
    },
    async importPath(filePath) {
      if (hasElectronApi && window.api?.cover?.importPath) {
        return await window.api.cover.importPath(filePath);
      }
      return { ok: false, error: 'Electron API unavailable' };
    },
    async analyse(imagePath) {
      if (hasElectronApi && window.api?.cover?.analyse) {
        return await window.api.cover.analyse(imagePath);
      }
      return { ok: false, error: 'Electron API unavailable' };
    },
    async erase(imagePath, textRegions) {
      if (hasElectronApi && window.api?.cover?.erase) {
        return await window.api.cover.erase(imagePath, textRegions);
      }
      return { ok: false, error: 'Electron API unavailable' };
    },
    async generate3D(params) {
      if (hasElectronApi && window.api?.cover?.generate3D) {
        return await window.api.cover.generate3D(params);
      }
      return { ok: false, error: 'Electron API unavailable' };
    },
    async export(params) {
      if (hasElectronApi && window.api?.cover?.export) {
        return await window.api.cover.export(params);
      }
      return { ok: false, error: 'Electron API unavailable' };
    }
  },

  on(channel, callback) {
    if (channel === 'keys:status') {
      const wrapped = (status) => {
        _cachedKeysStatus = status;
        if (typeof callback === 'function') callback(status);
      };
      if (hasElectronApi && window.api.on) {
        return window.api.on(channel, wrapped);
      }
      return () => {};
    }
    if (hasElectronApi && window.api.on) {
      return window.api.on(channel, callback);
    }
    return () => {};
  }
};
