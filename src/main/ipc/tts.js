const { ipcMain } = require('electron');
const ttsService = require('../services/providers/tts');
const logger = require('../utils/logger');

function registerTtsIpc(win) {
  ipcMain.handle('tts:synthesize-batch', async (event, { segments, options }) => {
    try {
      logger.info(`IPC tts:synthesize-batch requested for ${segments?.length || 0} segments`);
      const results = await ttsService.synthesizeBatch(
        segments,
        options,
        (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('tts:progress', progress);
          }
        }
      );
      return { success: true, results };
    } catch (err) {
      logger.error('IPC tts:synthesize-batch error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tts:synthesize-single', async (event, params) => {
    try {
      logger.info(`IPC tts:synthesize-single requested for voice ${params?.voice}`);
      const result = await ttsService.synthesizeSingle(params);
      return { success: true, ...result };
    } catch (err) {
      logger.error('IPC tts:synthesize-single error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tts:list-voices', async (event, { engine } = {}) => {
    try {
      const voices = await ttsService.listVoices(engine);
      return { success: true, voices };
    } catch (err) {
      logger.error('IPC tts:list-voices error', err);
      return { success: false, error: err.message, voices: [] };
    }
  });

  ipcMain.handle('tts:cancel', async () => {
    try {
      ttsService.cancel();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerTtsIpc;
