const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

// Luminance and Contrast Ratio Calculation according to WCAG 2.1
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

async function runVerification() {
  logger.init();
  await app.whenReady();

  console.log('====================================================');
  console.log('STARTING TIMELINE COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  let allPassed = true;

  // Single persistent window for tests
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

  // Test across resolutions: 1366x768 and 1920x1080
  const resolutions = [
    { width: 1366, height: 768, name: '768p' },
    { width: 1920, height: 1080, name: '1080p' }
  ];

  for (const res of resolutions) {
    console.log(`\n>>> TESTING RESOLUTION: ${res.width}x${res.height} (${res.name}) <<<`);
    win.setSize(res.width, res.height);
    await new Promise(r => setTimeout(r, 400));

    // Test at Zoom Min and Zoom Max
    const zoomLevels = ['min', 'max'];
    for (const zoomMode of zoomLevels) {
      console.log(`  --- Zoom Mode: ${zoomMode} ---`);
      const testResult = await win.webContents.executeJavaScript(`
        (async () => {
          const zoomSlider = document.getElementById('zoom');
          if (zoomSlider) {
            zoomSlider.value = '${zoomMode === 'min' ? '0' : '100'}';
            zoomSlider.dispatchEvent(new Event('input'));
          }
          await new Promise(r => setTimeout(r, 150));

          const labelsCol = document.getElementById('tlLabelsCol');
          const lanesCol = document.getElementById('tlLanesCol');
          const tracksContainer = document.getElementById('tracks');

          const labels = Array.from(labelsCol ? labelsCol.querySelectorAll('.tl-label-cell') : []).map(el => {
            const rect = el.getBoundingClientRect();
            return {
              text: el.textContent.trim().replace(/\\s+/g, ' '),
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height
            };
          });

          const lanes = Array.from(tracksContainer ? tracksContainer.querySelectorAll('.tl-ruler, .track') : []).map(el => {
            const rect = el.getBoundingClientRect();
            return {
              track: el.dataset.track || 'ruler',
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height
            };
          });

          const containerRect = tracksContainer.getBoundingClientRect();
          const bgmLane = tracksContainer.querySelector('.track[data-track="A2"]');
          const bgmRect = bgmLane ? bgmLane.getBoundingClientRect() : null;

          return {
            labels,
            lanes,
            containerRect: {
              top: containerRect.top,
              bottom: containerRect.bottom,
              height: containerRect.height
            },
            bgmRect: bgmRect ? {
              top: bgmRect.top,
              bottom: bgmRect.bottom,
              height: bgmRect.height
            } : null
          };
        })()
      `);

      // 1. Verify label.top == lane.top and label.height == lane.height (within 1px)
      const count = Math.min(testResult.labels.length, testResult.lanes.length);
      if (count < 6) {
        console.error(`  [FAIL] Expected at least 6 rows (ruler + 5 lanes), got labels: ${testResult.labels.length}, lanes: ${testResult.lanes.length}`);
        allPassed = false;
      }

      for (let i = 0; i < count; i++) {
        const lbl = testResult.labels[i];
        const lane = testResult.lanes[i];
        const topDiff = Math.abs(lbl.top - lane.top);
        const heightDiff = Math.abs(lbl.height - lane.height);

        const okTop = topDiff <= 1.0;
        const okHeight = heightDiff <= 1.0;

        if (okTop && okHeight) {
          console.log(`    [PASS] Row ${i} (${lane.track}): top match (diff: ${topDiff.toFixed(2)}px), height match (diff: ${heightDiff.toFixed(2)}px)`);
        } else {
          console.error(`    [FAIL] Row ${i} (${lane.track}): topDiff=${topDiff.toFixed(2)}px, heightDiff=${heightDiff.toFixed(2)}px`);
          allPassed = false;
        }
      }

      // 2. Verify BGM lane bottom is strictly inside container
      if (testResult.bgmRect && testResult.containerRect) {
        const bgmFits = testResult.bgmRect.bottom <= testResult.containerRect.bottom + 0.5;
        const margin = (testResult.containerRect.bottom - testResult.bgmRect.bottom).toFixed(1);
        if (bgmFits) {
          console.log(`    [PASS] BGM lane fits inside container without clipping (clearance: ${margin}px)`);
        } else {
          console.error(`    [FAIL] BGM lane exceeds container bottom! bgmBottom=${testResult.bgmRect.bottom}, containerBottom=${testResult.containerRect.bottom}`);
          allPassed = false;
        }
      }
    }
  }

  // 3. Test Slider Contrast in Light Theme & Workflow Primary Button Logic
  console.log('\n>>> TESTING LIGHT THEME SLIDER CONTRAST & WORKFLOW BUTTON STATE <<<');
  win.setSize(1366, 768);
  await new Promise(r => setTimeout(r, 300));

  const uiChecks = await win.webContents.executeJavaScript(`
    (() => {
      // Set to light theme
      document.documentElement.dataset.theme = 'light';

      const panel = document.getElementById('timelinePanel');
      const panelBg = window.getComputedStyle(panel).backgroundColor;

      const sliders = Array.from(document.querySelectorAll('.sliders input[type="range"], #zoom')).map(s => {
        const cs = window.getComputedStyle(s);
        return {
          id: s.id,
          border: cs.border,
          borderColor: cs.borderColor,
          backgroundColor: cs.backgroundColor
        };
      });

      // Workflow button check
      const transBtn = document.getElementById('trans');
      const translateBtn = document.getElementById('translateBtn');
      const genBtn = document.getElementById('gen');
      const exportBtn = document.getElementById('export');

      return {
        panelBg,
        sliders,
        transPrimary: transBtn?.classList.contains('primary') || false,
        translatePrimary: translateBtn?.classList.contains('primary') || false,
        genPrimary: genBtn?.classList.contains('primary') || false,
        exportPrimary: exportBtn?.classList.contains('primary') || false,
        rowsLength: window.state ? window.state.rows.length : 0,
        rowsTranslated: window.state ? window.state.rows.every(r => r.t && r.t.length > 0) : false
      };
    })()
  `);

  console.log('Panel Background:', uiChecks.panelBg);
  const panelRgb = parseRgb(uiChecks.panelBg);

  // Check contrast of each slider track
  for (const s of uiChecks.sliders) {
    const borderRgb = parseRgb(s.borderColor);
    const contrast = getContrast(panelRgb, borderRgb);
    const passContrast = contrast >= 3.0;
    if (passContrast) {
      console.log(`  [PASS] Slider #${s.id} border contrast: ${contrast.toFixed(2)}:1 (>= 3.0:1 requirement)`);
    } else {
      console.error(`  [FAIL] Slider #${s.id} border contrast: ${contrast.toFixed(2)}:1 (< 3.0:1 requirement)`);
      allPassed = false;
    }
  }

  // Check workflow primary button: rows have Khmer translation, so Translate MUST NOT be primary; Generate Selected Audio must be primary!
  console.log(`State Rows count: ${uiChecks.rowsLength}, All Translated: ${uiChecks.rowsTranslated}`);
  console.log(`Button states - Transcribe primary: ${uiChecks.transPrimary}, Translate primary: ${uiChecks.translatePrimary}, Generate primary: ${uiChecks.genPrimary}`);

  if (uiChecks.rowsTranslated && !uiChecks.translatePrimary && uiChecks.genPrimary) {
    console.log('  [PASS] Workflow primary button is correctly "Generate Selected Audio" (NOT "Translate") when segments are already translated!');
  } else {
    console.error('  [FAIL] Workflow primary button did not follow state correctly!');
    allPassed = false;
  }

  // 4. Capture Verification Screenshots in Both Themes
  console.log('\n>>> CAPTURING VERIFICATION SCREENSHOTS IN LIGHT AND DARK THEMES <<<');
  const screenshotDir = path.join(__dirname, '../artifacts_screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // Light Theme Screenshot
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'light';`);
  await new Promise(r => setTimeout(r, 400));
  const lightImage = await win.webContents.capturePage();
  const lightPath = path.join(screenshotDir, 'timeline_fixed_light.png');
  fs.writeFileSync(lightPath, lightImage.toPNG());
  console.log(`  Saved Light Theme Screenshot to: ${lightPath}`);

  // Dark Theme Screenshot
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'dark';`);
  await new Promise(r => setTimeout(r, 400));
  const darkImage = await win.webContents.capturePage();
  const darkPath = path.join(screenshotDir, 'timeline_fixed_dark.png');
  fs.writeFileSync(darkPath, darkImage.toPNG());
  console.log(`  Saved Dark Theme Screenshot to: ${darkPath}`);

  win.destroy();

  console.log('\n====================================================');
  if (allPassed) {
    console.log('✅ ALL TIMELINE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log('❌ SOME TESTS FAILED. PLEASE CHECK LOGS ABOVE.');
  }
  console.log('====================================================');

  app.quit();
  process.exit(allPassed ? 0 : 1);
}

runVerification().catch(err => {
  console.error('Test execution error:', err);
  app.quit();
  process.exit(1);
});
