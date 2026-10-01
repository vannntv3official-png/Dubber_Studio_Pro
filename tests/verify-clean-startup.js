// Verification Suite for Clean Startup, Startup Settings, and Zero Demo Data in src/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// 1. GREP TEST: Verify 0 demo strings in src/
function runGrepTest() {
  console.log('\n--- 1. GREP TEST: Checking src/ for demo strings ---');
  const srcDir = path.join(__dirname, '../src');
  const forbiddenPatterns = [
    'E' + '02',
    '\u1797\u17b6\u1782\u1791\u17b8\u17e2', // ភាគទី២
    'Story' + ' ' + 'Dubbing',
    '01:37' + '.62',
    '00:14' + '.28'
  ];

  function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walk(fullPath));
      } else {
        results.push(fullPath);
      }
    });
    return results;
  }

  const allFiles = walk(srcDir);
  const violations = [];

  allFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    forbiddenPatterns.forEach(pattern => {
      if (content.includes(pattern)) {
        violations.push({ filePath: path.relative(srcDir, filePath), pattern });
      }
    });
  });

  if (violations.length > 0) {
    console.error('❌ Grep Test FAILED! Found demo strings in src/:', violations);
    throw new Error(`Found ${violations.length} forbidden demo pattern occurrences in src/`);
  } else {
    console.log('✓ Grep Test PASSED: 0 forbidden demo strings found across all ' + allFiles.length + ' files in src/.');
  }
}

async function runCleanStartupSuite() {
  try {
    runGrepTest();

    console.log('\n--- 2. FRESH APP-DATA TEST: Clean startup state ---');
    // Create temporary userData directory
    const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-app-test-'));
    console.log('Using isolated temp userData:', tempUserData);

    const win = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      backgroundColor: '#0e1726',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../src/preload/index.js')
      }
    });

    const { registerIpcHandlers } = require('../src/main/ipc');
    const projectService = require('../src/main/services/project');
    const settingsService = require('../src/main/services/settings');

    // Point services to temp directory
    projectService.getUserDataDir = () => tempUserData;
    settingsService.getUserDataDir = () => tempUserData;

    registerIpcHandlers(win);

    const indexPath = path.join(__dirname, '../src/renderer/index.html');
    await win.loadFile(indexPath);
    await new Promise(r => setTimeout(r, 1200));

    // Evaluate clean start state in renderer
    const cleanState = await win.webContents.executeJavaScript(`
      (() => {
        const { state } = window.__app;
        const projHeader = document.getElementById('proj')?.textContent || '';
        const projFooter = document.getElementById('pname')?.textContent || '';
        const curTime = document.getElementById('curTime')?.textContent || '';
        const totalTime = document.getElementById('totalTime')?.textContent || '';
        const emptyStateHidden = document.getElementById('tableEmptyState')?.hidden;
        const emptyBtnPrimaryTxt = document.getElementById('emptyBtnPrimary')?.textContent || '';
        const emptyBtnOpenHidden = document.getElementById('emptyBtnOpenProj')?.hidden;
        const emptyBtnNewHidden = document.getElementById('emptyBtnNewProj')?.hidden;
        const tableHidden = document.querySelector('.scroll-table-container table')?.style.display === 'none';
        const docTitle = document.title;
        const capEl = document.getElementById('cap');
        const capVisible = capEl && capEl.style.display !== 'none' && capEl.textContent.trim().length > 0;
        const bodyHtml = document.body.innerHTML;

        const hasDemoKhmer = bodyHtml.includes('ភាគទី២') || bodyHtml.includes('E02');

        return {
          projectName: state.project.name,
          duration: state.project.duration,
          rowCount: state.rows.length,
          playhead: state.timeline.playhead,
          projHeader,
          projFooter,
          curTime,
          totalTime,
          docTitle,
          emptyStateHidden,
          emptyBtnPrimaryTxt,
          emptyBtnOpenHidden,
          emptyBtnNewHidden,
          tableHidden,
          capVisible,
          hasDemoKhmer
        };
      })()
    `);

    console.log('Clean startup evaluation:', cleanState);
    assert.strictEqual(cleanState.rowCount, 0, 'Rows count must be 0 on clean start');
    assert.strictEqual(cleanState.duration, 0, 'Duration must be 0 on clean start');
    assert.strictEqual(cleanState.playhead, 0, 'Playhead must be 0 on clean start');
    assert.strictEqual(cleanState.projHeader, '', 'Project header text must be empty');
    assert.strictEqual(cleanState.curTime, '00:00.00', 'Current time must be 00:00.00');
    assert.strictEqual(cleanState.totalTime, '00:00.00', 'Total time must be 00:00.00');
    assert.strictEqual(cleanState.docTitle, 'AI Dubbing Studio', 'Document title must be default');
    assert.strictEqual(cleanState.emptyStateHidden, false, 'Empty state must be visible');
    assert.strictEqual(cleanState.emptyBtnOpenHidden, false, 'Open Project button must be visible in empty state');
    assert.strictEqual(cleanState.emptyBtnNewHidden, false, 'New Project button must be visible in empty state');
    assert.strictEqual(cleanState.tableHidden, true, 'Table element must be hidden when empty');
    assert.strictEqual(cleanState.capVisible, false, 'Caption box must be hidden when empty');
    assert.strictEqual(cleanState.hasDemoKhmer, false, 'No demo Khmer text allowed in DOM');
    console.log('✓ Clean Startup Test PASSED!');

    // Apply Dark theme and capture screenshot
    await win.webContents.executeJavaScript(`
      (() => {
        window.__app.theme.applyTheme('dark');
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const darkShot = await win.webContents.capturePage();
    const artifactDir = 'C:\\Users\\kongv\\.gemini\\antigravity\\brain\\3242702f-4c2a-4840-8e28-f47de8585610';
    fs.writeFileSync(path.join(__dirname, 'clean-startup-dark.png'), darkShot.toPNG());
    if (fs.existsSync(artifactDir)) {
      fs.writeFileSync(path.join(artifactDir, 'clean-startup-dark.png'), darkShot.toPNG());
    }
    console.log('Captured clean-startup-dark.png');

    // Switch to Light theme and capture screenshot
    await win.webContents.executeJavaScript(`
      (() => {
        window.__app.theme.applyTheme('light');
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const lightShot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'clean-startup-light.png'), lightShot.toPNG());
    if (fs.existsSync(artifactDir)) {
      fs.writeFileSync(path.join(artifactDir, 'clean-startup-light.png'), lightShot.toPNG());
    }
    console.log('Captured clean-startup-light.png');

    // Reset back to Dark theme
    await win.webContents.executeJavaScript(`
      (() => {
        window.__app.theme.applyTheme('dark');
      })()
    `);
    await new Promise(r => setTimeout(r, 300));

    console.log('\n--- 3. STARTUP SETTING TEST: Show start screen vs Reopen last project ---');

    // Create a real mock project on disk
    const testProjDir = path.join(tempUserData, 'test-project-1');
    fs.mkdirSync(testProjDir, { recursive: true });
    const testProjFile = path.join(testProjDir, 'project.json');
    const mockProjectData = {
      schemaVersion: 1,
      name: 'My Real User Project',
      duration: 45.5,
      videoFilePath: null,
      subtitles: [
        { id: 1, s: 1.0, e: 4.0, t: 'សួស្តីអ្នកទាំងអស់គ្នា', ok: false }
      ]
    };
    fs.writeFileSync(testProjFile, JSON.stringify(mockProjectData, null, 2), 'utf8');

    // Add to recent projects
    projectService.saveRecentProject({
      name: 'My Real User Project',
      projectDir: testProjDir,
      projectJsonPath: testProjFile
    });

    // 3a. Test with startupAction = 'startScreen' (default)
    settingsService.update({ general: { startupAction: 'startScreen' } });

    // Reload page to simulate app launch
    await win.loadFile(indexPath);
    await new Promise(r => setTimeout(r, 1000));

    const startScreenCheck = await win.webContents.executeJavaScript(`
      (() => {
        const { state } = window.__app;
        const recentsContainer = document.getElementById('emptyRecentsContainer');
        const recentItems = document.querySelectorAll('.recent-item');
        return {
          rowCount: state.rows.length,
          recentsHidden: recentsContainer?.hidden,
          recentItemCount: recentItems.length,
          firstName: recentItems[0]?.querySelector('.recent-item-name')?.textContent
        };
      })()
    `);
    console.log('Start screen check (should NOT auto-load):', startScreenCheck);
    assert.strictEqual(startScreenCheck.rowCount, 0, 'Should not auto-load project on startScreen');
    assert.strictEqual(startScreenCheck.recentItemCount, 1, 'Should display 1 recent project');
    assert.strictEqual(startScreenCheck.firstName, 'My Real User Project', 'Recent project name match');
    console.log('✓ Start Screen (No Auto-Load) PASSED!');

    // 3b. Test with startupAction = 'reopenLast'
    console.log('Testing startupAction = reopenLast...');
    settingsService.update({ general: { startupAction: 'reopenLast' } });

    await win.loadFile(indexPath);
    await new Promise(r => setTimeout(r, 1200));

    const reopenCheck = await win.webContents.executeJavaScript(`
      (() => {
        const { state } = window.__app;
        return {
          name: state.project.name,
          duration: state.project.duration,
          rowCount: state.rows.length,
          firstRowText: state.rows[0]?.t
        };
      })()
    `);
    console.log('Reopen last project check:', reopenCheck);
    assert.strictEqual(reopenCheck.name, 'My Real User Project', 'Should auto-load last project');
    assert.strictEqual(reopenCheck.rowCount, 1, 'Should have loaded 1 row');
    assert.strictEqual(reopenCheck.firstRowText, 'សួស្តីអ្នកទាំងអស់គ្នា', 'Row content matches');
    console.log('✓ Reopen Last Project PASSED!');

    // 3c. Test fallback when project folder is deleted from disk
    console.log('Testing fallback when project folder is missing...');
    fs.rmSync(testProjDir, { recursive: true, force: true });

    await win.loadFile(indexPath);
    await new Promise(r => setTimeout(r, 1200));

    const missingFallbackCheck = await win.webContents.executeJavaScript(`
      (() => {
        const { state } = window.__app;
        const emptyStateHidden = document.getElementById('tableEmptyState')?.hidden;
        return {
          rowCount: state.rows.length,
          duration: state.project.duration,
          emptyStateHidden
        };
      })()
    `);
    console.log('Missing project fallback check:', missingFallbackCheck);
    assert.strictEqual(missingFallbackCheck.rowCount, 0, 'Must fallback to 0 rows on missing project');
    assert.strictEqual(missingFallbackCheck.emptyStateHidden, false, 'Empty state must be shown');
    console.log('✓ Missing Project Fallback PASSED!');

    // Clean up temp directory
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch (_) {}

    console.log('\n========================================');
    console.log('🎉 ALL CLEAN STARTUP VERIFICATIONS PASSED!');
    console.log('========================================\n');

    win.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification Suite Failed:', err);
    process.exit(1);
  }
}

app.whenReady().then(runCleanStartupSuite);
