const assert = require('assert');
const ttsService = require('../src/main/services/providers/tts');
const { calculateSyncEnd } = require('../src/main/services/timing/auto-fit');

console.log('=== Verifying TTS Voiceover & Timing Engine Improvements ===\n');

// Test 1: Khmer Pacing Smoothing
console.log('► [1/3] Testing Khmer Natural Breath & Pacing Smoothing...');
const longKhmerText = 'ខ្ញុំបានដើរទៅកាន់ផ្សារធំថ្មី ហើយបានជួបមិត្តភក្តិចាស់ដែលមិនបានជួបគ្នាយូរណាស់មកហើយ';
const smoothed = ttsService.smoothKhmerPacing(longKhmerText);
assert(smoothed.includes(', ហើយ'), 'Must insert natural breath pause before conjunction');
console.log('  Original:', longKhmerText);
console.log('  Smoothed:', smoothed);
console.log('  ✓ PASSED: Natural breath smoothing successfully applied\n');

// Test 2: Smart Neural Rate Pre-acceleration
console.log('► [2/3] Testing Smart Neural Rate Estimation for Edge-TTS...');
const shortSlotText = 'ខ្ញុំចង់ប្រាប់អ្នកថាពួកយើងត្រូវតែប្រញាប់ឡើងកុំនៅយូរពេក'; // ~55 chars -> ~4.2s
const normalRate = ttsService.computeSmartNeuralRate(shortSlotText, 5.0, '+0%', 1.0, 'med');
assert.strictEqual(normalRate, '+0%', 'Should not accelerate when text fits comfortably in slot');

const acceleratedRate = ttsService.computeSmartNeuralRate(shortSlotText, 2.5, '+0%', 1.0, 'med');
assert(acceleratedRate !== '+0%', 'Should accelerate when estimated reading time significantly exceeds slot');
assert(acceleratedRate.startsWith('+'), 'Rate should be positive speedup');
console.log(`  Short slot (2.5s) for 55 chars -> Predicted native neural rate: ${acceleratedRate}`);
console.log('  ✓ PASSED: Native neural rate pre-acceleration verified\n');

// Test 3: Smart Natural Lip-Sync Onset Alignment
console.log('► [3/3] Testing Natural Lip-Sync Onset Alignment...');
const naturalSync = calculateSyncEnd({
  start: 2.0,
  end: 6.0,
  clipDuration: 2.0,
  syncEnd: true,
  alignMode: 'natural'
});
assert.strictEqual(naturalSync.clipStart, 2.0, 'In natural mode, audio should start promptly at video cue start');
assert.strictEqual(naturalSync.clipEnd, 4.0, 'Clip should finish at start + duration');

const classicSync = calculateSyncEnd({
  start: 2.0,
  end: 6.0,
  clipDuration: 2.0,
  syncEnd: true,
  alignMode: 'anchor_end'
});
assert.strictEqual(classicSync.clipStart, 4.0, 'In classic anchor_end mode, audio anchors to end of slot');
assert.strictEqual(classicSync.clipEnd, 6.0);
console.log('  Natural align start:', naturalSync);
console.log('  Classic anchor end:', classicSync);
console.log('  ✓ PASSED: Both natural lip-sync onset and anchor_end alignment verified\n');

console.log('🎉 ALL TTS & TIMING ENGINE IMPROVEMENT CHECKS PASSED (100%)\n');
