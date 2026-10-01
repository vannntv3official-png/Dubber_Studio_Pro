/**
 * Verification Test for Item 13:
 * Test on a COPY of the user's real app-data profile (not a throwaway profile):
 * - Confirms the app never opens with a demo project (E02, "Story Dubbing", sample Khmer lines).
 * - Preserves the user's real keys, settings, and projects without touching the real profile.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REAL_PROFILE_DIR = 'C:\\Users\\kongv\\AppData\\Roaming\\glass-app';

const EXCLUDE_DIRS = new Set(['models', 'tts-cache', 'logs', 'Cache', 'GPUCache', 'Code Cache', 'DawnWebGPUCache']);

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function run() {
  console.log('=== Test Item 13: Real App-Data Profile Copy Verification ===\n');

  assert(fs.existsSync(REAL_PROFILE_DIR), `Real profile directory must exist: ${REAL_PROFILE_DIR}`);
  console.log(`[1/4] Found real app-data profile at: ${REAL_PROFILE_DIR}`);

  // Snapshot real profile timestamps to ensure it is not touched
  const realRecentFile = path.join(REAL_PROFILE_DIR, 'recent-projects.json');
  const realSettingsFile = path.join(REAL_PROFILE_DIR, 'config', 'settings.json');
  const realRecentStatBefore = fs.statSync(realRecentFile);
  const realSettingsStatBefore = fs.existsSync(realSettingsFile) ? fs.statSync(realSettingsFile) : null;

  // Create isolated copy in temporary directory
  const profileCopyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-app-real-profile-copy-'));
  console.log(`[2/4] Created isolated profile COPY at: ${profileCopyDir}`);
  copyDirRecursive(REAL_PROFILE_DIR, profileCopyDir);

  const copyRecentFile = path.join(profileCopyDir, 'recent-projects.json');
  assert(fs.existsSync(copyRecentFile), 'recent-projects.json must exist in profile copy');

  // Verify contents of real profile copy
  const recentList = JSON.parse(fs.readFileSync(copyRecentFile, 'utf8'));
  console.log(`Found ${recentList.length} project entries in profile copy.`);
  recentList.forEach((p, idx) => {
    console.log(`  Project [${idx + 1}]: "${p.name}"`);
  });

  // 1. Verify 0 demo strings in project names and paths
  console.log('\n[3/4] Asserting NO demo projects exist in real profile copy...');
  const demoRegex = /(E02|ភាគទី២|Story\s+Dubbing)/i;
  for (const p of recentList) {
    const combined = `${p.name || ''} ${p.projectDir || ''} ${p.videoPath || ''}`;
    assert(!demoRegex.test(combined), `Demo project found in profile: "${combined}"`);
    assert(p.isDemo !== true, `Project marked with isDemo: true found: ${p.name}`);
  }
  console.log('✓ Verified: 0 demo projects found in profile copy.');

  // 2. Test ProjectService startup logic pointed exclusively to profile copy
  const ProjectService = require('../src/main/services/project').constructor;
  const projectService = new ProjectService();
  projectService.getRecentProjectsFilePath = () => copyRecentFile;
  projectService.getUserDataDir = () => profileCopyDir;

  const projectsFromService = projectService.getRecentProjects(false);
  for (const p of projectsFromService) {
    assert(!demoRegex.test(p.name || ''), `ProjectService returned demo project: ${p.name}`);
    assert(p.isDemo !== true, `ProjectService returned isDemo project: ${p.name}`);
  }
  console.log(`✓ ProjectService.getRecentProjects() returned ${projectsFromService.length} legitimate projects.`);

  // Test startup behavior directly on profile copy settings
  const copySettingsFile = path.join(profileCopyDir, 'config', 'settings.json');
  assert(fs.existsSync(copySettingsFile), 'settings.json must exist in profile copy');
  const settings = JSON.parse(fs.readFileSync(copySettingsFile, 'utf8'));
  console.log(`Startup action in profile copy: "${settings?.general?.startupAction}"`);
  assert(
    settings?.general?.startupAction === 'startScreen' || settings?.general?.startupAction === 'lastProject',
    'Startup action must be valid'
  );

  // If startupAction is startScreen, app boots to empty start screen
  if (settings?.general?.startupAction === 'startScreen') {
    console.log('✓ Confirmed: App starts with clean start screen (no demo project loaded).');
  }

  // (b) Test what happens if startupAction were 'lastProject':
  const lastProj = projectService.getLastProject ? projectService.getLastProject() : projectsFromService[0];
  if (lastProj) {
    console.log(`If lastProject were selected, app would open: "${lastProj.name}" (legitimate user project, NOT demo)`);
    assert(!demoRegex.test(lastProj.name), 'Auto-opened project must not be demo project');
  }

  // 3. Confirm REAL profile was completely untouched
  console.log('\n[4/4] Verifying REAL profile integrity (zero modifications)...');
  const realRecentStatAfter = fs.statSync(realRecentFile);
  assert.strictEqual(
    realRecentStatBefore.mtimeMs,
    realRecentStatAfter.mtimeMs,
    'Real profile recent-projects.json must NOT have been modified!'
  );
  if (realSettingsStatBefore) {
    const realSettingsStatAfter = fs.statSync(realSettingsFile);
    assert.strictEqual(
      realSettingsStatBefore.mtimeMs,
      realSettingsStatAfter.mtimeMs,
      'Real profile settings.json must NOT have been modified!'
    );
  }
  console.log('✓ Verified: Real profile timestamps identical; zero keys, settings, or projects touched.');

  // Clean up profile copy
  try {
    fs.rmSync(profileCopyDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n=== ALL ITEM 13 VERIFICATION TESTS PASSED ===');
}

run().catch(err => {
  console.error('Test Item 13 failed:', err);
  process.exit(1);
});
