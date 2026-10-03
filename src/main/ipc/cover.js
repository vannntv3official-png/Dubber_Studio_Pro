const { ipcMain } = require('electron');
const coverStudio = require('../services/cover/cover-studio');
const logger = require('../utils/logger');

function registerCoverIpc(mainWindow) {
  logger.info('Registering Cover Studio IPC handlers...');

  ipcMain.handle('cover:templates', async () => {
    return coverStudio.getTemplates();
  });

  ipcMain.handle('cover:select', async () => {
    return coverStudio.selectPoster(mainWindow);
  });

  ipcMain.handle('cover:import-path', async (_event, filePath) => {
    return coverStudio.importPoster(filePath);
  });

  ipcMain.handle('cover:analyse', async (_event, imagePath) => {
    return coverStudio.analysePoster(imagePath);
  });

  ipcMain.handle('cover:erase', async (_event, imagePath, textRegions) => {
    return coverStudio.erasePosterText(imagePath, textRegions);
  });

  ipcMain.handle('cover:generate-3d', async (_event, params) => {
    return coverStudio.generate3DTitle(params);
  });

  ipcMain.handle('cover:export', async (_event, params) => {
    return coverStudio.exportCover(params);
  });

  logger.info('Cover Studio IPC handlers registered.');
}

module.exports = { registerCoverIpc };
