const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const logger = require('./utils/logger');
const { registerIpcHandlers } = require('./ipc');

let mainWindow = null;

function setupSecurityHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self' data:; " +
          "img-src 'self' data: blob: file:; " +
          "media-src 'self' data: blob: file:; " +
          "connect-src 'self';"
        ]
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0e1726',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#e8eef8',
      height: 44
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  // Forward renderer console messages to main logger
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    const lvlName = levels[level] || 'info';
    const source = sourceId ? path.basename(sourceId) : 'renderer';
    logger.write(lvlName, `[Renderer:${source}:${line}] ${message}`);
  });

  // Security: open external links in system browser and deny new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
        logger.info('Opened external link in system browser', { url });
      } else {
        logger.warn('Blocked attempt to open disallowed URL scheme', { url });
      }
    } catch (e) {
      logger.warn('Failed to parse window open URL', { url, error: e.message });
    }
    return { action: 'deny' };
  });

  // Security: block unexpected navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      logger.warn('Blocked external navigation', { url: navigationUrl });
    }
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // Load renderer index.html
  const indexPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Main window created and loaded index.html');
}

const keyPool = require('./services/key-pool');
const sidecarManager = require('./services/sidecar-manager');

// App lifecycle
app.whenReady().then(() => {
  logger.init();
  setupSecurityHeaders();
  keyPool.loadKeys();

  // Pre-warm sidecar in background
  sidecarManager.start().catch((err) => {
    logger.warn(`Sidecar pre-warm error: ${err.message}`);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  sidecarManager.shutdown();
});

app.on('window-all-closed', () => {
  logger.info('All windows closed. Quitting application.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

