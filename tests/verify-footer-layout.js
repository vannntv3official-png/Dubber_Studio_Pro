const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function testFooterLayout() {
  logger.init();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    backgroundColor: '#eaf0fb',
    titleBarStyle: 'hidden',
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
  await new Promise(r => setTimeout(r, 1200));

  // Open settings
  await win.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('settings').click();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  // Switch to Light Mode and trigger both Dirty indicator & Restart Required badge
  await win.webContents.executeJavaScript(`
    (async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.add('theme-light');
      
      const dirtyEl = document.getElementById('settingsFooterDirtyIndicator');
      if (dirtyEl) dirtyEl.hidden = false;
      
      const restartEl = document.getElementById('settingsRestartBadge');
      if (restartEl) restartEl.hidden = false;

      const saveBtn = document.getElementById('settingsSaveBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.title = 'Save changes';
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  let image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'footer-verified-light.png'), image.toPNG());

  // Switch to Dark Mode
  await win.webContents.executeJavaScript(`
    (async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.remove('theme-light');
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'footer-verified-dark.png'), image.toPNG());

  console.log('--- Footer verification screenshots saved ---');
  app.quit();
}

app.whenReady().then(testFooterLayout);
