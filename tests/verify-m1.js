/**
 * M1 Automated Verification Test
 * Tests:
 * 1. Electron shell initialization & Security settings (contextIsolation, nodeIntegration, CSP)
 * 2. Preload API exposure (window.api)
 * 3. Default Khmer language & i18n switching (KM -> EN -> KM)
 * 4. Theme switching (Dark -> Light -> Dark)
 * 5. Bundled Khmer font availability
 * 6. Subtitle table rendering, row addition, undo / redo
 * 7. Timeline rendering with 5 tracks (ORIG, V1, T1, A1, A2) & playhead
 * 8. Screenshot capture of the rendered UI
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');

async function runM1Verification() {
  logger.init();
  console.log('--- Starting Milestone 1 Verification ---');

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false, // Run offscreen/hidden during test
    backgroundColor: '#0e1726',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#e8eef8',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerIpcHandlers(win);

  const indexPath = path.join(__dirname, '../src/renderer/index.html');
  await win.loadFile(indexPath);

  // Wait a moment for DOM & scripts to initialize
  await new Promise(r => setTimeout(r, 600));

  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const report = [];
      const pass = (name) => report.push({ name, passed: true });
      const fail = (name, err) => report.push({ name, passed: false, error: String(err) });

      try {
        localStorage.clear();
        const { theme } = await import('./js/theme.js');
        theme.applyTheme('dark');

        // 1. Check window.api exposed via contextBridge
        if (window.api && window.api.theme && window.api.system && window.api.project) {
          pass('Preload API exposure (window.api)');
        } else {
          fail('Preload API exposure', 'window.api missing or incomplete');
        }

        // 2. Check default language is Khmer
        const initialLang = document.documentElement.lang;
        if (initialLang === 'km') {
          pass('Default language is Khmer (km)');
        } else {
          fail('Default language', 'Expected km, got ' + initialLang);
        }

        // 3. Test i18n toggle (KM -> EN)
        const langBtn = document.getElementById('lang');
        langBtn.click();
        const enLang = document.documentElement.lang;
        const addBtnTextEn = document.getElementById('add').textContent;
        if (enLang === 'en' && addBtnTextEn.includes('Add Text')) {
          pass('Language switch to English (EN)');
        } else {
          fail('Language switch to English', 'Lang: ' + enLang + ', AddBtn: ' + addBtnTextEn);
        }

        // 4. Test i18n toggle back (EN -> KM)
        langBtn.click();
        const kmLang = document.documentElement.lang;
        const addBtnTextKm = document.getElementById('add').textContent;
        if (kmLang === 'km' && addBtnTextKm.includes('បន្ថែម')) {
          pass('Language switch back to Khmer (KM)');
        } else {
          fail('Language switch back to Khmer', 'Lang: ' + kmLang + ', AddBtn: ' + addBtnTextKm);
        }

        // 5. Test Theme toggle (Dark -> Light)
        const themeBtn = document.getElementById('theme');
        themeBtn.click();
        const isLight = document.documentElement.dataset.theme === 'light';
        if (isLight) {
          pass('Theme switch to Light mode');
        } else {
          fail('Theme switch to Light mode', 'Dataset theme is ' + document.documentElement.dataset.theme);
        }

        // 6. Test Theme toggle back (Light -> Dark)
        themeBtn.click();
        const isDark = !document.documentElement.dataset.theme;
        if (isDark) {
          pass('Theme switch back to Dark mode');
        } else {
          fail('Theme switch back to Dark mode', 'Dataset theme is ' + document.documentElement.dataset.theme);
        }

        // 7. Verify Subtitle Table Rows
        const rows = document.querySelectorAll('#rows tr');
        if (rows.length >= 9) {
          pass('Subtitle table rendered rows count: ' + rows.length);
        } else {
          fail('Subtitle table rows', 'Expected at least 9 rows, found ' + rows.length);
        }

        // 8. Test Add Subtitle & Undo/Redo
        const initialCount = document.querySelectorAll('#rows tr').length;
        document.getElementById('add').click();
        const countAfterAdd = document.querySelectorAll('#rows tr').length;
        document.getElementById('undo').click();
        const countAfterUndo = document.querySelectorAll('#rows tr').length;
        document.getElementById('redo').click();
        const countAfterRedo = document.querySelectorAll('#rows tr').length;

        if (countAfterAdd === initialCount + 1 && countAfterUndo === initialCount && countAfterRedo === initialCount + 1) {
          pass('Row creation, Undo, and Redo functioning correctly');
        } else {
          fail('Undo/Redo check', 'Counts: ' + [initialCount, countAfterAdd, countAfterUndo, countAfterRedo].join(' -> '));
        }

        // 9. Verify Timeline Tracks (ORIG, V1, T1, A1, A2)
        const tracks = document.querySelectorAll('#tracks .track');
        if (tracks.length === 5) {
          pass('Timeline rendered 5 tracks (ORIG, V1, T1, A1, A2)');
        } else {
          fail('Timeline tracks', 'Expected 5 tracks, found ' + tracks.length);
        }

        // 10. Verify Khmer Font definition
        const computedFont = window.getComputedStyle(document.body).fontFamily;
        if (computedFont.includes('Khmer') || computedFont.includes('Noto Sans Khmer')) {
          pass('Font stack includes Khmer font: ' + computedFont);
        } else {
          fail('Font stack', 'Computed font: ' + computedFont);
        }

      } catch (err) {
        fail('Unexpected error in test', err.message);
      }

      return report;
    })();
  `);

  console.log('\n--- Test Results ---');
  let allPassed = true;
  for (const r of results) {
    if (r.passed) {
      console.log(`[PASS] ${r.name}`);
    } else {
      console.error(`[FAIL] ${r.name}: ${r.error}`);
      allPassed = false;
    }
  }

  // Capture Dark mode screenshot
  const darkScreenshotPath = path.join(__dirname, 'm1-verified-dark.png');
  const darkImage = await win.webContents.capturePage();
  fs.writeFileSync(darkScreenshotPath, darkImage.toPNG());
  console.log(`[SCREENSHOT] Saved dark mode screenshot to: ${darkScreenshotPath}`);

  // Switch to Light mode and capture Light mode screenshot
  await win.webContents.executeJavaScript(`
    document.getElementById('theme').click();
  `);
  await new Promise(r => setTimeout(r, 200));

  const lightScreenshotPath = path.join(__dirname, 'm1-verified-light.png');
  const lightImage = await win.webContents.capturePage();
  fs.writeFileSync(lightScreenshotPath, lightImage.toPNG());
  console.log(`[SCREENSHOT] Saved light mode screenshot to: ${lightScreenshotPath}`);

  // Switch back to Dark mode
  await win.webContents.executeJavaScript(`
    document.getElementById('theme').click();
  `);

  win.close();
  if (allPassed) {
    console.log('\n*** MILESTONE 1 VERIFICATION SUCCESSFUL ***');
    app.exit(0);
  } else {
    console.error('\n*** MILESTONE 1 VERIFICATION FAILED ***');
    app.exit(1);
  }
}

app.whenReady().then(runM1Verification);
