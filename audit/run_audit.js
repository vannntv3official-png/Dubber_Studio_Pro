// Master Audit Runner
// Executes Method B (Dead-Control Scan) and Method C (End-to-End Workflow Audit)
// Safe: uses isolated profile (audit/profile), never touches src/ or real user data

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log('       AI DUBBING STUDIO — AUTOMATED FEATURE AUDIT SUITE        ');
console.log('================================================================\n');

const rootDir = path.resolve(__dirname, '..');

// 1. Generate fixtures
console.log('>>> [1/3] Verifying and generating audit fixtures...');
execSync('node audit/generate_fixtures.js', { cwd: rootDir, stdio: 'inherit' });

// 2. Run Method B (Dead-Control Scan)
console.log('\n>>> [2/3] Running Method B: Dead-Control Runtime Scan across 5 states...');
execSync('npx electron audit/dead_control_scan.js', { cwd: rootDir, stdio: 'inherit' });

// 3. Run Method C (End-to-End Workflow Audit)
console.log('\n>>> [3/3] Running Method C: End-to-End Workflow & Subsystem Audit...');
execSync('node audit/run_e2e_audit.js', { cwd: rootDir, stdio: 'inherit' });

console.log('\n================================================================');
console.log('       ALL AUDITS COMPLETED SUCCESSFULLY!                       ');
console.log('       Logs: audit/logs/                                        ');
console.log('       Screenshots: audit/screenshots/                          ');
console.log('       Reports: FEATURE_STATUS.md & FEATURE_MAP.md              ');
console.log('================================================================\n');
