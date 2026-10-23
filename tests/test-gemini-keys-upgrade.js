const keyPool = require('../src/main/services/key-pool');

// Test 1: Validation & Sanitization
try {
  keyPool.addKey('   "invalid-short-key"   ');
  console.error('Should have rejected short key');
  process.exit(1);
} catch (e) {
  console.log('Test 1 Passed: Rejected invalid key format:', e.message);
}

// Test 2: Sanitized Valid Key Add
const dummyKey = 'AIzaSy' + 'A'.repeat(33);
const added = keyPool.addKey('  "' + dummyKey + '",  ');
console.log('Test 2 Passed: Added key with sanitization:', added.masked);

// Test 3: Duplicate Rejection
try {
  keyPool.addKey(dummyKey);
  console.error('Should have rejected duplicate');
  process.exit(1);
} catch (e) {
  console.log('Test 3 Passed: Rejected duplicate key:', e.message);
}

// Test 4: Batch Add with Duplicates and Invalid
const batchRes = keyPool.addBatch([
  dummyKey, // duplicate
  'too-short', // invalid
  'AIzaSy' + 'B'.repeat(33) // valid
]);
console.log('Test 4 Passed: Batch add result:', batchRes);
if (batchRes.addedCount !== 1 || batchRes.duplicates !== 1 || batchRes.invalid !== 1) {
  console.error('Batch add counts mismatch');
  process.exit(1);
}

// Test 5: Cooldown and Reset
keyPool.markCooldown(dummyKey, 50000);
let masked = keyPool.getMaskedKeys();
const kEntry = masked.find(k => k.masked === added.masked);
console.log('Status under cooldown:', kEntry?.status);
if (kEntry?.status !== 'cooldown') {
  console.error('Cooldown status not detected');
  process.exit(1);
}

keyPool.resetCooldowns();
masked = keyPool.getMaskedKeys();
const kReset = masked.find(k => k.masked === added.masked);
console.log('Status after reset:', kReset?.status);
if (kReset?.status !== 'active') {
  console.error('Status after reset not active');
  process.exit(1);
}

// Clean up added test keys
keyPool.removeKey(added.id);
const bKey = keyPool.keys.find(k => k.key.includes('B'.repeat(30)));
if (bKey) keyPool.removeKey(bKey.id);

console.log('ALL GEMINI KEYS UNIT TESTS PASSED!');
