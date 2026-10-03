/**
 * Safe wrapper around window.api (Electron IPC)
 * Provides graceful fallbacks if accessed outside Electron (e.g. testing in browser)
 */

const hasElectronApi = typeof window !== 'undefined' && Boolean(window.api);

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

  async getSettings() {
    if (hasElectronApi && window.api.settings?.get) {
      return await window.api.settings.get();
    }
    return {
      asrEngine: 'faster-whisper',
      whisperModel: 'base',
      whisperDevice: 'auto',
      whisperLanguage: 'auto',
      geminiModel: 'gemini-3.8-flash'
    };
  },

  async updateSettings(partial) {
    if (hasElectronApi && window.api.settings?.update) {
      return await window.api.settings.update(partial);
    }
    return partial;
  },

  async listKeys() {
    if (hasElectronApi && window.api.keys?.list) {
      return await window.api.keys.list();
    }
    return [];
  },

  async getKeysStatus() {
    if (hasElectronApi && window.api.keys?.status) {
      return await window.api.keys.status();
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
      return await window.api.tts.listVoices(engine);
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

  async addKeyBatch(rawText) {
    if (hasElectronApi && window.api.keys?.addBatch) {
      return await window.api.keys.addBatch(rawText);
    }
    return { success: false, error: 'API not available' };
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
    if (hasElectronApi && window.api.on) {
      return window.api.on(channel, callback);
    }
    return () => {};
  }
};
