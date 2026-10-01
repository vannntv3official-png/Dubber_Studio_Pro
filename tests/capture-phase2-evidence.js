/**
 * Automated Evidence Capture for Phase 2
 * Launches the app in Electron, captures screenshots of:
 * 1. Settings modal with live controls (autosave interval, confirm delete, default folder, ffmpeg threads).
 * 2. Main interface showing timeline volume gain, pitch "(on export)" notice, and Undo toast action.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpcHandlers } = require('../src/main/ipc');

const screenshotDir = path.join(__dirname, '../audit/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  registerIpcHandlers(win);
  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  win.show();

  // Wait for initial render
  await new Promise(r => setTimeout(r, 600));

  // 1. Open Settings modal to capture settings controls
  await win.webContents.executeJavaScript(`
    document.getElementById('settings')?.click();
  `);
  await new Promise(r => setTimeout(r, 600));

  const image1 = await win.capturePage();
  const file1 = path.join(screenshotDir, 'phase2_1_settings_modal_controls.png');
  fs.writeFileSync(file1, image1.toPNG());
  console.log('Saved screenshot 1:', file1);

  // 2. Close settings modal, trigger timeline pitch adjustment, and trigger delete with Undo toast
  await win.webContents.executeJavaScript(`
    document.getElementById('settingsCloseBtn')?.click();
    
    // Add a subtitle row
    document.getElementById('add')?.click();

    // Adjust pitch slider
    const pitchSlider = document.getElementById('tlPitch');
    if (pitchSlider) {
      pitchSlider.value = '4';
      pitchSlider.dispatchEvent(new Event('input'));
    }

    // Adjust volume slider
    const volSlider = document.getElementById('tlVol');
    if (volSlider) {
      volSlider.value = '0.7';
      volSlider.dispatchEvent(new Event('input'));
    }

    // Mock window.confirm so it confirms automatically without blocking renderer
    window.confirm = () => true;
    const delBtn = document.getElementById('del');
    delBtn?.click();
  `);

  await new Promise(r => setTimeout(r, 600));

  const image2 = await win.capturePage();
  const file2 = path.join(screenshotDir, 'phase2_2_timeline_sliders_and_undo_toast.png');
  fs.writeFileSync(file2, image2.toPNG());
  console.log('Saved screenshot 2:', file2);

  app.quit();
});
