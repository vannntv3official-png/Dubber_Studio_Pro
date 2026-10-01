const { ipcMain } = require('electron');
const translationService = require('../services/providers/translation');
const logger = require('../utils/logger');

function registerTranslationIpc(mainWindow) {
  ipcMain.handle('translation:translate', async (_event, segments, options) => {
    try {
      logger.info(`Starting translation IPC request for ${segments?.length || 0} segments with options: ${JSON.stringify(options)}`);
      const results = await translationService.translate(segments, options, (prog) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('translation:progress', prog);
        }
      });
      return { success: true, results };
    } catch (err) {
      logger.error(`Translation IPC failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('translation:cancel', async () => {
    logger.info('Cancelling active translation from IPC');
    translationService.cancel();
    return { success: true };
  });
}

module.exports = { registerTranslationIpc };
