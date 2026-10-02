/**
 * Project Schema Migration Runner
 * Ensures backward compatibility across project schema revisions.
 */

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migration definitions: maps sourceVersion -> migrationFunction(project)
 */
const MIGRATIONS = {
  // Legacy unversioned (v0) -> Schema v1
  0: (p) => {
    p.schemaVersion = 1;
    if (!p.id) p.id = `proj_${Date.now()}`;
    if (!p.rows || !Array.isArray(p.rows)) p.rows = [];
    if (!p.media || typeof p.media !== 'object') p.media = {};
    if (!p.meta || typeof p.meta !== 'object') p.meta = {};
    if (typeof p.duration !== 'number') p.duration = 0;
    return p;
  }
};

/**
 * Validates and migrates any project data structure up to CURRENT_SCHEMA_VERSION.
 * @param {object} rawProject
 * @returns {{ migrated: boolean, fromVersion: number, toVersion: number, project: object }}
 */
function migrateProject(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    throw new Error('Invalid project data structure: expected an object');
  }

  const project = JSON.parse(JSON.stringify(rawProject));
  const fromVersion = typeof project.schemaVersion === 'number' ? project.schemaVersion : 0;
  let currentVersion = fromVersion;
  let migrated = false;

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migrateStep = MIGRATIONS[currentVersion];
    if (typeof migrateStep === 'function') {
      migrateStep(project);
      migrated = true;
      currentVersion = project.schemaVersion;
    } else {
      project.schemaVersion = CURRENT_SCHEMA_VERSION;
      migrated = true;
      break;
    }
  }

  // Final schema integrity assertions
  if (!Array.isArray(project.rows)) project.rows = [];
  if (!project.media || typeof project.media !== 'object') project.media = {};

  return {
    migrated,
    fromVersion,
    toVersion: project.schemaVersion,
    project
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  migrateProject
};
