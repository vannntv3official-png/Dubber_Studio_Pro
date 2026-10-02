const { ipcMain, dialog, app } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const settingsService = require('../services/settings');
const pronunciationService = require('../services/pronunciation');
const keyPool = require('../services/key-pool');
const sidecarManager = require('../services/sidecar-manager');
const ffmpegService = require('../services/ffmpeg');
const logger = require('../utils/logger');

function registerSettingsIpc(mainWindow) {
  // Settings CRUD
  ipcMain.handle('settings:get', async () => {
    return settingsService.get();
  });

  ipcMain.on('settings:get-sync', (event) => {
    event.returnValue = settingsService.get();
  });

  ipcMain.handle('settings:update', async (_event, partial) => {
    return settingsService.update(partial);
  });

  ipcMain.handle('settings:reset-section', async (_event, section) => {
    return settingsService.resetSection(section);
  });

  // Gemini Key Pool
  ipcMain.handle('keys:list', async () => {
    return keyPool.getMaskedKeys();
  });

  ipcMain.handle('keys:status', async () => {
    return keyPool.getStatus();
  });

  ipcMain.handle('keys:add', async (_event, rawKey) => {
    try {
      const res = keyPool.addKey(rawKey);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keys:status', keyPool.getStatus());
      }
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keys:add-batch', async (_event, rawText) => {
    try {
      const res = keyPool.addBatch(rawText);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keys:status', keyPool.getStatus());
      }
      return { success: true, ...res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keys:remove', async (_event, keyId) => {
    const success = keyPool.removeKey(keyId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keys:status', keyPool.getStatus());
    }
    return { success };
  });

  ipcMain.handle('keys:test', async (_event, keyOrId) => {
    return keyPool.testKey(keyOrId);
  });

  keyPool.on('status-changed', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keys:status', status);
    }
  });

  // Sidecar & Whisper Models
  ipcMain.handle('sidecar:hardware', async () => {
    try {
      return await sidecarManager.detectHardware();
    } catch (err) {
      return { error: err.message, cuda_available: false, cpu_threads: os.cpus().length || 4 };
    }
  });

  ipcMain.handle('sidecar:model-status', async (_event, modelSize) => {
    const modelsDir = settingsService.getModelsDir();
    const modelFolder = path.join(modelsDir, `models--Systran--faster-whisper-${modelSize}`);
    const altFolder = path.join(modelsDir, modelSize);

    let exists = false;
    let sizeBytes = 0;

    const targetDir = fs.existsSync(modelFolder) ? modelFolder : (fs.existsSync(altFolder) ? altFolder : null);
    if (targetDir) {
      exists = true;
      try {
        const files = fs.readdirSync(targetDir);
        for (const f of files) {
          try {
            const stat = fs.statSync(path.join(targetDir, f));
            sizeBytes += stat.size;
          } catch (_) {}
        }
      } catch (_) {}
    }

    return {
      modelSize,
      exists,
      sizeBytes,
      sizeFormatted: sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : null,
      modelsDir
    };
  });

  ipcMain.handle('sidecar:download-model', async (_event, modelSize) => {
    const modelsDir = settingsService.getModelsDir();
    try {
      logger.info(`Starting download of Whisper model: ${modelSize}`);
      const res = await sidecarManager.downloadModel(modelSize, modelsDir, (prog) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('asr:download-progress', prog);
        }
      });
      return { success: true, data: res };
    } catch (err) {
      logger.error(`Model download error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sidecar:delete-model', async (_event, modelSize) => {
    const modelsDir = settingsService.getModelsDir();
    const modelFolder = path.join(modelsDir, `models--Systran--faster-whisper-${modelSize}`);
    const altFolder = path.join(modelsDir, modelSize);
    try {
      if (fs.existsSync(modelFolder)) {
        fs.rmSync(modelFolder, { recursive: true, force: true });
      }
      if (fs.existsSync(altFolder)) {
        fs.rmSync(altFolder, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Pronunciation Dictionary
  ipcMain.handle('pronunciation:get', async () => {
    return pronunciationService.getAll();
  });

  ipcMain.handle('pronunciation:set-all', async (_event, entries) => {
    return pronunciationService.setAll(entries);
  });

  ipcMain.handle('pronunciation:add-examples', async () => {
    try {
      return pronunciationService.addExampleRules();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pronunciation:add', async (_event, entry) => {
    try {
      const added = pronunciationService.addEntry(entry);
      return { success: true, entry: added };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pronunciation:update', async (_event, { id, patch }) => {
    const ok = pronunciationService.updateEntry(id, patch);
    return { success: ok };
  });

  ipcMain.handle('pronunciation:delete', async (_event, id) => {
    const ok = pronunciationService.deleteEntry(id);
    return { success: ok };
  });

  ipcMain.handle('pronunciation:export-json', async () => {
    return pronunciationService.exportToJson();
  });

  ipcMain.handle('pronunciation:export-csv', async () => {
    return pronunciationService.exportToCsv();
  });

  ipcMain.handle('pronunciation:import', async (_event, { content, format }) => {
    try {
      const count = format === 'csv'
        ? pronunciationService.importFromCsv(content)
        : pronunciationService.importFromJson(content);
      return { success: true, count, entries: pronunciationService.getAll() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // System, Diagnostics & Logs
  ipcMain.handle('system:get-diagnostics', async () => {
    let hw = { cuda_available: false };
    try {
      hw = await sidecarManager.detectHardware();
    } catch (_) {}

    return {
      appName: 'AI Dubbing Studio PRO',
      appVersion: '1.0.0',
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      ffmpegPath: ffmpegService.ffmpegPath,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      cpu: os.cpus()[0]?.model || 'Unknown CPU',
      cpuCores: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemMB: Math.round(os.freemem() / (1024 * 1024)),
      cudaAvailable: Boolean(hw.cuda_available),
      gpu: hw.gpu_name || (hw.cuda_available ? 'NVIDIA GPU (CUDA)' : 'Integrated / Standard Graphics')
    };
  });

  ipcMain.handle('system:cache-size', async () => {
    const cacheDir = settingsService.getCacheDir();
    let totalBytes = 0;
    let fileCount = 0;
    try {
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          try {
            const st = fs.statSync(path.join(cacheDir, file));
            totalBytes += st.size;
            fileCount++;
          } catch (_) {}
        }
      }
    } catch (_) {}

    return {
      bytes: totalBytes,
      formatted: `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`,
      fileCount,
      path: cacheDir
    };
  });

  ipcMain.handle('system:clear-cache', async () => {
    const cacheDir = settingsService.getCacheDir();
    let freedBytes = 0;
    try {
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          try {
            const p = path.join(cacheDir, file);
            freedBytes += fs.statSync(p).size;
            fs.unlinkSync(p);
          } catch (_) {}
        }
      }
      return { success: true, freedMB: (freedBytes / (1024 * 1024)).toFixed(2) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('system:export-logs', async () => {
    try {
      const logPath = logger.getLogFilePath();
      const saveRes = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Diagnostics & Logs',
        defaultPath: `ai_dubbing_studio_diagnostics_${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
      });

      if (!saveRes.canceled && saveRes.filePath) {
        let rawLogContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : 'No logs recorded yet.\n';

        // Redact any potential Gemini API keys
        const sanitizedLogs = rawLogContent.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, 'AIzaSy[REDACTED_API_KEY]');

        // Header with system and version diagnostics
        const header = [
          '================================================================',
          '        AI DUBBING STUDIO — DIAGNOSTIC & LOG ARCHIVE            ',
          '================================================================',
          `Exported At:     ${new Date().toISOString()}`,
          `App Version:     1.0.0`,
          `Electron:        ${process.versions.electron}`,
          `Node.js:         ${process.versions.node}`,
          `Chrome:          ${process.versions.chrome}`,
          `Platform:        ${process.platform} (${process.arch})`,
          `Total RAM:       ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
          `Free RAM:        ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
          `FFmpeg Path:     ${ffmpegService.ffmpegPath}`,
          `FFprobe Path:    ${ffmpegService.ffprobePath}`,
          '================================================================',
          'LOG ENTRIES (API Keys Sanitized):',
          '================================================================\n'
        ].join('\n');

        fs.writeFileSync(saveRes.filePath, header + sanitizedLogs, 'utf8');
        return { success: true, filePath: saveRes.filePath };
      }
      return { canceled: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:select-folder', async () => {
    try {
      const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
      });
      return res;
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });
}

module.exports = { registerSettingsIpc };
