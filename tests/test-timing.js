/**
 * Unit Test for Timing, Auto-Fit Math & FFmpeg atempo Filter Chaining
 * Covers PROMPT.md requirements:
 * - atempo chain builder (chaining when outside [0.5, 2.0])
 * - auto-fit modes (Off, Low, Med, High)
 * - overflow calculation and tolerance
 * - sync-end alignment
 */

const assert = require('assert');
const {
  buildAtempoChain,
  calculateAutoFit,
  calculateSyncEnd,
  AUTO_FIT_MODES
} = require('../src/main/services/timing/auto-fit');

console.log('--- Running Timing & Auto-Fit Unit Tests ---');

// Test 1: Normal tempo inside [0.5, 2.0]
{
  const chain1 = buildAtempoChain(1.25);
  assert.strictEqual(chain1.length, 1);
  assert.strictEqual(chain1[0], 'atempo=1.2500');

  const chainNormal = buildAtempoChain(1.0);
  assert.strictEqual(chainNormal.length, 0, 'No filter needed for 1.0x tempo');
  console.log('✓ Test 1 Passed: Standard atempo range');
}

// Test 2: High tempo chaining (> 2.0x)
{
  // 3.0x tempo: 2.0 * 1.5 = 3.0
  const chain3x = buildAtempoChain(3.0);
  assert.strictEqual(chain3x.length, 2);
  assert.strictEqual(chain3x[0], 'atempo=2.0000');
  assert.strictEqual(chain3x[1], 'atempo=1.5000');

  // 4.5x tempo: 2.0 * 2.0 * 1.125 = 4.5
  const chain45x = buildAtempoChain(4.5);
  assert.strictEqual(chain45x.length, 3);
  assert.strictEqual(chain45x[0], 'atempo=2.0000');
  assert.strictEqual(chain45x[1], 'atempo=2.0000');
  assert.strictEqual(chain45x[2], 'atempo=1.1250');
  console.log('✓ Test 2 Passed: High tempo chaining (>2.0x)');
}

// Test 3: Low tempo chaining (< 0.5x)
{
  // 0.2x tempo: 0.5 * 0.5 * 0.8 = 0.2
  const chain02x = buildAtempoChain(0.2);
  assert.strictEqual(chain02x.length, 3);
  assert.strictEqual(chain02x[0], 'atempo=0.5000');
  assert.strictEqual(chain02x[1], 'atempo=0.5000');
  assert.strictEqual(chain02x[2], 'atempo=0.8000');
  console.log('✓ Test 3 Passed: Low tempo chaining (<0.5x)');
}

// Test 4: Auto-Fit Mode: Off
{
  // Audio is 3.0s, slot is 2.0s. Off mode should not apply speedup
  const res = calculateAutoFit({ clipDuration: 3.0, slotDuration: 2.0, mode: 'off' });
  assert.strictEqual(res.appliedTempo, 1.0);
  assert.strictEqual(res.finalDuration, 3.0);
  assert.strictEqual(res.overflow, true);
  assert.strictEqual(res.overflowDelta, 1.0);
  assert.strictEqual(res.atempoChain.length, 0);
  console.log('✓ Test 4 Passed: Auto-Fit Mode Off');
}

// Test 5: Auto-Fit Mode: Med (Max rate 1.30)
{
  // Audio is 2.4s, slot is 2.0s -> Needed tempo = 1.20 (within 1.30)
  const fits = calculateAutoFit({ clipDuration: 2.4, slotDuration: 2.0, mode: 'med' });
  assert.strictEqual(fits.appliedTempo, 1.2);
  assert.strictEqual(fits.finalDuration, 2.0);
  assert.strictEqual(fits.overflow, false);
  assert.strictEqual(fits.overflowDelta, 0);

  // Audio is 4.0s, slot is 2.0s -> Needed tempo = 2.0, clamped to 1.30
  const clamped = calculateAutoFit({ clipDuration: 4.0, slotDuration: 2.0, mode: 'med' });
  assert.strictEqual(clamped.appliedTempo, 1.3);
  assert.strictEqual(clamped.overflow, true);
  assert.ok(clamped.overflowDelta > 1.0, 'Overflow delta should be approx 1.08s');
  console.log('✓ Test 5 Passed: Auto-Fit Mode Med with Clamping & Overflow');
}

// Test 6: Auto-Fit Mode: High (Max rate 2.00)
{
  // Audio is 3.6s, slot is 2.0s -> Needed tempo = 1.80 (within 2.00)
  const res = calculateAutoFit({ clipDuration: 3.6, slotDuration: 2.0, mode: 'high' });
  assert.strictEqual(res.appliedTempo, 1.8);
  assert.strictEqual(res.finalDuration, 2.0);
  assert.strictEqual(res.overflow, false);
  console.log('✓ Test 6 Passed: Auto-Fit Mode High');
}

// Test 7: Clip already shorter than slot
{
  const res = calculateAutoFit({ clipDuration: 1.5, slotDuration: 2.5, mode: 'med' });
  assert.strictEqual(res.appliedTempo, 1.0);
  assert.strictEqual(res.finalDuration, 1.5);
  assert.strictEqual(res.overflow, false);
  assert.strictEqual(res.overflowDelta, 0);
  console.log('✓ Test 7 Passed: Clip naturally shorter than slot');
}

// Test 8: Sync End Alignment
{
  // Slot: 2.0 to 5.0 (dur 3.0s). Clip is 2.0s.
  // With Sync End, clip anchors to end: starts at 3.0, ends at 5.0
  const sync = calculateSyncEnd({ start: 2.0, end: 5.0, clipDuration: 2.0, syncEnd: true });
  assert.strictEqual(sync.clipStart, 3.0);
  assert.strictEqual(sync.clipEnd, 5.0);
  assert.strictEqual(sync.trimmed, false);

  // Without Sync End: starts at 2.0, ends at 4.0
  const noSync = calculateSyncEnd({ start: 2.0, end: 5.0, clipDuration: 2.0, syncEnd: false });
  assert.strictEqual(noSync.clipStart, 2.0);
  assert.strictEqual(noSync.clipEnd, 4.0);

  // Sync End with next segment constraint
  const constrained = calculateSyncEnd({
    start: 2.0,
    end: 5.0,
    clipDuration: 4.0,
    nextStart: 5.5,
    syncEnd: true
  });
  assert.strictEqual(constrained.clipStart, 2.0);
  assert.ok(constrained.clipEnd <= 5.5);
  console.log('✓ Test 8 Passed: Sync End Alignment & Clamping');
}

console.log('\nSUCCESS: All 8 Timing & Auto-Fit Unit Tests Passed!\n');
