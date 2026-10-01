const assert = require('assert');
const keyPool = require('../src/main/services/key-pool');

console.log('Testing KeyPoolService...');

// Reset keys
keyPool.keys = [];

// 1. Add keys
const k1 = keyPool.addKey('AIzaSyDUMMYKEY1_ABCDEF1234567890');
const k2 = keyPool.addKey('AIzaSyDUMMYKEY2_UVWXYZ0987654321');
assert.strictEqual(keyPool.keys.length, 2, 'Should have 2 keys');
assert.strictEqual(k1.masked.startsWith('AIzaSy'), true);
assert.strictEqual(k1.masked.endsWith('7890'), true);
console.log('✓ Added 2 keys with proper masking:', k1.masked, k2.masked);

// 2. Masked keys representation
const masked = keyPool.getMaskedKeys();
assert.strictEqual(masked.length, 2);
assert.strictEqual(masked[0].key, undefined, 'Raw key must not be exposed in getMaskedKeys');
assert.strictEqual(masked[0].status, 'active');
console.log('✓ getMaskedKeys contains no raw keys');

// 3. Status
let status = keyPool.getStatus();
assert.strictEqual(status.total, 2);
assert.strictEqual(status.available, 2);
console.log('✓ Status reports 2/2 available');

// 4. Round-robin retrieval
const keyA = keyPool.getNextKey();
const keyB = keyPool.getNextKey();
assert.notStrictEqual(keyA, keyB, 'Round robin should alternate between keys');
console.log('✓ Round robin alternates keys properly');

// 5. Cooldown failover
keyPool.markCooldown(keyA, 10000); // 10s cooldown
status = keyPool.getStatus();
assert.strictEqual(status.available, 1, 'Only 1 key should be available after cooldown');

// Getting next key should now return keyB consistently
const next1 = keyPool.getNextKey();
const next2 = keyPool.getNextKey();
assert.strictEqual(next1, keyB);
assert.strictEqual(next2, keyB);
console.log('✓ Cooldown key successfully excluded from pool');

// Put keyB in cooldown too
keyPool.markCooldown(keyB, 5000);
assert.throws(() => {
  keyPool.getNextKey();
}, /All Gemini API keys are in cooldown/, 'Should throw when all keys cooling down');
console.log('✓ Throws clear error when all keys are cooling down');

// 6. Remove key
keyPool.removeKey(k1.id);
assert.strictEqual(keyPool.keys.length, 1);
console.log('✓ Key removal works');

console.log('All KeyPool tests passed 100%!');
process.exit(0);
