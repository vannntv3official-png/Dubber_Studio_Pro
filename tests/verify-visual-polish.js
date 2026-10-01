const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

// Helper to compute relative luminance
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(rgb1, rgb2) {
  const l1 = luminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = luminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

async function runVisualPolishVerification() {
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
  await new Promise(r => setTimeout(r, 1200));

  // Open Settings Modal
  await win.webContents.executeJavaScript(`
    document.getElementById('settings').click();
  `);
  await new Promise(r => setTimeout(r, 600));

  console.log('=== VISUAL POLISH VERIFICATION START ===');

  // Measure in Dark Theme
  const measurements = await win.webContents.executeJavaScript(`
    (() => {
      const results = {};
      
      // Helper to parse rgba or rgb
      function parseColor(str) {
        if (!str) return null;
        const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
        if (!m) return null;
        return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
      }

      // Check font sizes
      const descEl = document.querySelector('.settings-card-desc');
      const labelEl = document.querySelector('.settings-card-label');
      const navBtnEl = document.querySelector('.settings-nav-btn');
      const secTitleEl = document.querySelector('.settings-section-header h3');
      const secDescEl = document.querySelector('.settings-section-header p');
      const inputEl = document.querySelector('#setKeyInp');
      const saveBtn = document.querySelector('#settingsSaveBtn');

      results.fontSizes = {
        cardDesc: descEl ? window.getComputedStyle(descEl).fontSize : 'N/A',
        cardLabel: labelEl ? window.getComputedStyle(labelEl).fontSize : 'N/A',
        navBtn: navBtnEl ? window.getComputedStyle(navBtnEl).fontSize : 'N/A',
        secTitle: secTitleEl ? window.getComputedStyle(secTitleEl).fontSize : 'N/A',
        secDesc: secDescEl ? window.getComputedStyle(secDescEl).fontSize : 'N/A',
        input: inputEl ? window.getComputedStyle(inputEl).fontSize : 'N/A',
      };

      results.lineHeights = {
        cardDesc: descEl ? window.getComputedStyle(descEl).lineHeight : 'N/A',
        secDesc: secDescEl ? window.getComputedStyle(secDescEl).lineHeight : 'N/A'
      };

      results.controlHeights = {
        inputMinHeight: inputEl ? window.getComputedStyle(inputEl).minHeight : 'N/A',
        inputHeight: inputEl ? window.getComputedStyle(inputEl).height : 'N/A',
        saveBtnMinHeight: saveBtn ? window.getComputedStyle(saveBtn).minHeight : 'N/A',
        saveBtnHeight: saveBtn ? window.getComputedStyle(saveBtn).height : 'N/A',
        navBtnHeight: navBtnEl ? window.getComputedStyle(navBtnEl).height : 'N/A'
      };

      // Raw computed colors for contrast calculation
      results.colorsDark = {
        descColor: descEl ? window.getComputedStyle(descEl).color : '',
        cardBg: document.querySelector('.settings-card') ? window.getComputedStyle(document.querySelector('.settings-card')).backgroundColor : '',
        navBtnColor: navBtnEl ? window.getComputedStyle(navBtnEl).color : '',
        sidebarBg: document.querySelector('.settings-sidebar') ? window.getComputedStyle(document.querySelector('.settings-sidebar')).backgroundColor : '',
        secDescColor: secDescEl ? window.getComputedStyle(secDescEl).color : '',
        contentBg: document.querySelector('.settings-content-pane') ? window.getComputedStyle(document.querySelector('.settings-content-pane')).backgroundColor : '',
        inputBg: inputEl ? window.getComputedStyle(inputEl).backgroundColor : '',
        inputColor: inputEl ? window.getComputedStyle(inputEl).color : '',
        saveBtnColor: saveBtn ? window.getComputedStyle(saveBtn).color : '',
        saveBtnBg: saveBtn ? window.getComputedStyle(saveBtn).backgroundColor : ''
      };

      return results;
    })()
  `);

  console.log('Measured Font Sizes:', measurements.fontSizes);
  console.log('Measured Line Heights:', measurements.lineHeights);
  console.log('Measured Control Heights:', measurements.controlHeights);

  // Switch to Gemini Keys tab (matches user screenshot)
  await win.webContents.executeJavaScript(`
    document.getElementById('navKeys').click();
  `);
  await new Promise(r => setTimeout(r, 500));

  let img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'polished-settings-dark-keys.png'), img.toPNG());
  console.log('Captured polished-settings-dark-keys.png');

  // Capture all 9 sections in Dark mode
  const sectionIds = [
    { nav: 'navGen', file: 'polished-settings-dark-general.png' },
    { nav: 'navTheme', file: 'polished-settings-dark-theme.png' },
    { nav: 'navAsr', file: 'polished-settings-dark-asr.png' },
    { nav: 'navVoices', file: 'polished-settings-dark-voices.png' },
    { nav: 'navPron', file: 'polished-settings-dark-pronunciation.png' },
    { nav: 'navShortcuts', file: 'polished-settings-dark-shortcuts.png' },
    { nav: 'navSystem', file: 'polished-settings-dark-system.png' },
    { nav: 'navAbout', file: 'polished-settings-dark-about.png' },
  ];

  for (const s of sectionIds) {
    await win.webContents.executeJavaScript(`document.getElementById('${s.nav}').click();`);
    await new Promise(r => setTimeout(r, 300));
    img = await win.capturePage();
    fs.writeFileSync(path.join(__dirname, s.file), img.toPNG());
    console.log(`Captured ${s.file}`);
  }

  // Switch to Light Theme
  await win.webContents.executeJavaScript(`
    document.body.setAttribute('data-theme', 'light');
    document.getElementById('navKeys').click();
  `);
  await new Promise(r => setTimeout(r, 500));

  const measurementsLight = await win.webContents.executeJavaScript(`
    (() => {
      const descEl = document.querySelector('.settings-card-desc');
      const navBtnEl = document.querySelector('.settings-nav-btn');
      const secDescEl = document.querySelector('.settings-section-header p');
      const inputEl = document.querySelector('#setKeyInp');
      const saveBtn = document.querySelector('#settingsSaveBtn');

      return {
        descColor: descEl ? window.getComputedStyle(descEl).color : '',
        cardBg: document.querySelector('.settings-card') ? window.getComputedStyle(document.querySelector('.settings-card')).backgroundColor : '',
        navBtnColor: navBtnEl ? window.getComputedStyle(navBtnEl).color : '',
        sidebarBg: document.querySelector('.settings-sidebar') ? window.getComputedStyle(document.querySelector('.settings-sidebar')).backgroundColor : '',
        secDescColor: secDescEl ? window.getComputedStyle(secDescEl).color : '',
        contentBg: document.querySelector('.settings-content-pane') ? window.getComputedStyle(document.querySelector('.settings-content-pane')).backgroundColor : '',
        inputBg: inputEl ? window.getComputedStyle(inputEl).backgroundColor : '',
        inputColor: inputEl ? window.getComputedStyle(inputEl).color : '',
        saveBtnColor: saveBtn ? window.getComputedStyle(saveBtn).color : '',
        saveBtnBg: saveBtn ? window.getComputedStyle(saveBtn).backgroundColor : ''
      };
    })()
  `);

  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'polished-settings-light-keys.png'), img.toPNG());
  console.log('Captured polished-settings-light-keys.png');

  // Test English language
  await win.webContents.executeJavaScript(`
    document.body.removeAttribute('data-theme');
    // Set language to en
    if (window.i18n) {
      window.i18n.setLanguage('en');
    }
  `);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'polished-settings-english.png'), img.toPNG());
  console.log('Captured polished-settings-english.png');

  // Test minimum size (resize window so modal hits minimum or sidebar collapses)
  win.setSize(740, 500);
  await new Promise(r => setTimeout(r, 600));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'polished-settings-min-size.png'), img.toPNG());
  console.log('Captured polished-settings-min-size.png');

  console.log('=== VISUAL POLISH VERIFICATION COMPLETE ===');
  win.close();
  process.exit(0);
}

app.whenReady().then(runVisualPolishVerification);
