const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function captureAsrAndVoices() {
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

  // 1. Capture ASR tab
  await win.webContents.executeJavaScript(`
    document.getElementById('navAsr').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  let img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'settings-asr-view.png'), img.toPNG());

  // 2. Capture Voices tab
  await win.webContents.executeJavaScript(`
    document.getElementById('navVoices').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'settings-voices-view.png'), img.toPNG());

  console.log('ASR & Voices screenshots captured successfully!');
  win.close();
  process.exit(0);
}

app.whenReady().then(captureAsrAndVoices);
