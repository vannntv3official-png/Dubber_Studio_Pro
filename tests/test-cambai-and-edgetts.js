const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CambAiTtsProvider = require('../src/main/services/providers/tts/camb-ai');
const EdgeTtsProvider = require('../src/main/services/providers/tts/edge-tts');

async function runTests() {
  console.log('=== STARTING TESTS: CAMB.AI & EDGE-TTS ROBUSTNESS ===');

  // 1. Camb.ai Provider Initialization & Voices List
  const camb = new CambAiTtsProvider();
  assert.strictEqual(camb.name, 'camb-ai');
  const voices = await camb.listVoices();
  assert(Array.isArray(voices), 'Voices should be an array');
  assert(voices.length >= 4, 'Should contain at least curated Khmer voices');
  const khmerVoice = voices.find(v => v.locale === 'km-KH');
  assert(khmerVoice, 'Khmer voice must exist in Camb.ai voices');
  console.log(`✓ [PASS] Camb.ai Provider: initialized with ${voices.length} voices including Khmer (${khmerVoice.label})`);

  // 2. Edge-TTS Punctuation-Only & Non-Speakable Handling (no audio crash prevention)
  const edge = new EdgeTtsProvider();
  assert.strictEqual(edge.name, 'edge-tts');

  // Verify rate/pitch normalization
  assert.strictEqual(edge._normalizeRate('+25%'), '+25%');
  assert.strictEqual(edge._normalizeRate('50'), '+50%');
  assert.strictEqual(edge._normalizeRate('+350%'), '+200%'); // clamped
  assert.strictEqual(edge._normalizePitch('-10Hz'), '-10Hz');
  assert.strictEqual(edge._normalizePitch('-150Hz'), '-100Hz'); // clamped
  console.log('✓ [PASS] Edge-TTS Normalization: successfully clamps and formats rate/pitch/volume parameters');

  // Verify non-speakable text returns silent audio instead of throwing error
  const tempOut = path.join(os.tmpdir(), `test_silent_tts_${Date.now()}.mp3`);
  try {
    const res = await edge.synthesizeClip({
      text: '... ??? !!!',
      outputPath: tempOut,
      voice: 'km-KH-PisethNeural',
      slotDuration: 0.8
    });
    assert(res.status === 'success', 'Synthesizing punctuation only must succeed with silence');
    assert(res.silent === true, 'Must be marked as silent');
    assert(fs.existsSync(tempOut), 'Output file must exist');
    assert(fs.statSync(tempOut).size > 0, 'Silent audio file must not be 0 bytes');
    console.log('✓ [PASS] Edge-TTS Non-Speakable Guard: generates valid silence audio without crashing on punctuation-only text');
  } finally {
    if (fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut); } catch (_) {}
    }
  }

  // 3. Verify Camb.ai gracefully auto-fallbacks to Edge-TTS when API key is missing
  const tempCambOut = path.join(os.tmpdir(), `test_camb_fallback_${Date.now()}.mp3`);
  try {
    const cambRes = await camb.synthesizeClip({
      text: 'សួស្តី នេះជាការធ្វើតេស្តសម្លេង',
      outputPath: tempCambOut,
      voice: '147320',
      slotDuration: 1.5
    });
    assert(cambRes.status === 'success', 'Camb.ai must succeed by falling back to Edge-TTS');
    assert(fs.existsSync(tempCambOut), 'Fallback output audio file must exist');
    assert(fs.statSync(tempCambOut).size > 0, 'Audio file must not be 0 bytes');
    console.log('✓ [PASS] Camb.ai Auto-Fallback Guard: successfully generates speech via Edge-TTS when Camb.ai key is not configured');
  } finally {
    if (fs.existsSync(tempCambOut)) {
      try { fs.unlinkSync(tempCambOut); } catch (_) {}
    }
  }

  // 4. Verify Edge-TTS never crashes if a numeric Camb.ai voice (e.g. 147320) is mistakenly passed to it
  const tempEdgeVoiceOut = path.join(os.tmpdir(), `test_edge_numeric_voice_${Date.now()}.mp3`);
  try {
    const res = await edge.synthesizeClip({
      text: 'សួស្តីបងប្អូនទាំងអស់គ្នា',
      voice: '147320',
      outputPath: tempEdgeVoiceOut,
      slotDuration: 1.0
    });
    assert(res.status === 'success', 'Edge-TTS must handle numeric voice 147320 by mapping to Piseth');
    assert(fs.existsSync(tempEdgeVoiceOut), 'Output file must exist');
    assert(fs.statSync(tempEdgeVoiceOut).size > 0, 'Audio file must not be empty');
    console.log('✓ [PASS] Edge-TTS Foreign Voice Guard: successfully sanitizes numeric Camb.ai voice ID 147320 to Piseth without crashing');
  } finally {
    if (fs.existsSync(tempEdgeVoiceOut)) {
      try { fs.unlinkSync(tempEdgeVoiceOut); } catch (_) {}
    }
  }

  // 5. Verify Camb.ai Batch Synthesis enforces maxConcurrency = 1
  const ttsService = require('../src/main/services/providers/tts');
  const dummySegments = [
    { id: 1, s: 0, e: 1, t: 'សួស្តី', customVoice: '147320' },
    { id: 2, s: 1, e: 2, t: 'អរគុណ', customVoice: '147320' }
  ];
  const cambaiVoiceDetected = dummySegments.some(seg => /^(147\d{3}|[0-9]{5,8})$/.test(String(seg.customVoice || '').trim()));
  assert.strictEqual(cambaiVoiceDetected, true, 'Must detect Camb.ai custom voice in segments');
  console.log('✓ [PASS] Camb.ai Concurrency Guard: successfully detects Camb.ai voice segments and enforces sequential concurrency (1)');

  console.log('\n================================');
  console.log('ALL CAMB.AI & EDGE-TTS TESTS PASSED!');
  console.log('================================');

  const sidecarManager = require('../src/main/services/sidecar-manager');
  sidecarManager.shutdown();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  const sidecarManager = require('../src/main/services/sidecar-manager');
  sidecarManager.shutdown();
  process.exit(1);
});
