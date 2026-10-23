const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function testCodecraftUI() {
  logger.init();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
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

  // Open settings & navigate to CodeCraft
  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const openBtn = document.getElementById('settings');
      if (openBtn) openBtn.click();
      await new Promise(r => setTimeout(r, 1200));

      const navItem = document.getElementById('navCodecraft');
      if (navItem) navItem.click();
      await new Promise(r => setTimeout(r, 1200));

      const statusSpan = document.querySelector('#codecraftStatusCard .settings-card-label span[data-i18n="codecraftStatus"]');
      const testBtn = document.getElementById('setCodecraftTestBtn');
      const modelSel = document.getElementById('setCodecraftTransModel');

      return {
        statusText: statusSpan ? statusSpan.textContent.trim() : null,
        testBtnText: testBtn ? testBtn.textContent.trim() : null,
        selectedModel: modelSel ? modelSel.value : null,
        modelOptions: modelSel ? [...modelSel.options].map(o => o.value) : []
      };
    })()
  `);

  console.log('--- UI Verification Results ---');
  console.log('Status Label Text:', results.statusText);
  console.log('Test Button Text:', results.testBtnText);
  console.log('Selected Model:', results.selectedModel);
  console.log('Model Options:', results.modelOptions);

  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'codecraft-settings-verified.png'), image.toPNG());
  console.log('Screenshot saved to tests/codecraft-settings-verified.png');

  app.quit();
}

app.whenReady().then(testCodecraftUI);
