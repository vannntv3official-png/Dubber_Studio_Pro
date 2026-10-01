/**
 * Milestone 6 (M6) Automated Verification Test
 * Tests:
 * 1. edge-tts / Mock TTS synthesis pipeline with voice presets A1–A5
 * 2. Settings Modal: Voice Presets tab, editable presets, sliders, and audio preview
 * 3. Batch Speech Synthesis ("Generate Selected Audio" / #gen)
 * 4. Audio caching (deterministic hash matching)
 * 5. Auto-Fit timing adjustment & slot duration comparison
 * 6. Overflow detection: warning icon ⚠️ in table and timeline .overflow-warning badge
 * 7. Per-clip audio preview playback in table
 * 8. High-resolution screenshots of the running app in M6
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');
const sidecarManager = require('../src/main/services/sidecar-manager');
const settingsService = require('../src/main/services/settings');

async function runM6Verification() {
  logger.init();
  console.log('--- Starting Milestone 6 Verification ---');

  // Configure settings to use mock ASR/TTS for offline test reliability
  settingsService.update({ asrEngine: 'mock', ttsEngine: 'mock' });

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
        const { table } = await import('./js/table.js');
        const { timeline } = await import('./js/timeline.js');
        const { ipcClient } = await import('./js/ipc-client.js');

        // Test 1: Load video project
        const sampleVideo = '${path.join(__dirname, '../test-assets/sample_10s.mp4').replace(/\\/g, '/')}';
        const importRes = await ipcClient.createProjectFromVideo(sampleVideo);
        if (!importRes.project) throw new Error('Video import failed');
        state.loadProjectData(importRes.project, importRes.peaks, importRes.thumbnails, sampleVideo);
        pass('Video Project Loaded', 'Duration: ' + state.project.duration + 's');

        // Populate translated Khmer rows with normal and tight duration slots
        state.rows = [
          { id: 1, s: 0.50, e: 2.80, t: 'សួស្តីបងប្អូនទាំងអស់គ្នា!', speaker: 'Speaker 1', gender: 'M', v: 0, sp: 1.0, ok: false, ck: false },
          { id: 2, s: 3.00, e: 5.50, t: 'សូមស្វាគមន៍មកកាន់ភាគថ្មីនៃរឿង!', speaker: 'Speaker 1', gender: 'M', v: 1, sp: 1.0, ok: false, ck: false },
          { id: 3, s: 5.80, e: 8.20, t: 'តើអ្នកបានត្រៀមខ្លួនរួចរាល់ហើយឬនៅ?', speaker: 'Speaker 2', gender: 'F', v: 2, sp: 1.0, ok: false, ck: false },
          // Row 4 has very long text in a tiny 1.0s slot -> forces overflow warning
          { id: 4, s: 8.50, e: 9.50, t: 'អត្ថបទនេះវែងណាស់សម្រាប់ពេលខ្លីមួយវិនាទីតែប៉ុណ្ណោះដែលនឹងបង្កឱ្យមានការហៀរពេល!', speaker: 'Speaker 2', gender: 'F', v: 4, sp: 1.0, ok: false, ck: false }
        ];
        state.emit('change', { source: 'initM6Rows' });

        // Test 2: Voice Presets in Settings Modal
        const settingsBtn = document.getElementById('settings');
        settingsBtn.click();
        await new Promise(r => setTimeout(r, 200));

        const tabVoiceBtn = document.getElementById('tabVoiceBtn');
        if (!tabVoiceBtn) throw new Error('tabVoiceBtn not found in Settings modal');
        tabVoiceBtn.click();
        await new Promise(r => setTimeout(r, 300));

        const tabVoiceContent = document.getElementById('tabVoiceContent');
        if (tabVoiceContent.hidden) throw new Error('Voice Presets tab content is not visible');

        const presetCards = tabVoiceContent.querySelectorAll('.preset-card');
        if (presetCards.length !== 5) {
          throw new Error('Expected 5 voice preset cards (A1-A5), found ' + presetCards.length);
        }
        pass('Settings Modal: Voice Presets Tab & Cards (A1-A5 Rendered)');

        // Test 3: Preset Slider & Value Interaction
        const cardA1 = presetCards[0];
        const rateInp = cardA1.querySelector('.preset-rate');
        const rateTxt = cardA1.querySelector('.rate-val');
        rateInp.value = '15';
        rateInp.dispatchEvent(new Event('input'));
        if (rateTxt.textContent !== '+15%') {
          throw new Error('Rate text did not update to +15%');
        }
        pass('Voice Preset Sliders & Value Formatting');

        // Test 4: Save Voice Presets Settings
        const asrSel = document.getElementById('asrEngineSelect');
        if (asrSel) asrSel.value = 'mock';

        const saveSettingsBtn = document.getElementById('settingsSaveBtn');
        saveSettingsBtn.click();
        await new Promise(r => setTimeout(r, 300));

        const updatedSettings = await ipcClient.getSettings();
        if (updatedSettings.voicePresets?.A1?.rate === '+15%') {
          pass('Save Voice Presets Configuration', 'A1 rate persisted: ' + updatedSettings.voicePresets.A1.rate);
        } else {
          fail('Save Voice Presets Configuration', 'Expected A1 rate +15%, got ' + updatedSettings.voicePresets?.A1?.rate);
        }

        // Test 5: Batch Speech Synthesis ("Generate Selected Audio")
        const genBtn = document.getElementById('gen');
        if (!genBtn) throw new Error('#gen button not found');
        genBtn.click();

        // Wait for generation to start and finish
        await new Promise(r => setTimeout(r, 200));
        let waited = 0;
        while (state.rows.some(r => r.generating) && waited < 8000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        await new Promise(r => setTimeout(r, 400));

        // Verify rows 1, 2, 3 have ok = true and audioPath
        const readyRows = state.rows.filter(r => r.ok && r.audioPath);
        if (readyRows.length >= 3) {
          pass('Batch Audio Synthesis (#gen)', readyRows.length + ' clips synthesized');
        } else {
          fail('Batch Audio Synthesis (#gen)', 'Only ' + readyRows.length + ' rows ready. Generating: ' + state.rows.filter(r => r.generating).length);
        }

        // Test 6: Auto-Fit Duration Comparison & Overflow Warning
        const row4 = state.rows.find(r => r.id === 4);
        if (row4 && row4.overflow) {
          pass('Auto-Fit & Overflow Detection', 'Row 4 overflowed slot by ' + row4.overflowDelta + 's');
        } else {
          fail('Auto-Fit & Overflow Detection', 'Row 4 did not trigger overflow warning: ' + JSON.stringify(row4));
        }

        // Test 7: Table UI Overflow Warning & Ready Icons
        const overflowBtn = document.querySelector('#rows tr[data-id="4"] .st.overflow');
        if (overflowBtn && overflowBtn.textContent.includes('⚠️')) {
          pass('Subtitle Table Status Display: Overflow ⚠️ Warning Rendered');
        } else {
          fail('Subtitle Table Status Display: Overflow ⚠️ Warning', 'Button not found or text mismatch');
        }

        const readyBtn = document.querySelector('#rows tr[data-id="1"] .st.ok');
        if (readyBtn && readyBtn.textContent.includes('🔊')) {
          pass('Subtitle Table Status Display: Ready 🔊 Icon Rendered');
        } else {
          fail('Subtitle Table Status Display: Ready 🔊 Icon', 'Button not found or text mismatch');
        }

        // Test 8: Timeline Clip Overflow Warning Badge
        const tlClip4 = document.querySelector('.clip[data-id="4"]');
        if (tlClip4 && tlClip4.classList.contains('overflow-warning')) {
          pass('Timeline T1 Clip Overflow Warning Badge & Border');
        } else {
          fail('Timeline T1 Clip Overflow Warning', 'Clip 4 does not have .overflow-warning');
        }

        // Test 9: Per-Clip Audio Preview Playback
        if (readyBtn) {
          readyBtn.click();
          pass('Per-Clip Audio Preview Playback Triggered');
        } else {
          fail('Per-Clip Audio Preview Playback', 'readyBtn element not found');
        }

        // Test 10: Audio Caching Mechanism
        const synthRes = await ipcClient.synthesizeBatch([state.rows[0]], {
          engine: 'mock',
          projectDir: state.project.dir
        });
        if (synthRes.results?.[0]?.cached) {
          pass('Audio Clip Caching (Deterministic Hash Hit)', 'Cached: true');
        } else {
          fail('Audio Clip Caching', 'Clip was not loaded from cache');
        }

      } catch (err) {
        fail('M6 Test Suite Execution', err);
      }

      return report;
    })();
  `);

  console.log('\n--- Milestone 6 Test Results ---');
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

  // Capture M6 main verified screenshot
  await new Promise(r => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  const screenshotPath = path.join(__dirname, 'm6-verified.png');
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`\nScreenshot saved: ${screenshotPath}`);

  // Capture Settings Modal Voice Presets tab screenshot
  await win.webContents.executeJavaScript(`
    document.getElementById('settings').click();
    document.getElementById('tabVoiceBtn').click();
  `);
  await new Promise(r => setTimeout(r, 400));
  const presetsImg = await win.webContents.capturePage();
  const presetsPath = path.join(__dirname, 'm6-voice-presets.png');
  fs.writeFileSync(presetsPath, presetsImg.toPNG());
  console.log(`Screenshot saved: ${presetsPath}`);

  sidecarManager.shutdown();
  win.close();

  if (failedCount > 0) {
    console.error(`\nFAILED: ${failedCount} tests failed in Milestone 6 verification.`);
    process.exit(1);
  } else {
    console.log(`\nSUCCESS: All ${passedCount} tests passed in Milestone 6 verification!`);
    process.exit(0);
  }
}

app.whenReady().then(runM6Verification);
