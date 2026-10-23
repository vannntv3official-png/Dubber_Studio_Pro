const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../services/ffmpeg');
const logger = require('../utils/logger');

function registerMediaIpc() {
  ipcMain.handle('media:select-overlay-image', async () => {
    const { dialog } = require('electron');
    const res = await dialog.showOpenDialog({
      title: 'ជ្រើសរើសរូបភាព ឬ ឡូហ្គោ (Choose a photo or logo)',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('media:probe', async (_event, filePath) => {
    try {
      return await ffmpegService.probeMedia(filePath);
    } catch (err) {
      logger.error('IPC media:probe error', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('media:get-peaks', async (_event, filePath, numPeaks = 600) => {
    try {
      return await ffmpegService.generateWaveformPeaks(filePath, numPeaks);
    } catch (err) {
      logger.error('IPC media:get-peaks error', err);
      return { error: err.message, peaks: [] };
    }
  });

  ipcMain.handle('media:load-bgm', async (_event, { projectJsonPath, audioPath }) => {
    try {
      logger.info(`Loading BGM track: ${audioPath}`);
      let destPath = audioPath;
      if (projectJsonPath && fs.existsSync(projectJsonPath)) {
        const mediaDir = path.join(path.dirname(projectJsonPath), 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
        const ext = path.extname(audioPath) || '.mp3';
        destPath = path.join(mediaDir, `bgm${ext}`);
        fs.copyFileSync(audioPath, destPath);
      }

      const peaks = await ffmpegService.generateWaveformPeaks(destPath, 600);
      return { success: true, audioPath: destPath, peaks };
    } catch (err) {
      logger.error('IPC media:load-bgm error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('media:load-a1', async (_event, { projectJsonPath, audioPath }) => {
    try {
      logger.info(`Loading A1 Dub track: ${audioPath}`);
      let destPath = audioPath;
      if (projectJsonPath && fs.existsSync(projectJsonPath)) {
        const mediaDir = path.join(path.dirname(projectJsonPath), 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
        const ext = path.extname(audioPath) || '.wav';
        destPath = path.join(mediaDir, `a1${ext}`);
        fs.copyFileSync(audioPath, destPath);
      }

      const peaks = await ffmpegService.generateWaveformPeaks(destPath, 600);
      return { success: true, audioPath: destPath, peaks };
    } catch (err) {
      logger.error('IPC media:load-a1 error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('media:assemble-dub-track', async (_event, { segments, projectDir, totalDuration }) => {
    try {
      const audioMixer = require('../services/mixing/audio-mixer');
      const targetDir = projectDir || path.join(process.cwd(), 'temp');
      const mediaDir = path.join(targetDir, 'media');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      const outputPath = path.join(mediaDir, 'assembled_dub.wav');
      await audioMixer.buildDubTrack(segments, outputPath, totalDuration || 10, projectDir);
      const peaks = await ffmpegService.generateWaveformPeaks(outputPath, 600);
      return { success: true, audioPath: outputPath, peaks };
    } catch (err) {
      logger.error('IPC media:assemble-dub-track error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('media:generate-thumbnails', async (_event, { videoPath, count = 12, width = 160 }) => {
    try {
      if (!videoPath || !fs.existsSync(videoPath)) {
        return { success: false, error: 'Video file not found' };
      }
      const mediaDir = path.join(path.dirname(videoPath), 'media', 'thumbnails');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      const thumbs = await ffmpegService.generateThumbnails(videoPath, mediaDir, count, width);
      return { success: true, thumbnails: thumbs };
    } catch (err) {
      logger.error('IPC media:generate-thumbnails error', err);
      return { success: false, error: err.message, thumbnails: [] };
    }
  });
}

module.exports = { registerMediaIpc };
