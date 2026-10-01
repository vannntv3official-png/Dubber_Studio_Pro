const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function captureSections() {
  logger.init();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    backgroundColor: '#0e1726',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8eef8', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerIpcHandlers(win);
  keyPool.loadKeys();

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 1000));

  // Open Settings Modal
  await win.webContents.executeJavaScript(`
    document.getElementById('settings').click();
  `);
  await new Promise(r => setTimeout(r, 500));

  // 1. Capture Pronunciation tab
  await win.webContents.executeJavaScript(`
    document.getElementById('navPron').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  let img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'settings-pronunciation-view.png'), img.toPNG());

  // 2. Capture Shortcuts tab
  await win.webContents.executeJavaScript(`
    document.getElementById('navShortcuts').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'settings-shortcuts-view.png'), img.toPNG());

  // 3. Capture Theme tab
  await win.webContents.executeJavaScript(`
    document.getElementById('navTheme').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'settings-theme-view.png'), img.toPNG());

  console.log('Screenshots captured successfully!');
  win.close();
  process.exit(0);
}

app.whenReady().then(captureSections);
