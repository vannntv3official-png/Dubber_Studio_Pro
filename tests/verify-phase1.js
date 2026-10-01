const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function runPhase1Verification() {
  logger.init();
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
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

  console.log('=== PHASE 1 VERIFICATION START ===');

  const results = await win.webContents.executeJavaScript(`
    (() => {
      const data = {};

      // 1. Check Follow Playhead button
      const followBtn = document.getElementById('followPlayheadBtn');
      const followTxt = document.getElementById('followPlayheadTxt');
      data.followBtnExists = Boolean(followBtn);
      data.followBtnText = followTxt ? followTxt.textContent : '';
      data.followIsOn = followBtn ? followBtn.classList.contains('on') : false;

      // 2. Check Sticky Labels Column
      const labelsCol = document.getElementById('tlLabelsCol');
      const tracks = document.getElementById('tracks');
      data.labelsColExists = Boolean(labelsCol);
      data.labelsColSticky = labelsCol ? window.getComputedStyle(labelsCol).position : '';
      data.labelsColLeft = labelsCol ? window.getComputedStyle(labelsCol).left : '';
      data.labelsColWidth = labelsCol ? labelsCol.offsetWidth : 0;

      // Check track label names
      const trackLabels = Array.from(document.querySelectorAll('.tl-label-name')).map(el => el.textContent.trim());
      data.trackLabels = trackLabels;

      // 3. Check Edge Indicators exist
      const edgeLeft = document.getElementById('tlEdgeLeft');
      const edgeRight = document.getElementById('tlEdgeRight');
      data.edgeLeftExists = Boolean(edgeLeft);
      data.edgeRightExists = Boolean(edgeRight);

      // 4. Check Ruler mark intervals
      const marks = Array.from(document.querySelectorAll('.tl-ruler-mark'));
      data.rulerMarkCount = marks.length;

      return data;
    })()
  `);

  console.log('Initial Checks:', results);

  // Test Zoom in and Edge Indicator
  console.log('Testing Zoom and Edge Indicator...');
  const zoomTestResults = await win.webContents.executeJavaScript(`
    (async () => {
      const zoomSlider = document.getElementById('zoom');
      zoomSlider.value = '75';
      zoomSlider.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 150));

      const tracks = document.getElementById('tracks');
      // Scroll to the right so playhead (at ~14s) is offscreen to the left
      tracks.scrollLeft = 600;
      tracks.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 100));

      const edgeLeft = document.getElementById('tlEdgeLeft');
      const edgeRight = document.getElementById('tlEdgeRight');
      const followTxt = document.getElementById('followPlayheadTxt');
      const labels = document.getElementById('tlLabelsCol').getBoundingClientRect();
      const lanes = document.getElementById('tlLanesCol').getBoundingClientRect();

      return {
        scrollLeft: tracks.scrollLeft,
        edgeLeftHidden: edgeLeft.hidden,
        edgeLeftText: edgeLeft.textContent,
        edgeRightHidden: edgeRight.hidden,
        followPausedText: followTxt.textContent,
        labelsRect: { left: labels.left, width: labels.width },
        lanesRect: { left: lanes.left, width: lanes.width }
      };
    })()
  `);
  console.log('Zoom & Edge Indicator Results:', zoomTestResults);

  let img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase1-edge-indicator-scrolled.png'), img.toPNG());
  console.log('Captured phase1-edge-indicator-scrolled.png');

  // Test Clicking Edge Indicator to scroll to playhead
  console.log('Testing Edge Indicator Click...');
  const clickEdgeResults = await win.webContents.executeJavaScript(`
    (async () => {
      const edgeLeft = document.getElementById('tlEdgeLeft');
      edgeLeft.click();
      await new Promise(r => setTimeout(r, 400));

      const tracks = document.getElementById('tracks');
      return {
        newScrollLeft: tracks.scrollLeft,
        edgeLeftHiddenNow: edgeLeft.hidden
      };
    })()
  `);
  console.log('Click Edge Indicator Results:', clickEdgeResults);

  // Test Follow Playhead during playback
  console.log('Testing Follow Playhead auto-scroll...');
  const followTestResults = await win.webContents.executeJavaScript(`
    (async () => {
      const followBtn = document.getElementById('followPlayheadBtn');
      const { state, timeline } = window.__app;
      // Ensure follow is active and not paused
      state.timeline.followPlayhead = true;
      state.timeline.followPaused = false;
      timeline.updateFollowBtnState();

      // Zoom in to 80% so playhead advances offscreen quickly
      const zoomSlider = document.getElementById('zoom');
      zoomSlider.value = '80';
      zoomSlider.dispatchEvent(new Event('input'));

      // Position playhead near right edge of visible area
      const tracks = document.getElementById('tracks');
      const initialScroll = tracks.scrollLeft;

      // Advance playhead far forward
      state.setPlayhead(50);
      await new Promise(r => setTimeout(r, 200));

      return {
        initialScroll,
        autoScrolledTo: tracks.scrollLeft,
        playheadTime: state.timeline.playhead
      };
    })()
  `);
  console.log('Follow Playhead Auto-Scroll Results:', followTestResults);

  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase1-follow-playhead-active.png'), img.toPNG());
  console.log('Captured phase1-follow-playhead-active.png');

  // Test Empty Tracks rendering
  console.log('Testing Empty Tracks rendering...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { state } = window.__app;
      window.savedRowsBackup = [...state.rows];
      state.rows = [];
      state.emit('change');
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  const emptyTrackResults = await win.webContents.executeJavaScript(`
    (() => {
      const t1 = document.querySelector('.track[data-track="T1"]');
      const emptyLane = t1 ? t1.querySelector('.track-empty-lane') : null;
      const emptyHint = emptyLane ? emptyLane.querySelector('.track-empty-hint') : null;
      const stripedWaveform = t1 ? t1.querySelector('.track-waveform') : null;

      return {
        emptyLaneExists: Boolean(emptyLane),
        hintText: emptyHint ? emptyHint.textContent : '',
        stripedWaveformExists: Boolean(stripedWaveform)
      };
    })()
  `);
  console.log('Empty Track Results:', emptyTrackResults);

  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase1-empty-tracks.png'), img.toPNG());
  console.log('Captured phase1-empty-tracks.png');

  // Restore rows
  await win.webContents.executeJavaScript(`
    (() => {
      const { state } = window.__app;
      if (window.savedRowsBackup) {
        state.rows = window.savedRowsBackup;
        state.emit('change');
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  // Capture final full timeline view
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase1-verified-final.png'), img.toPNG());
  console.log('Captured phase1-verified-final.png');

  console.log('=== PHASE 1 VERIFICATION COMPLETE ===');
  win.close();
  process.exit(0);
}

app.whenReady().then(runPhase1Verification);
