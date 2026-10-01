const { registerThemeIpc } = require('./theme');
const { registerSystemIpc } = require('./system');
const { registerProjectIpc } = require('./project');
const { registerMediaIpc } = require('./media');
const { registerSettingsIpc } = require('./settings');
const { registerAsrIpc } = require('./asr');
const { registerTranslationIpc } = require('./translation');
const registerTtsIpc = require('./tts');
const registerSeparationIpc = require('./separation');
const registerExportIpc = require('./export');
const logger = require('../utils/logger');

function registerIpcHandlers(mainWindow) {
  logger.info('Registering IPC handlers...');
  registerThemeIpc(mainWindow);
  registerSystemIpc();
  registerProjectIpc(mainWindow);
  registerMediaIpc();
  registerSettingsIpc(mainWindow);
  registerAsrIpc(mainWindow);
  registerTranslationIpc(mainWindow);
  registerTtsIpc(mainWindow);
  registerSeparationIpc(mainWindow);
  registerExportIpc(mainWindow);
  logger.info('IPC handlers registered successfully.');
}

module.exports = { registerIpcHandlers };
