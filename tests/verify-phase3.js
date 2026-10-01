const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function runVerification() {
  logger.init();
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: true,
    backgroundColor: '#0e1726',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8eef8', height: 40 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../src/preload/index.js'),
      sandbox: true
    }
  });

  registerIpcHandlers(win);
  keyPool.loadKeys();

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Wait for initial render and state init
  await new Promise(r => setTimeout(r, 1500));

  console.log('=== PHASE 3 VERIFICATION START ===');

  const auditResults = await win.webContents.executeJavaScript(`
    (() => {
      const getStyles = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          color: cs.color,
          bg: cs.backgroundColor,
          height: cs.height,
          border: cs.border
        };
      };

      // Check font sizes
      const bodyStyle = getStyles('body');
      const thStyle = getStyles('th');
      const tdTimeStyle = getStyles('td.t') || getStyles('span.t');
      const tdTxtStyle = getStyles('td.txt');
      const curTimeStyle = getStyles('#curTime');
      const slidersOutStyle = getStyles('.sliders output');
      const footerStyle = getStyles('footer');
      const edgeStyle = getStyles('.tl-edge-indicator');
      const rulerCornerStyle = getStyles('.tl-label-cell.tl-ruler-corner');

      // Check hitsize of header buttons
      const undoBtn = document.getElementById('undo');
      const undoRect = undoBtn ? undoBtn.getBoundingClientRect() : null;

      // Check Seek Bar hit area
      const track = document.getElementById('progressTrack');
      const trackRect = track ? track.getBoundingClientRect() : null;

      // Check Subtitle Toolbar structure
      const toolbar = document.getElementById('subtitleToolbar');
      const leftGroup = document.querySelector('.toolbar-group.left');
      const rightGroup = document.querySelector('.toolbar-group.right');
      const setVoiceBtn = document.getElementById('setVoicePopoverBtn');
      const setVoicePopover = document.getElementById('setVoicePopover');
      const delBtn = document.getElementById('del');

      // Check Set Voice popover rows
      const mvRow = setVoicePopover ? setVoicePopover.querySelector('.set-voice-row:nth-child(1)') : null;
      const fvRow = setVoicePopover ? setVoicePopover.querySelector('.set-voice-row:nth-child(2)') : null;

      // Check for emoji in toolbar and workspace tools
      const emojiRegex = /[\\u{1F300}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]/u;
      const wsToolsHtml = document.querySelector('.workspace-tools')?.innerHTML || '';
      const hasWsEmoji = emojiRegex.test(wsToolsHtml);

      const headerHtml = document.querySelector('header')?.innerHTML || '';
      const hasHeaderEmoji = emojiRegex.test(headerHtml);

      return {
        body: bodyStyle,
        th: thStyle,
        tdTime: tdTimeStyle,
        tdTxt: tdTxtStyle,
        curTime: curTimeStyle,
        sliderOutput: slidersOutStyle,
        footer: footerStyle,
        edge: edgeStyle,
        rulerCorner: rulerCornerStyle,
        undoBtnSize: undoRect ? { width: undoRect.width, height: undoRect.height } : null,
        trackSize: trackRect ? { width: trackRect.width, height: trackRect.height } : null,
        toolbarExists: Boolean(toolbar),
        leftGroupItems: leftGroup ? leftGroup.children.length : 0,
        rightGroupItems: rightGroup ? rightGroup.children.length : 0,
        delIsDanger: delBtn ? delBtn.classList.contains('danger') : false,
        setVoicePopoverExists: Boolean(setVoicePopover),
        mvRowExists: Boolean(mvRow),
        fvRowExists: Boolean(fvRow),
        hasWsEmoji,
        hasHeaderEmoji
      };
    })()
  `);

  console.log('DOM & Typography Audit:', JSON.stringify(auditResults, null, 2));

  // Ensure Dark Theme is applied first
  await win.webContents.executeJavaScript(`
    (() => {
      window.__app.theme.applyTheme('dark');
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  // Populate sample rows to test full table rendering & contrast
  await win.webContents.executeJavaScript(`
    (() => {
      const mockRows = [
        { id: 1, s: 0.0, e: 3.5, t: 'សួស្តីអ្នកទាំងអស់គ្នា សូមស្វាគមន៍មកកាន់ភាគទី២', v: 0, sp: 1.3, ok: true, ck: false },
        { id: 2, s: 3.5, e: 7.02, t: 'តើអ្នកកំពុងធ្វើអ្វីនៅទីនេះ? សូមប្រាប់ខ្ញុំមក!', v: 1, sp: 1.0, ok: true, ck: false },
        { id: 3, s: 7.8, e: 9.08, t: 'តើយើងត្រូវទៅណាវិញ?', v: 2, sp: 1.0, ok: true, ck: false }
      ];
      window.__app.state.rows = mockRows;
      window.__app.state.selectedId = 1;
      window.__app.state.emit('change', { source: 'test' });
      if (window.__app.table) window.__app.table.render();
    })()
  `);

  await new Promise(r => setTimeout(r, 600));

  // Capture Dark Theme Screenshot at 1366px
  const darkShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase3-dark-theme-1366.png'), darkShot.toPNG());
  console.log('Captured phase3-dark-theme-1366.png');

  // Test Set Voice Popover Open
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('setVoicePopoverBtn');
      btn?.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 300));
  const popoverShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase3-set-voice-popover.png'), popoverShot.toPNG());
  console.log('Captured phase3-set-voice-popover.png');

  // Close Popover and switch to Light Theme
  await win.webContents.executeJavaScript(`
    (() => {
      const popover = document.getElementById('setVoicePopover');
      if (popover) popover.hidden = true;
      const themeBtn = document.getElementById('theme');
      themeBtn?.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  // Capture Light Theme Screenshot at 1366px
  const lightShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase3-light-theme-1366.png'), lightShot.toPNG());
  console.log('Captured phase3-light-theme-1366.png');

  // Test ResizeObserver on narrow width (e.g. 1024px)
  win.setSize(1024, 768);
  await new Promise(r => setTimeout(r, 600));

  const narrowCheck = await win.webContents.executeJavaScript(`
    (() => {
      const moreWrapper = document.getElementById('moreMenuWrapper');
      const moreDropdown = document.getElementById('moreMenuDropdown');
      const seriesInDropdown = moreDropdown ? Boolean(moreDropdown.querySelector('#series')) : false;
      return {
        moreWrapperHidden: moreWrapper ? moreWrapper.hidden : true,
        seriesInDropdown
      };
    })()
  `);
  console.log('Narrow Width ResizeObserver Check:', narrowCheck);

  const narrowShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase3-narrow-responsive.png'), narrowShot.toPNG());
  console.log('Captured phase3-narrow-responsive.png');

  console.log('=== PHASE 3 VERIFICATION COMPLETE ===');
  app.quit();
}

runVerification().catch(err => {
  console.error('Phase 3 verification error:', err);
  app.quit();
});
