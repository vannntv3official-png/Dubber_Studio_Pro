// Verify Workflow & Empty State
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

async function runPhase2Verification() {
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

  const { registerIpcHandlers } = require('../src/main/ipc');
  registerIpcHandlers(win);

  const indexPath = path.join(__dirname, '../src/renderer/index.html');
  await win.loadFile(indexPath);
  await new Promise(r => setTimeout(r, 1000));

  console.log('=== WORKFLOW VERIFICATION START ===');

  // 1. Initial State Checks
  const initialChecks = await win.webContents.executeJavaScript(`
    (() => {
      const { workflow, state } = window.__app;
      const exportTop = document.getElementById('export');
      const stepperEl = document.getElementById('workflowStepper');

      return {
        stepperRemoved: stepperEl === null,
        exportDisabled: exportTop?.disabled,
        exportTitle: exportTop?.title,
        hasAudio: state.rows.some(r => r.ok),
        rowCount: state.rows.length
      };
    })()
  `);
  console.log('Initial Workflow Checks:', initialChecks);

  // 2. Test Empty State: Video Loaded, No Subtitles
  console.log('Testing Empty State: Video Loaded, No Subtitles...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { state, workflow } = window.__app;
      window.savedRowsBackup = [...state.rows];
      window.savedVideoBackup = state.project.videoFilePath;
      state.project.videoFilePath = 'C:/test/sample.mp4';
      state.rows = [];
      state.emit('change');
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const emptySubsCheck = await win.webContents.executeJavaScript(`
    (() => {
      const emptyState = document.getElementById('tableEmptyState');
      const table = document.querySelector('.scroll-table-container table');
      const title = document.getElementById('emptyTitle')?.textContent;
      const primaryBtn = document.getElementById('emptyBtnPrimary');
      const importBtn = document.getElementById('emptyBtnImport');
      const addBtn = document.getElementById('emptyBtnAdd');

      return {
        emptyStateHidden: emptyState?.hidden,
        tableDisplay: table ? window.getComputedStyle(table).display : '',
        title,
        primaryBtnText: primaryBtn?.textContent,
        importBtnHidden: importBtn?.hidden,
        addBtnHidden: addBtn?.hidden
      };
    })()
  `);
  console.log('Empty Subtitles (Video Loaded) Check:', emptySubsCheck);

  // 3. Test Empty State: No Video Loaded
  console.log('Testing Empty State: No Video...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { state, workflow } = window.__app;
      state.project.videoFilePath = null;
      state.thumbnails = [];
      state.rows = [];
      state.emit('change');
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const emptyVideoCheck = await win.webContents.executeJavaScript(`
    (() => {
      const title = document.getElementById('emptyTitle')?.textContent;
      const primaryBtn = document.getElementById('emptyBtnPrimary');
      const importBtn = document.getElementById('emptyBtnImport');

      return {
        title,
        primaryBtnText: primaryBtn?.textContent,
        importBtnHidden: importBtn?.hidden
      };
    })()
  `);
  console.log('Empty Video Check:', emptyVideoCheck);

  // Restore rows & video
  await win.webContents.executeJavaScript(`
    (() => {
      const { state, workflow } = window.__app;
      state.project.videoFilePath = window.savedVideoBackup;
      state.rows = window.savedRowsBackup;
      state.emit('change');
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  // 4. Test Workflow Live Progress Simulation
  console.log('Testing Workflow Live Progress Banner...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { workflow } = window.__app;
      workflow.showProgress('asr', 'Transcribing speech (Whisper ASR)...', 68, '00:12');
    })()
  `);
  await new Promise(r => setTimeout(r, 200));

  const progressCheck = await win.webContents.executeJavaScript(`
    (() => {
      const banner = document.getElementById('jobProgressBanner');
      const msg = document.getElementById('jobProgressMsg')?.textContent;
      const pct = document.getElementById('jobProgressPct')?.textContent;
      const fill = document.getElementById('jobProgressFill')?.style.width;

      return {
        bannerHidden: banner?.hidden,
        msg,
        pct,
        fillWidth: fill
      };
    })()
  `);
  console.log('Progress Banner Check:', progressCheck);

  // Hide progress
  await win.webContents.executeJavaScript(`
    (() => {
      const { workflow } = window.__app;
      workflow.hideProgress();
    })()
  `);

  // 5. Test Audio Generation Ready & Top Bar Export Enabled State
  console.log('Testing Audio Generated -> Export Enabled...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { state, workflow } = window.__app;
      state.rows[0].ok = true;
      state.emit('change');
    })()
  `);
  await new Promise(r => setTimeout(r, 200));

  const audioReadyCheck = await win.webContents.executeJavaScript(`
    (() => {
      const exportTop = document.getElementById('export');
      return {
        exportDisabled: exportTop?.disabled,
        exportTitle: exportTop?.title
      };
    })()
  `);
  console.log('Audio Ready -> Export Enabled Check:', audioReadyCheck);

  console.log('=== WORKFLOW VERIFICATION COMPLETE ===');
  win.close();
  process.exit(0);
}

app.whenReady().then(runPhase2Verification);
