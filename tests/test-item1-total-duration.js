// Test Item 1: Verification of TOTAL_DURATION removal and zero-video behavior
const { app, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert');
const fs = require('fs');

const profileDir = path.join(__dirname, '../audit/profile');
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
app.setPath('userData', profileDir);

const { registerIpcHandlers } = require('../src/main/ipc');
const projectService = require('../src/main/services/project');
const settingsService = require('../src/main/services/settings');
projectService.getUserDataDir = () => profileDir;
settingsService.getUserDataDir = () => profileDir;

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../src/preload/index.js')
      }
    });

    const caughtErrors = [];
    win.webContents.on('console-message', (e, level, msg) => {
      if (level >= 3) caughtErrors.push(msg);
    });

    registerIpcHandlers(win);
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await new Promise(r => setTimeout(r, 1200));

    console.log('--- 1. Testing Play and Scrubber disabled state on startup ---');
    const startupControls = await win.webContents.executeJavaScript(`
      (() => {
        const playBtn = document.getElementById('play');
        const progressTrack = document.getElementById('progressTrack');
        const stopBtn = document.getElementById('stop');
        return {
          playDisabled: playBtn.disabled,
          playTitle: playBtn.title,
          scrubberDisabledClass: progressTrack.classList.contains('disabled'),
          scrubberTitle: progressTrack.title,
          stopDisabled: stopBtn.disabled
        };
      })();
    `);
    console.log('Startup controls check:', startupControls);
    assert.strictEqual(startupControls.playDisabled, true, 'Play button must be disabled with no video loaded');
    assert.ok(startupControls.playTitle.includes('Load a video first') || startupControls.playTitle.includes('សូមបញ្ចូលវីដេអូជាមុនសិន'), 'Play button tooltip must ask to load video first');
    assert.strictEqual(startupControls.scrubberDisabledClass, true, 'Scrubber must have disabled class');

    console.log('--- 2. Clicking Play and Scrubber with NO video loaded (Must NEVER throw) ---');
    await win.webContents.executeJavaScript(`
      (() => {
        const playBtn = document.getElementById('play');
        playBtn.click();
        const progressTrack = document.getElementById('progressTrack');
        progressTrack.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
        progressTrack.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
        progressTrack.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      })();
    `);
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(caughtErrors.length, 0, `Errors thrown: ${caughtErrors.join(', ')}`);
    console.log('✓ Play and Scrubber clicked safely without errors.');

    console.log('--- 3. Testing "+ Add Text" button with NO video loaded ---');
    const addResult = await win.webContents.executeJavaScript(`
      (() => {
        const addBtn = document.getElementById('add');
        addBtn.click();
        const { state } = window.__app;
        return {
          rowCount: state.rows.length,
          firstRow: state.rows[0]
        };
      })();
    `);
    console.log('Add Text Result:', addResult);
    assert.strictEqual(addResult.rowCount, 1, 'Row count must be 1 after Add Text');
    assert.strictEqual(addResult.firstRow.s, 0, 'First row start must be 0');
    assert.strictEqual(addResult.firstRow.e, 3, 'First row end must be 3 (unclamped 3.0s duration)');

    console.log('--- 4. Testing Empty-State "+ Add Text" button ---');
    const emptyAddResult = await win.webContents.executeJavaScript(`
      (() => {
        const { state } = window.__app;
        state.rows = [];
        state.emit('change');
        const emptyBtnAdd = document.getElementById('emptyBtnAdd');
        emptyBtnAdd.click();
        return {
          rowCount: state.rows.length,
          firstRow: state.rows[0]
        };
      })();
    `);
    console.log('Empty State Add Text Result:', emptyAddResult);
    assert.strictEqual(emptyAddResult.rowCount, 1, 'Empty state button must create a row');
    assert.strictEqual(emptyAddResult.firstRow.s, 0, 'Start must be 0');
    assert.strictEqual(emptyAddResult.firstRow.e, 3, 'End must be 3');

    console.log('\n========================================');
    console.log('🎉 ALL ITEM 1 VERIFICATIONS PASSED!');
    console.log('========================================\n');

    win.destroy();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('Item 1 Test FAILED:', err);
    process.exit(1);
  }
});
