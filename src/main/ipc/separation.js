const { ipcMain } = require('electron');
const separationService = require('../services/providers/separation');
const { formatSeparationResponse } = require('../../shared/contracts');
const logger = require('../utils/logger');

function registerSeparationIpc(win) {
  ipcMain.handle('separation:isolate-bgm', async (_event, { audioPath, outputDir, options }) => {
    try {
      logger.info(`IPC separation:isolate-bgm requested for: ${audioPath}`);
      const result = await separationService.separate(
        audioPath,
        outputDir,
        options,
        (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('separation:progress', progress);
          }
        }
      );
      return formatSeparationResponse({
        success: true,
        vocalsPath: result.vocalsPath,
        bgmPath: result.bgmPath
      });
    } catch (err) {
      logger.error('IPC separation:isolate-bgm error', err);
      return formatSeparationResponse({
        success: false,
        error: err.message
      });
    }
  });

  ipcMain.handle('separation:cancel', async () => {
    try {
      separationService.cancel();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerSeparationIpc;
