const { ipcMain } = require('electron');
const asrService = require('../services/providers/asr');
const logger = require('../utils/logger');

function registerAsrIpc(mainWindow) {
  ipcMain.handle('asr:transcribe', async (_event, audioPath, options) => {
    try {
      logger.info(`Starting transcription IPC request for: ${audioPath} with options: ${JSON.stringify(options)}`);
      const segments = await asrService.transcribe(audioPath, options, (prog) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('asr:progress', prog);
        }
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('asr:progress', {
          percent: 100,
          message: `Transcription complete: ${segments?.length || 0} segments recognized.`
        });
      }
      return { success: true, segments };
    } catch (err) {
      logger.error(`Transcription IPC failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('asr:cancel', async () => {
    logger.info('Cancelling active transcription from IPC');
    asrService.cancel();
    return { success: true };
  });
}

module.exports = { registerAsrIpc };
