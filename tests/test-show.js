const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true, // visible window so compositor paints active frames
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
  await new Promise(r => setTimeout(r, 600));

  // Toggle theme to Light
  await win.webContents.executeJavaScript(`
    document.getElementById('theme').click();
  `);
  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'm1-verified-light-visible.png'), image.toPNG());
  console.log('Saved m1-verified-light-visible.png');

  win.close();
  app.exit(0);
});
