/**
 * Capture Phase 3 Verification Screenshots:
 * 1. phase3_1_preview_toolbar_cleaned.png (Shows cleaned toolbar with only Blur and Watermark, stubs removed)
 * 2. phase3_2_settings_devmode_and_pronunciation.png (Shows Developer mode card, pronunciation add example rules button, and hidden update button)
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

async function capture() {
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#0e1726',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../src/preload/index.js')
    }
  });

  const { registerIpcHandlers } = require('../src/main/ipc');
  registerIpcHandlers(win);

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 1200));

  const screenshotsDir = path.join(__dirname, '../audit/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Capture Main window with Cleaned Preview Toolbar
  const mainImage = await win.webContents.capturePage();
  const shot1Path = path.join(screenshotsDir, 'phase3_preview_toolbar.png');
  fs.writeFileSync(shot1Path, mainImage.toPNG());
  console.log(`Saved screenshot: ${shot1Path}`);

  // 2. Open Settings modal and switch to System section
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      document.getElementById('settings').click();
      setTimeout(() => {
        document.getElementById('navSystem')?.click();
        setTimeout(resolve, 800);
      }, 1000);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const sysImage = await win.webContents.capturePage();
  const shot2Path = path.join(screenshotsDir, 'phase3_settings_system.png');
  fs.writeFileSync(shot2Path, sysImage.toPNG());
  console.log(`Saved screenshot: ${shot2Path}`);

  // 3. Switch to Pronunciation section to show Add Example Rules button
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      document.getElementById('navPronunciation')?.click();
      setTimeout(resolve, 800);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const pronImage = await win.webContents.capturePage();
  const shot3Path = path.join(screenshotsDir, 'phase3_settings_pronunciation.png');
  fs.writeFileSync(shot3Path, pronImage.toPNG());
  console.log(`Saved screenshot: ${shot3Path}`);

  // 4. Switch to Voices section to show TTS Engine dropdown
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      document.getElementById('navVoices')?.click();
      setTimeout(resolve, 800);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const voicesImage = await win.webContents.capturePage();
  const shot4Path = path.join(screenshotsDir, 'phase3_settings_voices.png');
  fs.writeFileSync(shot4Path, voicesImage.toPNG());
  console.log(`Saved screenshot: ${shot4Path}`);

  // 5. Switch to About section to show Check updates hidden
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      document.getElementById('navAbout')?.click();
      setTimeout(resolve, 800);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const aboutImage = await win.webContents.capturePage();
  const shot5Path = path.join(screenshotsDir, 'phase3_settings_about.png');
  fs.writeFileSync(shot5Path, aboutImage.toPNG());
  console.log(`Saved screenshot: ${shot5Path}`);

  win.close();
  app.quit();
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
