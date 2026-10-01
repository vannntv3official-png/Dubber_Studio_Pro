const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');
const keyPool = require('../src/main/services/key-pool');

async function runMemoryAudit() {
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

  // Wait for initial render, DOM initialization, and poller
  await new Promise(r => setTimeout(r, 2000));

  console.log('=== PHASE 4: MEMORY CHECK & LEAK AUDIT ===\n');

  // Helper to gather memory metrics across main and all child processes
  const getAppMemory = async () => {
    const metrics = app.getAppMetrics();
    let totalWorkingSetKb = 0;
    let totalPrivateKb = 0;
    const procBreakdown = [];

    for (const m of metrics) {
      if (m.memory) {
        totalWorkingSetKb += m.memory.workingSetSize || 0;
        totalPrivateKb += m.memory.privateBytes || 0;
        procBreakdown.push({
          type: m.type,
          pid: m.pid,
          workingSetMb: ((m.memory.workingSetSize || 0) / 1024).toFixed(1),
          privateMb: ((m.memory.privateBytes || 0) / 1024).toFixed(1)
        });
      }
    }

    const rendererHeap = await win.webContents.executeJavaScript(`
      (() => {
        if (window.performance && window.performance.memory) {
          return {
            usedHeapMb: (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1),
            totalHeapMb: (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)
          };
        }
        return { usedHeapMb: 'N/A', totalHeapMb: 'N/A' };
      })()
    `);

    return {
      totalWorkingSetMb: (totalWorkingSetKb / 1024).toFixed(1),
      totalPrivateMb: (totalPrivateKb / 1024).toFixed(1),
      mainRssMb: (process.memoryUsage().rss / (1024 * 1024)).toFixed(1),
      mainHeapMb: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1),
      rendererHeap,
      procBreakdown
    };
  };

  // Baseline
  const baseline = await getAppMemory();
  console.log('1. Baseline Memory (Application Idle):');
  console.log(`   - App Total Working Set: ${baseline.totalWorkingSetMb} MB`);
  console.log(`   - Main Process RSS:      ${baseline.mainRssMb} MB (Heap: ${baseline.mainHeapMb} MB)`);
  console.log(`   - Renderer JS Heap:      ${baseline.rendererHeap.usedHeapMb} MB / ${baseline.rendererHeap.totalHeapMb} MB`);
  console.log('   - Process Breakdown:', baseline.procBreakdown.map(p => `${p.type}: ${p.workingSetMb}MB`).join(', '));
  console.log('--------------------------------------------------');

  // ROUND 1: Video Load and Unload (5 different video iterations)
  console.log('\n2. Executing Round 1: Load and Unload 5 Different Videos...');
  const videoMemRounds = [];

  for (let i = 1; i <= 5; i++) {
    const fakePath = `C:/Users/kongv/Videos/sample_test_episode_0${i}.mp4`;
    await win.webContents.executeJavaScript(`
      (() => {
        const { player, state } = window.__app;
        state.project.videoFilePath = "${fakePath}";
        state.project.duration = 120 + ${i * 15};
        player.loadVideo("${fakePath}");
        state.emit('projectLoaded');
      })()
    `);
    await new Promise(r => setTimeout(r, 200));

    // Unload video
    await win.webContents.executeJavaScript(`
      (() => {
        const { player, state } = window.__app;
        player.unloadVideo();
        state.project.videoFilePath = null;
        state.emit('change', { source: 'unload' });
      })()
    `);
    await new Promise(r => setTimeout(r, 100));

    const snap = await getAppMemory();
    videoMemRounds.push(snap.totalWorkingSetMb);
    console.log(`   - Video ${i}/5: App Working Set = ${snap.totalWorkingSetMb} MB (Renderer Heap = ${snap.rendererHeap.usedHeapMb} MB)`);
  }

  const postVideoMem = await getAppMemory();
  console.log(`   => Post-Video Load/Unload: ${postVideoMem.totalWorkingSetMb} MB (Delta: ${(postVideoMem.totalWorkingSetMb - baseline.totalWorkingSetMb).toFixed(1)} MB)`);
  console.log('--------------------------------------------------');

  // ROUND 2: Zoom In / Out Stress Test (50 cycles)
  console.log('\n3. Executing Round 2: 50x Zoom In/Out Cycles (Waveform & Ruler stress)...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { timeline } = window.__app;
      const zoomSlider = document.getElementById('zoom');

      for (let i = 0; i < 50; i++) {
        // Zoom in to 80%
        if (zoomSlider) {
          zoomSlider.value = String(Math.floor((i % 10) * 10));
          zoomSlider.dispatchEvent(new Event('input'));
        }
        timeline.render();
      }
      // Reset zoom to 0
      if (zoomSlider) {
        zoomSlider.value = "0";
        zoomSlider.dispatchEvent(new Event('input'));
      }
      timeline.render();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  const postZoomMem = await getAppMemory();
  console.log(`   => Post-50x Zoom Cycles: ${postZoomMem.totalWorkingSetMb} MB (Delta from baseline: ${(postZoomMem.totalWorkingSetMb - baseline.totalWorkingSetMb).toFixed(1)} MB)`);
  console.log(`   - Renderer JS Heap: ${postZoomMem.rendererHeap.usedHeapMb} MB`);
  console.log('--------------------------------------------------');

  // ROUND 3: Play / Stop Stress Test (20 cycles)
  console.log('\n4. Executing Round 3: 20x Play/Stop Cycles...');
  await win.webContents.executeJavaScript(`
    (() => {
      const { player, state } = window.__app;
      for (let i = 0; i < 20; i++) {
        state.timeline.isPlaying = true;
        state.setPlayhead((i * 4.5) % 100);
        player.updateCaption();
        // Stop playback
        player.stopPlayback();
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  const postPlayMem = await getAppMemory();
  console.log(`   => Post-20x Play/Stop Cycles: ${postPlayMem.totalWorkingSetMb} MB (Delta from baseline: ${(postPlayMem.totalWorkingSetMb - baseline.totalWorkingSetMb).toFixed(1)} MB)`);
  console.log(`   - Renderer JS Heap: ${postPlayMem.rendererHeap.usedHeapMb} MB`);
  console.log('--------------------------------------------------');

  // Update Status Bar and verify displayed values
  await win.webContents.executeJavaScript(`
    (() => {
      window.__app.ui.updateSystemStatus();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  const statusBarCheck = await win.webContents.executeJavaScript(`
    (() => {
      const memStatusTxt = document.getElementById('memStatusTxt')?.textContent;
      const memStatusTitle = document.getElementById('memStatus')?.getAttribute('title');
      const keysStatusTxt = document.getElementById('keysStatusTxt')?.textContent;
      const keysStatusTitle = document.getElementById('keysStatus')?.getAttribute('title');
      return {
        memStatusTxt,
        memStatusTitle,
        keysStatusTxt,
        keysStatusTitle
      };
    })()
  `);

  console.log('\n5. Status Bar Memory & Keys Validation:');
  console.log('   - Memory Badge Text: ', statusBarCheck.memStatusTxt);
  console.log('   - Memory Tooltip:    ', statusBarCheck.memStatusTitle);
  console.log('   - Keys Badge Text:   ', statusBarCheck.keysStatusTxt);
  console.log('   - Keys Tooltip:      ', statusBarCheck.keysStatusTitle);

  // Capture final Phase 4 Screenshot
  const finalShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'phase4-memory-verified.png'), finalShot.toPNG());
  console.log('\nCaptured phase4-memory-verified.png');

  console.log('\n=== PHASE 4: AUDIT COMPLETE ===');
  app.quit();
}

runMemoryAudit().catch(err => {
  console.error('Phase 4 verification error:', err);
  app.quit();
});
