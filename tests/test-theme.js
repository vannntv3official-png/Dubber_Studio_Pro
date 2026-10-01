const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../src/main/ipc');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
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
  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 500));

  const log1 = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('theme');
      const b4 = document.documentElement.getAttribute('data-theme');
      btn.click();
      const after = document.documentElement.getAttribute('data-theme');
      return { b4, after, btnText: btn.textContent };
    })()
  `);
  console.log('Theme toggle 1:', log1);
  await new Promise(r => setTimeout(r, 500));

  const image = await win.webContents.capturePage();
  const fs = require('fs');
  fs.writeFileSync(path.join(__dirname, 'test-light-capture.png'), image.toPNG());
  console.log('Saved test-light-capture.png');

  app.exit(0);
});
