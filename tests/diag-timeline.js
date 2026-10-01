const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function measureTimeline() {
  logger.init();
  await app.whenReady();

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
  await new Promise(r => setTimeout(r, 1500));

  const measurements = await win.webContents.executeJavaScript(`
    (() => {
      const labelsCol = document.getElementById('tlLabelsCol');
      const lanesCol = document.getElementById('tlLanesCol');
      const tracksContainer = document.getElementById('tracks');
      const panel = tracksContainer ? tracksContainer.closest('.panel') : null;

      const labels = Array.from(labelsCol ? labelsCol.children : []).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          text: el.textContent.trim().replace(/\\s+/g, ' '),
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height
        };
      });

      const lanes = Array.from(lanesCol ? lanesCol.children : []).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          track: el.dataset.track || el.className,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height
        };
      });

      // Measure sliders in light theme
      document.documentElement.dataset.theme = 'light';
      const sliders = Array.from(document.querySelectorAll('.sliders input[type="range"], #zoom')).map(s => {
        const cs = window.getComputedStyle(s);
        const rect = s.getBoundingClientRect();
        return {
          id: s.id || s.getAttribute('aria-label') || 'slider',
          width: rect.width,
          height: rect.height,
          background: cs.backgroundColor,
          border: cs.border,
          boxShadow: cs.boxShadow
        };
      });

      // Panel & container heights
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const tracksRect = tracksContainer ? tracksContainer.getBoundingClientRect() : null;

      return {
        panelHeight: panelRect ? panelRect.height : 0,
        tracksContainerHeight: tracksRect ? tracksRect.height : 0,
        labels,
        lanes,
        sliders
      };
    })()
  `);

  console.log('=== REAL APP TIMELINE MEASUREMENTS ===');
  console.log('Panel Height:', measurements.panelHeight, 'px');
  console.log('Tracks Container Height:', measurements.tracksContainerHeight, 'px');
  console.log('\n--- Labels vs Lanes Alignment ---');
  for (let i = 0; i < Math.max(measurements.labels.length, measurements.lanes.length); i++) {
    const lbl = measurements.labels[i] || {};
    const lane = measurements.lanes[i] || {};
    const diff = (lbl.top - lane.top).toFixed(2);
    console.log(`Row ${i}: Label "${lbl.text}" [top=${lbl.top?.toFixed(1)}, h=${lbl.height?.toFixed(1)}] vs Lane "${lane.track}" [top=${lane.top?.toFixed(1)}, h=${lane.height?.toFixed(1)}] => Drift: ${diff}px`);
  }

  console.log('\n--- Sliders Measurements ---');
  console.log(measurements.sliders);

  app.quit();
}

measureTimeline().catch(e => {
  console.error(e);
  app.quit();
});
