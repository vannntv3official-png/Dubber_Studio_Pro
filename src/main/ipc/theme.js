const { ipcMain } = require('electron');
const logger = require('../utils/logger');

function registerThemeIpc(mainWindow) {
  ipcMain.handle('theme:set', async (_event, theme) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const isDark = theme !== 'light';
        const symbolColor = isDark ? '#e8eef8' : '#14213d';
        const backgroundColor = isDark ? '#0e1726' : '#eaf0fb';

        mainWindow.setBackgroundColor(backgroundColor);

        // Update custom titlebar overlay button colors if supported on Windows
        if (process.platform === 'win32' && typeof mainWindow.setTitleBarOverlay === 'function') {
          try {
            mainWindow.setTitleBarOverlay({
              color: '#00000000',
              symbolColor: symbolColor,
              height: 40
            });
          } catch (overlayErr) {
            logger.debug('setTitleBarOverlay skipped: ' + overlayErr.message);
          }
        }
      }
      return { success: true, theme };
    } catch (err) {
      logger.error('Failed to set theme via IPC', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerThemeIpc };
