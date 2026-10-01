/**
 * Test Item 6: Default Project Folder, Fallback, Sanitization, and Overwrite Protection
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const projectService = require('../src/main/services/project');
const settingsService = require('../src/main/services/settings');

console.log('--- Testing Item 6: Default Project Folder & Overwrite Protection ---');

const testVideoPath = path.join(__dirname, '../test-assets/sample_10s.mp4');
assert(fs.existsSync(testVideoPath), 'Test fixture sample_10s.mp4 must exist');

const tmpBase = path.join(__dirname, 'fixtures', 'tmp_projects_test');
if (fs.existsSync(tmpBase)) {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
fs.mkdirSync(tmpBase, { recursive: true });

// Helper to clean up created directories after tests
const createdDirs = [];

try {
  // 1. Test Name Sanitization
  const unsafeName = 'My:Special*Video<Name>?Version|1/2"Test';
  const sanitized = projectService.sanitizeFolderName(unsafeName);
  assert.strictEqual(/^[a-zA-Z0-9_\-\s.]+$/.test(sanitized), true, `Sanitized name "${sanitized}" should not contain illegal characters`);
  assert(!sanitized.includes(':'), 'No colons');
  assert(!sanitized.includes('*'), 'No asterisks');
  assert(!sanitized.includes('<'), 'No angle brackets');
  assert(!sanitized.includes('?'), 'No question marks');
  console.log(`✓ Name sanitization correctly converts "${unsafeName}" to "${sanitized}"`);

  // 2. Test Writability Check
  assert.strictEqual(projectService.isDirectoryWritable(tmpBase), true, 'tmpBase should be writable');
  assert.strictEqual(projectService.isDirectoryWritable('Z:\\non_existent_drive_12345'), false, 'Nonexistent drive should not be writable');
  console.log('✓ Directory writability check works reliably');
} catch (err) {
  console.error('Synchronous setup error:', err);
  process.exit(1);
}

(async () => {
  try {
    const customDefaultDir = path.join(tmpBase, 'custom_default_projects');
    fs.mkdirSync(customDefaultDir, { recursive: true });
    settingsService.update({ general: { defaultProjectFolder: customDefaultDir } });

    // Project 1: Should be created in customDefaultDir
    const res1 = await projectService.createProjectFromVideo(testVideoPath);
    createdDirs.push(res1.projectDir);
    assert(res1.projectDir.startsWith(customDefaultDir), `Project dir ${res1.projectDir} should be inside ${customDefaultDir}`);
    assert(fs.existsSync(path.join(res1.projectDir, 'project.json')), 'project.json should exist');
    console.log(`✓ Project created inside configured defaultProjectFolder: ${res1.projectDir}`);

    // Project 2: Overwrite Protection: running again with same video should create suffix _1
    const res2 = await projectService.createProjectFromVideo(testVideoPath);
    createdDirs.push(res2.projectDir);
    assert.strictEqual(res2.projectDir, `${res1.projectDir}_1`, `Second project should have _1 suffix to prevent overwriting`);
    assert(fs.existsSync(path.join(res2.projectDir, 'project.json')), 'Second project.json should exist');
    console.log(`✓ Overwrite protection appended _1 suffix: ${res2.projectDir}`);

    // Project 3: running again should create suffix _2
    const res3 = await projectService.createProjectFromVideo(testVideoPath);
    createdDirs.push(res3.projectDir);
    assert.strictEqual(res3.projectDir, `${res1.projectDir}_2`, `Third project should have _2 suffix`);
    console.log(`✓ Overwrite protection appended _2 suffix: ${res3.projectDir}`);

    // 4. Test Fallback when defaultProjectFolder is unset or empty
    const videoDir = path.dirname(testVideoPath);
    settingsService.update({ general: { defaultProjectFolder: '' } });
    const resFallback = await projectService.createProjectFromVideo(testVideoPath);
    createdDirs.push(resFallback.projectDir);
    assert(resFallback.projectDir.startsWith(videoDir), `Fallback project dir should be in video directory ${videoDir}`);
    console.log(`✓ Fallback to video folder when defaultProjectFolder is empty: ${resFallback.projectDir}`);

    // 5. Test Fallback when defaultProjectFolder is unwritable / invalid
    settingsService.update({ general: { defaultProjectFolder: 'Z:\\unwritable_invalid_folder_path' } });
    const resFallbackUnwritable = await projectService.createProjectFromVideo(testVideoPath);
    createdDirs.push(resFallbackUnwritable.projectDir);
    assert(resFallbackUnwritable.projectDir.startsWith(videoDir), `Fallback project dir should be in video directory when configured folder is not writable`);
    console.log(`✓ Fallback to video folder when defaultProjectFolder is unwritable: ${resFallbackUnwritable.projectDir}`);

    console.log('✅ Item 6 PASSED: Default project folder, sanitization, fallback, and overwrite protection verified.\n');
  } catch (err) {
    console.error('Test Item 6 failed:', err);
    process.exit(1);
  } finally {
    // Cleanup created test folders
    settingsService.update({ general: { defaultProjectFolder: '' } });
    for (const d of createdDirs) {
      try {
        if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
      } catch (_) {}
    }
    try {
      if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch (_) {}
  }
})();
