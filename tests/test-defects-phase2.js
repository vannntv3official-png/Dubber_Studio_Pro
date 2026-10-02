const assert = require('assert');
const path = require('path');
const fs = require('fs');

const settingsService = require('../src/main/services/settings');
const projectService = require('../src/main/services/project');

async function testPhase2Fixes() {
  console.log('=== REGRESSION TEST: DEF-01, DEF-02, DEF-03 ===\n');

  const testDir = path.join(__dirname, 'temp_phase2_fixes');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  settingsService.getUserDataDir = () => testDir;
  projectService.getUserDataDir = () => testDir;

  // ----------------------------------------------------
  // TEST 1: DEF-02 Settings Atomic Write & .bak Maintenance
  // ----------------------------------------------------
  console.log('[1/4] Testing Settings Atomic Save and .bak backup...');
  settingsService.initStoragePath();
  settingsService.update({ general: { uiLanguage: 'en' } });

  const settingsFile = settingsService.storagePath;
  assert.strictEqual(fs.existsSync(settingsFile), true, 'settings.json must exist');

  // Modify and save again to create .bak
  settingsService.update({ general: { uiLanguage: 'km' } });

  const bakFile = `${settingsFile}.bak`;
  assert.strictEqual(fs.existsSync(bakFile), true, 'settings.json.bak must exist');

  const bakContent = JSON.parse(fs.readFileSync(bakFile, 'utf8'));
  assert.strictEqual(bakContent.general.uiLanguage, 'en', 'Backup must retain previous version');

  // Test recovery from .bak when settings.json is corrupted
  console.log('[2/4] Testing Settings Recovery from .bak on corruption...');
  fs.writeFileSync(settingsFile, '{ INVALID_JSON_CORRUPTED');
  settingsService.load();
  assert.strictEqual(settingsService.get().general.uiLanguage, 'en', 'Settings must recover from .bak on corruption');
  console.log('  ✓ DEF-02 PASSED');

  // ----------------------------------------------------
  // TEST 2: DEF-03 Project Save, Autosave & .bak Recovery
  // ----------------------------------------------------
  console.log('[3/4] Testing Project Save & Autosave Atomic Write with .bak...');
  const projDir = path.join(testDir, 'sample_project');
  const projJson = path.join(projDir, 'project.json');

  const initialData = { id: 'p1', name: 'Initial Project', duration: 10, rows: [] };
  await projectService.saveProject(projJson, initialData);

  assert.strictEqual(fs.existsSync(projJson), true, 'project.json must exist');

  const updatedData = { id: 'p1', name: 'Updated Project', duration: 10, rows: [{ id: 1, text: 'Hello' }] };
  await projectService.saveProject(projJson, updatedData);

  const projBak = `${projJson}.bak`;
  assert.strictEqual(fs.existsSync(projBak), true, 'project.json.bak must exist');
  const projBakContent = JSON.parse(fs.readFileSync(projBak, 'utf8'));
  assert.strictEqual(projBakContent.name, 'Initial Project', 'project.json.bak must retain previous state');

  // Test autosave atomic write & .bak
  await projectService.autosaveProject(projJson, { ...updatedData, name: 'Autosaved 1' });
  await projectService.autosaveProject(projJson, { ...updatedData, name: 'Autosaved 2' });
  const autosaveBak = path.join(projDir, 'project.autosave.json.bak');
  assert.strictEqual(fs.existsSync(autosaveBak), true, 'project.autosave.json.bak must exist');

  // Test recovery when project.json is missing or corrupted
  console.log('[4/4] Testing Project Load Recovery from .bak on corruption...');
  fs.writeFileSync(projJson, 'CORRUPTED_GARBAGE');
  const recoveredProj = await projectService.loadProject(projJson);
  assert.strictEqual(recoveredProj.project.name, 'Initial Project', 'Project must recover from .bak');
  console.log('  ✓ DEF-03 PASSED');

  // Cleanup testDir
  fs.rmSync(testDir, { recursive: true, force: true });

  console.log('\n==============================================');
  console.log('🎉 ALL PHASE 2 REGRESSION TESTS PASSED (100%)');
  console.log('==============================================\n');
}

testPhase2Fixes().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
