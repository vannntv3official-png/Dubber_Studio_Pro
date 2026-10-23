const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function testDirectTranslation() {
  logger.init();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerIpcHandlers(win);
  keyPool.loadKeys();
  try { keyPool.addKey('AIzaSyDummyKeyForTestingDirectTrans12345'); } catch (_) {}

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 1500));

  const checkResults = await win.webContents.executeJavaScript(`
    (async () => {
      const modal = document.getElementById('translateModal');
      const tlang = document.getElementById('tlang');
      const ttone = document.getElementById('ttone');
      const transBtn = document.getElementById('translateBtn');

      // Check existence and hidden state
      const modalHidden = modal ? (modal.hidden || window.getComputedStyle(modal).display === 'none') : true;
      const tlangExists = Boolean(tlang);
      const ttoneExists = Boolean(ttone);
      const ttoneOptions = ttone ? [...ttone.options].map(o => o.value) : [];

      // Put a mock row in state
      const { state } = await import('./js/state.js');
      state.rows = [
        { id: 1, s: 0, e: 2.5, t: 'Hello world', sourceText: 'Hello world', ok: false }
      ];

      // Simulate clicking translateBtn
      transBtn.disabled = false;
      transBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const modalStillClosed = modal ? (modal.hidden || !modal.classList.contains('open') || window.getComputedStyle(modal).display === 'none') : true;
      const btnIsActive = transBtn.classList.contains('job-active-translating') || transBtn.classList.contains('busy');

      return {
        modalHidden,
        tlangExists,
        ttoneExists,
        ttoneOptions,
        modalStillClosed,
        btnIsActive,
        btnText: transBtn.textContent.trim()
      };
    })()
  `);

  console.log('--- Direct Translation Verification ---');
  console.log('Modal permanently hidden:', checkResults.modalHidden);
  console.log('Target Lang exists on toolbar:', checkResults.tlangExists);
  console.log('Dubbing Tone exists on toolbar:', checkResults.ttoneExists);
  console.log('Tone options:', checkResults.ttoneOptions);
  console.log('Modal still closed after click:', checkResults.modalStillClosed);
  console.log('Button transitioned to active state without popup:', checkResults.btnIsActive);
  console.log('Button text during job:', checkResults.btnText);

  // Take screenshot
  const image = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'direct-translation-verified.png'), image.toPNG());
  console.log('Screenshot saved to tests/direct-translation-verified.png');

  app.quit();
}

app.whenReady().then(testDirectTranslation);
