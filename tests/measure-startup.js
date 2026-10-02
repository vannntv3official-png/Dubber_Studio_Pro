const { app, BrowserWindow } = require('electron');
const path = require('path');

const { registerIpcHandlers } = require('../src/main/ipc');

const startTime = Date.now();

app.whenReady().then(() => {
  const readyTime = Date.now();
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  registerIpcHandlers(win);

  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  win.webContents.on('did-finish-load', () => {
    const finishLoadTime = Date.now();
    console.log(JSON.stringify({
      timeToAppReadyMs: readyTime - startTime,
      timeToDidFinishLoadMs: finishLoadTime - startTime,
      totalStartupSec: ((finishLoadTime - startTime) / 1000).toFixed(2)
    }));
    app.quit();
  });
});
