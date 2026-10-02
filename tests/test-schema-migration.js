const assert = require('assert');
const { CURRENT_SCHEMA_VERSION, migrateProject } = require('../src/main/services/project-migration');

function runSchemaMigrationTests() {
  console.log('=== SCHEMA MIGRATION TESTS ===\n');

  // Test 1: Legacy v0 project (no schemaVersion field)
  console.log('[1/4] Testing legacy v0 unversioned project migration...');
  const legacyV0 = {
    name: 'Old Project',
    videoFilePath: 'video.mp4',
    duration: 12.5
  };
  const result1 = migrateProject(legacyV0);
  assert.strictEqual(result1.migrated, true);
  assert.strictEqual(result1.fromVersion, 0);
  assert.strictEqual(result1.toVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(result1.project.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(Array.isArray(result1.project.rows), true);
  assert.strictEqual(typeof result1.project.media, 'object');
  console.log('  ✓ Legacy v0 migration PASSED');

  // Test 2: Project already at current schema version
  console.log('[2/4] Testing current schema version pass-through...');
  const currentProj = {
    schemaVersion: 1,
    id: 'proj_123',
    name: 'Current Project',
    rows: [{ id: 1, s: 0, e: 2, t: 'Text', v: 0, sp: 1, ok: false }]
  };
  const result2 = migrateProject(currentProj);
  assert.strictEqual(result2.migrated, false);
  assert.strictEqual(result2.fromVersion, 1);
  assert.strictEqual(result2.toVersion, 1);
  assert.strictEqual(result2.project.rows.length, 1);
  console.log('  ✓ Current schema pass-through PASSED');

  // Test 3: Invalid data structure rejection
  console.log('[3/4] Testing invalid data structure rejection...');
  assert.throws(() => migrateProject(null), /expected an object/);
  assert.throws(() => migrateProject('not a project'), /expected an object/);
  console.log('  ✓ Invalid structure rejection PASSED');

  // Test 4: Missing optional media and metadata normalization
  console.log('[4/4] Testing metadata and media normalization...');
  const sparseProj = { schemaVersion: 0 };
  const result4 = migrateProject(sparseProj);
  assert.strictEqual(result4.project.duration, 0);
  assert.strictEqual(Array.isArray(result4.project.rows), true);
  console.log('  ✓ Normalization PASSED');

  console.log('\n==============================================');
  console.log('🎉 ALL SCHEMA MIGRATION TESTS PASSED (100%)');
  console.log('==============================================\n');
}

runSchemaMigrationTests();
