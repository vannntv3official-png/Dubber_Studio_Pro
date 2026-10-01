/**
 * Unit & Integration Tests for Milestone 7:
 * Audio Mixing (adelay, amix, sidechain ducking, volume, pitch, reverb, crowd),
 * Video Overlay Filters (blur hard-subs, watermark),
 * Intro/Outro concatenation, and MP4 Export.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../src/main/services/ffmpeg');
const audioMixer = require('../src/main/services/mixing/audio-mixer');
const videoEffects = require('../src/main/services/effects/video-effects');
const introOutroService = require('../src/main/services/export/intro-outro');
const exportService = require('../src/main/services/export');

const TEST_OUT_DIR = path.join(__dirname, 'temp_m7_test');

async function runTests() {
  console.log('--- Starting Milestone 7 Audio Mixing & Video Export Tests ---');
  if (!fs.existsSync(TEST_OUT_DIR)) {
    fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  }

  // 1. Generate sample audio clips for testing
  console.log('\n[1/7] Generating synthetic test audio clips...');
  const clip1 = path.join(TEST_OUT_DIR, 'clip1.wav');
  const clip2 = path.join(TEST_OUT_DIR, 'clip2.wav');
  const bgmTrack = path.join(TEST_OUT_DIR, 'test_bgm.wav');
  const testVideo = path.join(TEST_OUT_DIR, 'test_video.mp4');

  await ffmpegService.generateSineTone(clip1, 440, 2.0); // 2s tone
  await ffmpegService.generateSineTone(clip2, 880, 1.5); // 1.5s tone
  await ffmpegService.generateSineTone(bgmTrack, 220, 6.0); // 6s BGM tone
  assert(fs.existsSync(clip1) && fs.statSync(clip1).size > 1000, 'clip1 should exist');
  assert(fs.existsSync(clip2) && fs.statSync(clip2).size > 1000, 'clip2 should exist');
  assert(fs.existsSync(bgmTrack) && fs.statSync(bgmTrack).size > 1000, 'bgmTrack should exist');
  console.log('✓ Synthetic audio clips generated');

  // Generate synthetic test video (5 seconds, 640x360 with color bars and silence)
  const { execFile } = require('child_process');
  await new Promise((resolve, reject) => {
    execFile(ffmpegService.ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=5:size=640x360:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=300:duration=5',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      testVideo
    ], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  assert(fs.existsSync(testVideo) && fs.statSync(testVideo).size > 1000, 'testVideo should exist');
  console.log('✓ Synthetic test video generated');

  // 2. Test Audio Mixer: buildDubTrack
  console.log('\n[2/7] Testing audioMixer.buildDubTrack (adelay & amix)...');
  const dubOutput = path.join(TEST_OUT_DIR, 'assembled_dub.wav');
  const testSegments = [
    { id: 1, s: 0.5, e: 2.5, clipStart: 0.5, audioPath: clip1, ok: true },
    { id: 2, s: 3.0, e: 4.5, clipStart: 3.0, audioPath: clip2, ok: true }
  ];

  await audioMixer.buildDubTrack(testSegments, dubOutput, 5.0);
  assert(fs.existsSync(dubOutput), 'assembled_dub.wav should be created');
  const dubMeta = await ffmpegService.probeMedia(dubOutput);
  console.log(`✓ Assembled dub track duration: ${dubMeta.duration.toFixed(2)}s (Channels: ${dubMeta.audio?.channels || 2})`);
  assert(dubMeta.duration >= 4.0, 'Dub track should span across scheduled segments');

  // 3. Test Audio Mixer: buildFinalMasterAudio (Sidechain Ducking & DSP)
  console.log('\n[3/7] Testing audioMixer.buildFinalMasterAudio with sidechain ducking & DSP...');
  const masterAudioOutput = path.join(TEST_OUT_DIR, 'master_mix.wav');
  await audioMixer.buildFinalMasterAudio({
    dubAudioPath: dubOutput,
    originalAudioPath: null,
    bgmAudioPath: bgmTrack,
    outputPath: masterAudioOutput,
    options: {
      ducking: true,
      volume: 1.1,
      reverb: true,
      pitch: 2, // +2 semitones
      crowd: true
    },
    totalDuration: 5.0
  });

  assert(fs.existsSync(masterAudioOutput), 'master_mix.wav should be created');
  const masterMeta = await ffmpegService.probeMedia(masterAudioOutput);
  console.log(`✓ Master mixed audio duration: ${masterMeta.duration.toFixed(2)}s`);
  assert(masterMeta.duration >= 4.5, 'Master audio should match target duration');

  // 4. Test Video Effects filter builder
  console.log('\n[4/7] Testing videoEffects.buildFilter...');
  const fNone = videoEffects.buildFilter({ blurHardSubs: false, watermark: false });
  assert.strictEqual(fNone.needsReencode, false, 'No filters should not require re-encode');
  assert.strictEqual(fNone.filterString, null, 'No filters should have null filterString');

  const fBlur = videoEffects.buildFilter({ blurHardSubs: true, watermark: false });
  assert.strictEqual(fBlur.needsReencode, true, 'Blur filter must require re-encode');
  assert(fBlur.filterString.includes('avgblur'), 'Filter must contain avgblur');
  assert(fBlur.filterString.includes('overlay'), 'Filter must contain overlay');

  const fWm = videoEffects.buildFilter({ blurHardSubs: false, watermark: true, watermarkText: 'Studio Dub' });
  assert.strictEqual(fWm.needsReencode, true, 'Watermark must require re-encode');
  assert(fWm.filterString.includes('drawtext'), 'Filter must contain drawtext');
  assert(fWm.filterString.includes('Studio Dub'), 'Filter must include watermark text');

  const fBoth = videoEffects.buildFilter({ blurHardSubs: true, watermark: true, watermarkText: 'Khmer Dub' });
  assert.strictEqual(fBoth.needsReencode, true, 'Both filters must require re-encode');
  assert(fBoth.filterString.includes('avgblur') && fBoth.filterString.includes('drawtext'), 'Must chain both filters');
  console.log('✓ All video filter complexes verified');

  // 5. Test Export Service: Stream Copy Export
  console.log('\n[5/7] Testing ExportService with Stream Copy (-c:v copy)...');
  const streamCopyOut = path.join(TEST_OUT_DIR, 'exported_stream_copy.mp4');
  let streamCopyProgressCalls = 0;

  const copyRes = await exportService.exportVideo({
    videoPath: testVideo,
    segments: testSegments,
    bgmPath: bgmTrack,
    outputPath: streamCopyOut,
    options: {
      blurHardSubs: false,
      watermark: false,
      ducking: true
    },
    projectDir: TEST_OUT_DIR,
    onProgress: (p) => {
      streamCopyProgressCalls++;
    }
  });

  assert(copyRes.success, 'Export should succeed');
  assert(fs.existsSync(streamCopyOut), 'Output MP4 should exist');
  const copyProbe = await ffmpegService.probeMedia(streamCopyOut);
  console.log(`✓ Stream copy export finished. Duration: ${copyProbe.duration.toFixed(2)}s, Resolution: ${copyProbe.video.width}x${copyProbe.video.height}`);
  assert(copyProbe.hasVideo && copyProbe.hasAudio, 'Exported MP4 must contain both video and audio');
  assert(streamCopyProgressCalls > 0, 'Progress callback should be invoked');

  // 6. Test Export Service: Re-encode with Blur Hard-subs & Watermark
  console.log('\n[6/7] Testing ExportService with Re-encode (Blur Hard-subs + Watermark)...');
  const reencodeOut = path.join(TEST_OUT_DIR, 'exported_reencode_effects.mp4');
  let reencodeProgressCalls = 0;

  const effectRes = await exportService.exportVideo({
    videoPath: testVideo,
    segments: testSegments,
    bgmPath: bgmTrack,
    outputPath: reencodeOut,
    options: {
      blurHardSubs: true,
      watermark: true,
      watermarkText: 'AI Dub Studio PRO',
      preset: 'ultrafast',
      ducking: true
    },
    projectDir: TEST_OUT_DIR,
    onProgress: (p) => {
      reencodeProgressCalls++;
    }
  });

  assert(effectRes.success, 'Re-encode export should succeed');
  assert(fs.existsSync(reencodeOut), 'Re-encoded MP4 should exist');
  const effectProbe = await ffmpegService.probeMedia(reencodeOut);
  console.log(`✓ Re-encoded MP4 finished. Duration: ${effectProbe.duration.toFixed(2)}s, Size: ${(fs.statSync(reencodeOut).size / 1024).toFixed(1)} KB`);
  assert(effectProbe.hasVideo && effectProbe.hasAudio, 'Re-encoded MP4 must have video and audio');
  assert(reencodeProgressCalls > 0, 'Progress callback should be invoked during re-encoding');

  // 7. Test Intro / Outro Concatenation
  console.log('\n[7/7] Testing Intro/Outro concatenation...');
  const introVideo = path.join(TEST_OUT_DIR, 'intro_clip.mp4');
  // Generate 2s intro clip
  await new Promise((resolve, reject) => {
    execFile(ffmpegService.ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=blue:size=640x360:duration=2:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      introVideo
    ], err => err ? reject(err) : resolve());
  });

  const concatOut = path.join(TEST_OUT_DIR, 'concatenated_video.mp4');
  await introOutroService.concatenateVideoSegments({
    mainVideoPath: streamCopyOut,
    introPath: introVideo,
    outputPath: concatOut
  });

  assert(fs.existsSync(concatOut), 'Concatenated video must exist');
  const concatProbe = await ffmpegService.probeMedia(concatOut);
  console.log(`✓ Concatenated video duration: ${concatProbe.duration.toFixed(2)}s (Main ~5s + Intro ~2s)`);
  assert(concatProbe.duration >= 6.5, 'Concatenated video should be around 7 seconds');

  // Cleanup test artifacts
  console.log('\nCleaning up temporary test files...');
  try {
    fs.rmSync(TEST_OUT_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n🎉 ALL MILESTONE 7 UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! (7/7)\n');
}

runTests().catch(err => {
  console.error('\n❌ Milestone 7 Test Error:', err);
  process.exit(1);
});
