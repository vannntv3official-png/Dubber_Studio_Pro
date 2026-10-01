const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

// WCAG 2.1 Luminance and Contrast
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [255, 255, 255];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function getContrast(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function runTest() {
  logger.init();
  await app.whenReady();

  console.log('====================================================');
  console.log('STARTING PHASE 4 COMPREHENSIVE VERIFICATION & LEAK TEST');
  console.log('====================================================\n');

  let allPassed = true;
  const results = {};

  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
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
  await new Promise(r => setTimeout(r, 1200));

  // ── TEST 1: Status Bar Mojibake ──────────────────────────────
  const test1 = await win.webContents.executeJavaScript(`
    (() => {
      const keysTxt = document.getElementById('keysStatusTxt')?.textContent || '';
      const hasMojibake = /[ðŸâ€ÃÂ]/.test(keysTxt);
      const isClean = /Keys \\d+\\/\\d+/.test(keysTxt) || keysTxt === 'Keys 0/0';
      const keySvg = document.querySelector('#keysStatus svg');
      return { keysTxt, hasMojibake, isClean, hasSvg: Boolean(keySvg) };
    })()
  `);
  console.log('1. Status Bar Keys Mojibake Check:', test1);
  if (test1.hasMojibake || !test1.isClean || !test1.hasSvg) {
    console.error('FAIL: Test 1 failed!');
    allPassed = false;
  } else {
    console.log('PASS: Test 1 passed!\n');
  }
  results.mojibake = test1;

  // ── TEST 2: Zero-Segments Toolbar Buttons State ──────────────
  const test2 = await win.webContents.executeJavaScript(`
    (() => {
      // Temporarily empty rows to test zero-segments state
      const savedRows = [...window.state.rows];
      window.state.rows = [];
      window.state.emit('change', { source: 'testZeroSegments' });

      const edit = document.getElementById('edit');
      const del = document.getElementById('del');
      const fr = document.getElementById('fr');
      const series = document.getElementById('series');
      const vf = document.getElementById('vf');
      const cast = document.getElementById('cast');
      const setVoice = document.getElementById('setVoicePopoverBtn');
      const add = document.getElementById('add');

      const zeroState = {
        editDisabled: edit?.disabled,
        editTitle: edit?.title,
        delDisabled: del?.disabled,
        delTitle: del?.title,
        frDisabled: fr?.disabled,
        seriesDisabled: series?.disabled,
        vfDisabled: vf?.disabled,
        castDisabled: cast?.disabled,
        setVoiceDisabled: setVoice?.disabled,
        addDisabled: add?.disabled
      };

      // Restore saved rows
      window.state.rows = savedRows;
      window.state.emit('change', { source: 'testRestore' });

      return zeroState;
    })()
  `);
  console.log('2. Zero-Segments Toolbar State:', test2);
  const test2Pass = test2.editDisabled && test2.delDisabled && test2.frDisabled && 
                    test2.seriesDisabled && test2.vfDisabled && test2.castDisabled && 
                    test2.setVoiceDisabled && !test2.addDisabled;
  if (!test2Pass) {
    console.error('FAIL: Test 2 failed!');
    allPassed = false;
  } else {
    console.log('PASS: Test 2 passed!\n');
  }
  results.zeroSegments = test2;

  // ── TEST 3: Emoji Audit in Main Window ───────────────────────
  const test3 = await win.webContents.executeJavaScript(`
    (() => {
      const emojiRegex = /[\\u{1F300}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}\\u{1F600}-\\u{1F64F}]/u;
      const issues = [];

      // Check empty state
      const emptyIconTxt = document.getElementById('emptyIcon')?.textContent?.trim() || '';
      if (emojiRegex.test(emptyIconTxt)) issues.push('emptyIcon has emoji: ' + emptyIconTxt);

      const emptyButtons = Array.from(document.querySelectorAll('#emptyActions button')).map(b => b.textContent);
      emptyButtons.forEach(txt => {
        if (emojiRegex.test(txt)) issues.push('emptyAction button has emoji: ' + txt);
      });

      // Check track label icons
      const trackIcons = Array.from(document.querySelectorAll('.tl-label-icon')).map(i => i.textContent?.trim());
      trackIcons.forEach((txt, idx) => {
        if (emojiRegex.test(txt)) issues.push('tl-label-icon has emoji: ' + txt);
      });

      // Check file-info
      const fileInfoTxt = document.querySelector('.file-info')?.textContent || '';
      if (emojiRegex.test(fileInfoTxt)) issues.push('file-info has emoji: ' + fileInfoTxt);

      return { issues, clean: issues.length === 0 };
    })()
  `);
  console.log('3. Emoji Audit Check:', test3);
  if (!test3.clean) {
    console.error('FAIL: Test 3 failed! Remaining emojis:', test3.issues);
    allPassed = false;
  } else {
    console.log('PASS: Test 3 passed! All targeted controls use clean SVGs.\n');
  }
  results.emojiAudit = test3;

  // ── TEST 4: Stepper Removal & Workflow Progress Banner ───────
  const test4 = await win.webContents.executeJavaScript(`
    (() => {
      const stepperEl = document.getElementById('workflowStepper');
      const stepItems = document.querySelectorAll('.step-item');
      const banner = document.getElementById('jobProgressBanner');
      const bannerMsg = document.getElementById('jobProgressMsg');
      const bannerPct = document.getElementById('jobProgressPct');
      const bannerFill = document.getElementById('jobProgressFill');
      const cancelBtn = document.getElementById('jobCancelBtn');

      const { workflow, state } = window.__app;

      // 1. Verify stepper is removed
      const stepperRemoved = (stepperEl === null) && (stepItems.length === 0);

      // 2. Verify banner exists and starts hidden
      const bannerExists = Boolean(banner && bannerMsg && bannerPct && bannerFill && cancelBtn);
      const initiallyHidden = banner ? banner.hidden : false;

      // 3. Test workflow primary button hierarchy
      // State A: 0 segments -> Transcribe should be primary
      state.rows = [];
      workflow.update();
      const transPrimaryA = document.getElementById('trans')?.classList.contains('primary');
      const exportDisabledA = document.getElementById('export')?.disabled;

      // State B: segments exist but not translated -> Translate should be primary
      state.rows = [{ id: 1, s: 0, e: 2, c: 'Source text', t: '' }];
      workflow.update();
      const translatePrimaryB = document.getElementById('translateBtn')?.classList.contains('primary');

      // State C: segments translated -> Generate Audio should be primary
      state.rows = [{ id: 1, s: 0, e: 2, c: 'Source text', t: 'អត្ថបទ', ok: false }];
      workflow.update();
      const genPrimaryC = document.getElementById('gen')?.classList.contains('primary');
      const exportDisabledC = document.getElementById('export')?.disabled;

      // State D: audio ready -> Export should be primary and enabled
      state.rows = [{ id: 1, s: 0, e: 2, c: 'Source text', t: 'អត្ថបទ', ok: true }];
      workflow.update();
      const exportPrimaryD = document.getElementById('export')?.classList.contains('primary');
      const exportEnabledD = !(document.getElementById('export')?.disabled);

      // Restore rows to no-audio state so export button is disabled for remaining tests
      state.rows = [{ id: 1, s: 0, e: 2, c: 'Source text', t: 'អត្ថបទ', ok: false }];
      workflow.update();

      // 4. Test live progress banner show and hide
      workflow.showProgress('asr', 'Transcribing speech (Whisper ASR)...', 65, '00:10');
      const bannerVisibleDuringJob = !banner.hidden;
      const bannerMsgDuringJob = bannerMsg.textContent;
      const bannerPctDuringJob = bannerPct.textContent;
      const bannerWidthDuringJob = bannerFill.style.width;

      workflow.hideProgress();
      const bannerHiddenAfterJob = banner.hidden;

      return {
        stepperRemoved,
        bannerExists,
        initiallyHidden,
        transPrimaryA,
        exportDisabledA,
        translatePrimaryB,
        genPrimaryC,
        exportDisabledC,
        exportPrimaryD,
        exportEnabledD,
        bannerVisibleDuringJob,
        bannerMsgDuringJob,
        bannerPctDuringJob,
        bannerWidthDuringJob,
        bannerHiddenAfterJob
      };
    })()
  `);
  console.log('4. Stepper Removal & Workflow Progress Banner:', test4);
  const test4Passed = test4.stepperRemoved &&
    test4.bannerExists &&
    test4.initiallyHidden &&
    test4.transPrimaryA &&
    test4.exportDisabledA &&
    test4.translatePrimaryB &&
    test4.genPrimaryC &&
    test4.exportDisabledC &&
    test4.exportPrimaryD &&
    test4.exportEnabledD &&
    test4.bannerVisibleDuringJob &&
    test4.bannerHiddenAfterJob;

  if (!test4Passed) {
    console.error('FAIL: Test 4 failed!', test4);
    allPassed = false;
  } else {
    console.log('PASS: Test 4 passed! Stepper completely removed, workflow banner and primary logic work perfectly.\n');
  }
  results.workflow = test4;

  // ── TEST 5: Centered Lane Hints & Sticky V1 Pill ─────────────
  const test5 = await win.webContents.executeJavaScript(`
    (() => {
      const emptyLane = document.querySelector('.track-empty-lane');
      const emptyHint = document.querySelector('.track-empty-hint');
      const v1Clip = document.querySelector('.clip[data-track="V1"]');
      const v1Pill = document.querySelector('.v1-range-pill');

      const laneStyle = emptyLane ? window.getComputedStyle(emptyLane) : null;
      const hintStyle = emptyHint ? window.getComputedStyle(emptyHint) : null;
      const pillStyle = v1Pill ? window.getComputedStyle(v1Pill) : null;

      return {
        laneSticky: laneStyle?.position === 'sticky',
        laneCentered: laneStyle?.justifyContent === 'center',
        hintBackground: hintStyle?.backgroundColor,
        pillSticky: pillStyle?.position === 'sticky',
        pillLeft: pillStyle?.left,
        pillBackground: pillStyle?.backgroundColor
      };
    })()
  `);
  console.log('5. Centered Lane Hints & Sticky V1 Pill:', test5);
  if (!test5.laneSticky || !test5.laneCentered || !test5.pillSticky) {
    console.error('FAIL: Test 5 failed!');
    allPassed = false;
  } else {
    console.log('PASS: Test 5 passed!\n');
  }
  results.laneHints = test5;

  // ── TEST 6: Light Theme Surface Harmonization ────────────────
  const test6 = await win.webContents.executeJavaScript(`
    (() => {
      document.body.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');

      const tableContainer = document.querySelector('.scroll-table-container');
      const tlTracks = document.querySelector('.tl-tracks');
      const emptyHint = document.querySelector('.track-empty-hint');

      const tableBg = window.getComputedStyle(tableContainer).backgroundColor;
      const tlBg = window.getComputedStyle(tlTracks).backgroundColor;
      const hintColor = emptyHint ? window.getComputedStyle(emptyHint).color : '';
      const hintBg = emptyHint ? window.getComputedStyle(emptyHint).backgroundColor : '';

      return {
        tableBg,
        tlBg,
        hintColor,
        hintBg
      };
    })()
  `);
  const hintContrast = getContrast(parseRgb(test6.hintColor), parseRgb(test6.hintBg));
  console.log('6. Light Theme Surface Harmonization:', {
    tableContainerBg: test6.tableBg,
    tlTracksBg: test6.tlBg,
    hintTextContrast: hintContrast.toFixed(2) + ' : 1'
  });
  if (hintContrast < 4.5) {
    console.error('FAIL: Test 6 failed! Hint contrast < 4.5:1: ' + hintContrast);
    allPassed = false;
  } else {
    console.log('PASS: Test 6 passed!\n');
  }
  results.surfaces = { ...test6, hintContrast };

  // ── TEST 7: Disabled Controls Visibility & Border ─────────────
  const test7 = await win.webContents.executeJavaScript(`
    (() => {
      // Test dark theme first
      document.body.classList.remove('light');
      delete document.documentElement.dataset.theme;
      document.documentElement.removeAttribute('data-theme');

      const undo = document.getElementById('undo');
      const redo = document.getElementById('redo');
      const exp = document.getElementById('export');
      const stripBtn = document.querySelector('.icons-toolbar button.btn.ic:disabled');

      const undoStyle = window.getComputedStyle(undo);
      const expStyle = window.getComputedStyle(exp);
      const stripStyle = window.getComputedStyle(stripBtn);

      return {
        undoOpacity: undoStyle.opacity,
        undoBorder: undoStyle.borderColor,
        undoTitle: undo.title,
        redoTitle: redo.title,
        expOpacity: expStyle.opacity,
        expBorder: expStyle.borderColor,
        expTitle: exp.title,
        stripOpacity: stripStyle.opacity,
        stripBorder: stripStyle.borderColor,
        stripTitle: stripBtn?.title
      };
    })()
  `);
  console.log('7. Disabled Controls in Dark Theme:', test7);
  const undoOp = parseFloat(test7.undoOpacity);
  const expOp = parseFloat(test7.expOpacity);
  const stripOp = parseFloat(test7.stripOpacity);
  const test7Pass = undoOp >= 0.50 && undoOp <= 0.60 &&
                    expOp >= 0.50 && expOp <= 0.60 &&
                    stripOp >= 0.50 && stripOp <= 0.60 &&
                    test7.undoTitle.length > 5 &&
                    test7.expTitle.length > 5;
  if (!test7Pass) {
    console.error('FAIL: Test 7 failed!');
    allPassed = false;
  } else {
    console.log('PASS: Test 7 passed!\n');
  }
  results.disabledControls = test7;

  // ── TEST 8: Memory Leak Test (5 Videos, 50x Zoom, 20x Play) ───
  console.log('Starting memory stress & leak test...');
  const memBefore = await win.webContents.executeJavaScript(`
    (() => {
      const pMem = performance.memory ? {
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)),
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / (1024 * 1024))
      } : { usedJSHeapSize: 0, totalJSHeapSize: 0 };
      return pMem;
    })()
  `);
  const procMemBefore = process.memoryUsage();

  // Run stress operations:
  await win.webContents.executeJavaScript(`
    (async () => {
      // 1. Simulate loading 5 different project states
      for (let p = 1; p <= 5; p++) {
        const mockRows = Array.from({ length: 40 }, (_, i) => ({
          id: i + 1,
          s: i * 3.5,
          e: (i + 1) * 3.5,
          t: 'Segment ' + (i + 1) + ' of Project ' + p + ' [Subtitle Content]',
          v: i % 5,
          sp: 1.0,
          ok: i % 2 === 0,
          ck: false
        }));
        window.state.loadProjectData(
          { name: 'Stress_Proj_' + p, duration: 180, filename: 'Stress_Video_' + p + '.mp4' },
          [0.1, 0.4, 0.8, 0.2, 0.5],
          [],
          'Stress_Proj_' + p + '.json',
          'C:/mock'
        );
        window.state.rows = mockRows;
        window.state.emit('change', { source: 'stressTest' });
        await new Promise(r => setTimeout(r, 40));
      }

      // 2. Zoom timeline in and out 50 times
      const zoomSlider = document.getElementById('zoomSlider');
      for (let z = 0; z < 50; z++) {
        const val = (z % 2 === 0) ? 80 : 10;
        if (zoomSlider) {
          zoomSlider.value = val;
          zoomSlider.dispatchEvent(new Event('input'));
        }
      }

      // 3. Play and stop 20 times
      for (let pl = 0; pl < 20; pl++) {
        window.state.timeline.isPlaying = (pl % 2 === 1);
        window.state.setPlayhead(pl * 2.5);
        window.state.emit('playheadChange', pl * 2.5);
      }
      window.state.timeline.isPlaying = false;
      window.state.setPlayhead(0);
      window.state.emit('playheadChange', 0);
    })()
  `);

  await new Promise(r => setTimeout(r, 800));

  const memAfter = await win.webContents.executeJavaScript(`
    (() => {
      return performance.memory ? {
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)),
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / (1024 * 1024))
      } : { usedJSHeapSize: 0, totalJSHeapSize: 0 };
    })()
  `);
  const procMemAfter = process.memoryUsage();

  const rssDeltaMb = Math.round((procMemAfter.rss - procMemBefore.rss) / (1024 * 1024));
  const heapDeltaMb = memAfter.usedJSHeapSize - memBefore.usedJSHeapSize;

  console.log('8. Memory Stress & Leak Test Results:');
  console.log('   - Initial Heap:', memBefore.usedJSHeapSize, 'MB | Post-Stress Heap:', memAfter.usedJSHeapSize, 'MB (Delta:', heapDeltaMb, 'MB)');
  console.log('   - Process RSS Before:', Math.round(procMemBefore.rss / (1024*1024)), 'MB | After:', Math.round(procMemAfter.rss / (1024*1024)), 'MB (Delta:', rssDeltaMb, 'MB)');
  
  // Leak assertion: delta heap should remain bounded (< 35 MB after 5 loads and 50 zooms)
  const leakFree = heapDeltaMb < 35;
  if (!leakFree) {
    console.error('FAIL: Memory heap grew excessively: ' + heapDeltaMb + ' MB');
    allPassed = false;
  } else {
    console.log('PASS: Memory test passed! No memory leak detected.\n');
  }
  results.memory = { memBefore, memAfter, heapDeltaMb, rssDeltaMb, leakFree };

  // ── SCREENSHOT CAPTURES (Dark and Light themes) ────────────────
  const artifactDir = path.resolve('C:/Users/kongv/.gemini/antigravity/brain/3242702f-4c2a-4840-8e28-f47de8585610');
  
  // Dark Theme Screenshot (with empty subtitles)
  await win.webContents.executeJavaScript(`
    document.body.classList.remove('light');
    delete document.documentElement.dataset.theme;
    document.documentElement.removeAttribute('data-theme');
    window.state.rows = [];
    window.state.emit('change', { source: 'screenshotEmpty' });
  `);
  await new Promise(r => setTimeout(r, 600));
  const darkImage = await win.capturePage();
  const darkPath = path.join(artifactDir, 'phase4_polished_dark.png');
  fs.writeFileSync(darkPath, darkImage.toPNG());
  console.log('Saved Dark Mode Screenshot:', darkPath);

  // Light Theme Screenshot (with empty subtitles)
  await win.webContents.executeJavaScript(`
    document.body.classList.add('light');
    document.documentElement.setAttribute('data-theme', 'light');
    window.state.rows = [];
    window.state.emit('change', { source: 'screenshotEmpty' });
  `);
  await new Promise(r => setTimeout(r, 600));
  const lightImage = await win.capturePage();
  const lightPath = path.join(artifactDir, 'phase4_polished_light.png');
  fs.writeFileSync(lightPath, lightImage.toPNG());
  console.log('Saved Light Mode Screenshot:', lightPath);

  console.log('\n====================================================');
  console.log('OVERALL TEST SUITE RESULT:', allPassed ? 'ALL PASSED ✓' : 'SOME TESTS FAILED ✗');
  console.log('====================================================');

  fs.writeFileSync(path.join(artifactDir, 'phase4_results.json'), JSON.stringify(results, null, 2));

  win.close();
  app.quit();
}

runTest().catch(err => {
  console.error('Test execution error:', err);
  app.quit();
});
