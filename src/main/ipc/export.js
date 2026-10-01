const { ipcMain } = require('electron');
const exportService = require('../services/export');
const logger = require('../utils/logger');

function registerExportIpc(win) {
  ipcMain.handle('export:start', async (_event, params) => {
    try {
      logger.info(`IPC export:start requested. Output: ${params?.outputPath}`);
      const result = await exportService.exportVideo({
        ...params,
        onProgress: (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('export:progress', progress);
          }
        }
      });
      return { success: true, ...result };
    } catch (err) {
      logger.error('IPC export:start error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export:cancel', async () => {
    try {
      logger.info('IPC export:cancel requested');
      exportService.cancel();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerExportIpc;
