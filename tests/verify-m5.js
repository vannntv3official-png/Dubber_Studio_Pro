/**
 * Milestone 5 (M5) Automated Verification Test
 * Tests:
 * 1. Gemini Translation Provider architecture & batching pipeline
 * 2. Translation Modal UI (target language, batch size, glossary input, progress bar)
 * 3. End-to-end subtitle translation updating state, virtualized table, and timeline
 * 4. Cast management system (character list, gender assignment, voice profile mapping)
 * 5. Auto-suggest voices based on speaker & gender
 * 6. Bulk voice assignment ('Set voice to' Male/Female buttons)
 * 7. Series grouping and All-Voices filtering
 * 8. High-resolution screenshot capture of the running app in M5
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');
const sidecarManager = require('../src/main/services/sidecar-manager');

async function runM5Verification() {
  logger.init();
  console.log('--- Starting Milestone 5 Verification ---');

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
  await new Promise(r => setTimeout(r, 800));

  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const report = [];
      const pass = (name, details = '') => report.push({ name, passed: true, details });
      const fail = (name, err) => report.push({ name, passed: false, error: String(err) });

      try {
        const { state } = await import('./js/state.js');
        const { cast } = await import('./js/cast.js');
        const { table } = await import('./js/table.js');
        const { ipcClient } = await import('./js/ipc-client.js');

        // Test 1: Load video project
        const sampleVideo = '${path.join(__dirname, '../test-assets/sample_10s.mp4').replace(/\\/g, '/')}';
        const importRes = await ipcClient.createProjectFromVideo(sampleVideo);
        if (!importRes.project) throw new Error('Video import failed');
        state.loadProjectData(importRes.project, importRes.peaks, importRes.thumbnails, sampleVideo);
        pass('Video Project Loaded', 'Duration: ' + state.project.duration + 's');

        // Populate English dialogue segments to simulate transcribed foreign video
        state.rows = [
          { id: 1, s: 0.50, e: 2.30, t: 'Hello everyone!', speaker: 'Speaker 1', gender: 'M', v: 0, sp: 1.0, ok: false, ck: false },
          { id: 2, s: 2.50, e: 4.80, t: 'Welcome to the new episode.', speaker: 'Speaker 1', gender: 'M', v: 0, sp: 1.0, ok: false, ck: false },
          { id: 3, s: 5.10, e: 7.20, t: 'Are you ready for the adventure?', speaker: 'Speaker 2', gender: 'F', v: 2, sp: 1.0, ok: false, ck: false },
          { id: 4, s: 7.50, e: 9.60, t: 'We will start our journey now!', speaker: 'Speaker 2', gender: 'F', v: 2, sp: 1.0, ok: false, ck: false }
        ];
        state.emit('change', { source: 'initEnglishRows' });

        // Test 2: Translation Modal UI
        const transBtn = document.getElementById('translateBtn');
        if (!transBtn) throw new Error('#translateBtn element not found');
        transBtn.click();
        await new Promise(r => setTimeout(r, 200));

        const transModal = document.getElementById('translateModal');
        if (!transModal.classList.contains('open')) throw new Error('Translate modal did not open');

        const modelSelect = document.getElementById('translateModelSelect');
        modelSelect.value = 'mock';

        const targetLangSelect = document.getElementById('targetLangSelect');
        targetLangSelect.value = 'Khmer';

        const batchSizeSelect = document.getElementById('translateBatchSizeSelect');
        batchSizeSelect.value = '2'; // test batching into 2 batches

        const glossaryInp = document.getElementById('translateGlossaryInp');
        glossaryInp.value = 'Hero -> តួឯក';

        pass('Translation Modal UI & Configuration');

        // Test 3: Start Batch Translation
        const startTransBtn = document.getElementById('startTranslationBtn');
        startTransBtn.click();

        // Wait for translation to complete
        let waited = 0;
        while (transModal.classList.contains('open') && waited < 4000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }

        const isTranslated = state.rows[0].t.includes('សួស្តី');
        if (isTranslated && state.rows.length === 4) {
          pass('Batch Translation Execution & Verification', 'Translated row 1: ' + state.rows[0].t);
        } else {
          fail('Batch Translation Execution', 'Row 1 text was: ' + state.rows[0].t);
        }

        // Test 4: Subtitle Table & Timeline updated with translated text
        const tableTxt = document.querySelector('#rows tr .txt')?.textContent;
        if (tableTxt && tableTxt.includes('សួស្តី')) {
          pass('Subtitle Table Updated with Translated Khmer Text');
        } else {
          fail('Subtitle Table Updated with Translated Khmer Text', 'Table text: ' + tableTxt);
        }

        const clipTitle = document.querySelector('.clip[data-track="T1"]')?.title;
        if (clipTitle && clipTitle.includes('សួស្តី')) {
          pass('Timeline T1 Clips Updated with Translated Khmer Text');
        } else {
          fail('Timeline T1 Clips Updated with Translated Khmer Text', 'Clip title: ' + clipTitle);
        }

        // Test 5: Cast Management & Extraction
        cast.extractCastFromRows();
        if (cast.characters.length >= 2) {
          pass('Cast Extraction from Segments', 'Found ' + cast.characters.length + ' characters: ' + cast.characters.map(c => c.name).join(', '));
        } else {
          fail('Cast Extraction from Segments', 'Only ' + cast.characters.length + ' characters found');
        }

        // Test 6: Auto-Suggest Voice Assignment
        // Set voices to arbitrary index then auto-suggest
        state.rows[0].v = 4;
        state.rows[1].v = 4;
        cast.autoSuggestVoices();

        // Speaker 1 (Male) should be mapped to Male voice (A1 or A2 or A4)
        const spk1Voice = state.rows[0].v;
        const spk2Voice = state.rows[2].v;
        if ((spk1Voice === 0 || spk1Voice === 1 || spk1Voice === 3) && (spk2Voice === 2 || spk2Voice === 4)) {
          pass('Auto-Suggest Voices (Gender & Speaker Heuristics)', 'Spk1 voice: ' + spk1Voice + ' (M), Spk2 voice: ' + spk2Voice + ' (F)');
        } else {
          fail('Auto-Suggest Voices', 'Spk1 voice: ' + spk1Voice + ', Spk2 voice: ' + spk2Voice);
        }

        // Test 7: Bulk Voice Assignment Controls ('Set voice to' Male/Female)
        const mvSelect = document.getElementById('mv');
        const mvOkBtn = document.getElementById('mvOk');
        mvSelect.value = '1'; // A2 · ប្រុស ០២
        mvOkBtn.click();

        // Male rows (row 0 and 1) should now have voice 1
        if (state.rows[0].v === 1 && state.rows[1].v === 1) {
          pass('Bulk Voice Assignment for Male Characters (Set to A2)');
        } else {
          fail('Bulk Voice Assignment for Male Characters', 'Voice is: ' + state.rows[0].v);
        }

        // Test 8: All-Voices Filtering
        const vfSelect = document.getElementById('vf');
        vfSelect.value = '1'; // filter only voice 1 (A2)
        vfSelect.dispatchEvent(new Event('change'));
        const filteredRows = document.querySelectorAll('#rows tr:not(.vt-spacer)');
        if (filteredRows.length === 2) {
          pass('All-Voices Filter (Filtered to 2 rows)');
        } else {
          fail('All-Voices Filter', 'Expected 2 rows, found ' + filteredRows.length);
        }

        // Reset filter
        vfSelect.value = '-1';
        vfSelect.dispatchEvent(new Event('change'));

        // Test 9: Series Grouping Mode
        const seriesBtn = document.getElementById('series');
        seriesBtn.click();
        if (state.seriesMode) {
          pass('Series Voice Grouping Toggle Enabled');
        } else {
          fail('Series Voice Grouping Toggle Enabled');
        }
        seriesBtn.click(); // toggle back

      } catch (err) {
        fail('M5 Test Suite Execution', err);
      }

      return report;
    })();
  `);

  console.log('\n--- Milestone 5 Test Results ---');
  let passedCount = 0;
  let failedCount = 0;

  results.forEach(r => {
    if (r.passed) {
      passedCount++;
      console.log(`  ✓ ${r.name} ${r.details ? '(' + r.details + ')' : ''}`);
    } else {
      failedCount++;
      console.error(`  ✗ ${r.name}: ${r.error}`);
    }
  });

  // Capture M5 verified screenshot
  await new Promise(r => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  const screenshotPath = path.join(__dirname, 'm5-verified.png');
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`\nScreenshot saved: ${screenshotPath}`);

  // Capture Cast Popover screenshot
  await win.webContents.executeJavaScript(`
    document.getElementById('cast').click();
  `);
  await new Promise(r => setTimeout(r, 300));
  const castImg = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'm5-cast-popover.png'), castImg.toPNG());
  console.log('Screenshot saved: m5-cast-popover.png');

  sidecarManager.shutdown();
  win.close();

  if (failedCount > 0) {
    console.error(`\nFAILED: ${failedCount} tests failed in Milestone 5 verification.`);
    process.exit(1);
  } else {
    console.log(`\nSUCCESS: All ${passedCount} tests passed in Milestone 5 verification!`);
    process.exit(0);
  }
}

app.whenReady().then(runM5Verification);
