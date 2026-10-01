/**
 * Capture visual screenshot evidence for Phase 1 fixes:
 * 1. Startup state: Play & Scrubber disabled with "Load a video first" tooltip.
 * 2. + Add Text row added (0-3s unclamped) with no video loaded.
 * 3. Empty state UI.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const profileDir = path.join(__dirname, '../audit/profile');
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
app.setPath('userData', profileDir);

const screenshotsDir = path.join(__dirname, '../audit/screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

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
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../src/preload/index.js')
      }
    });

    registerIpcHandlers(win);
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await new Promise(r => setTimeout(r, 1200));

    // Screenshot 1: Startup with play/scrubber disabled and empty state
    const img1 = await win.capturePage();
    fs.writeFileSync(path.join(screenshotsDir, 'phase1_1_startup_controls_disabled.png'), img1.toPNG());
    console.log('✓ Captured phase1_1_startup_controls_disabled.png');

    // Add a text row with no video
    await win.webContents.executeJavaScript(`
      document.getElementById('add')?.click();
    `);
    await new Promise(r => setTimeout(r, 600));

    // Screenshot 2: Unclamped 0-3s row created without video
    const img2 = await win.capturePage();
    fs.writeFileSync(path.join(screenshotsDir, 'phase1_2_unclamped_row_created.png'), img2.toPNG());
    console.log('✓ Captured phase1_2_unclamped_row_created.png');

    win.destroy();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    process.exit(1);
  }
});
