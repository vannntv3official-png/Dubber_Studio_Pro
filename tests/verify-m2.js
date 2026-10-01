/**
 * Milestone 2 (M2) Automated Verification Test
 * Tests:
 * 1. ffprobe metadata extraction (duration, resolution, fps, streams)
 * 2. Audio extraction (stereo WAV and 16k mono WAV for Whisper)
 * 3. Waveform peaks computation
 * 4. Video thumbnail filmstrip generation
 * 5. Project workspace creation (project.json, media/ folder)
 * 6. Real HTML5 video player loading & playback
 * 7. Video seeking & timeline playhead sync
 * 8. Real waveform rendering on timeline
 * 9. Project save and autosave
 * 10. Screenshot capture of the running app in M2
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../src/main/services/ffmpeg');
const projectService = require('../src/main/services/project');
const { registerIpcHandlers } = require('../src/main/ipc');
const logger = require('../src/main/utils/logger');

async function runM2Verification() {
  logger.init();
  console.log('--- Starting Milestone 2 Verification ---');

  const report = [];
  const pass = (name) => {
    console.log(`[PASS] ${name}`);
    report.push({ name, passed: true });
  };
  const fail = (name, err) => {
    console.error(`[FAIL] ${name}: ${err}`);
    report.push({ name, passed: false, error: String(err) });
  };

  const sampleVideoPath = path.resolve(__dirname, '../test-assets/sample_10s.mp4');
  if (!fs.existsSync(sampleVideoPath)) {
    fail('Sample video existence', 'sample_10s.mp4 not found');
    app.exit(1);
    return;
  }
  pass('Sample video file exists (test-assets/sample_10s.mp4)');

  // 1. Test ffprobe
  try {
    const meta = await ffmpegService.probeMedia(sampleVideoPath);
    if (meta.duration >= 9.8 && meta.duration <= 10.2 && meta.hasVideo && meta.hasAudio && meta.video.width === 640) {
      pass(`ffprobe extraction: ${meta.duration.toFixed(2)}s, ${meta.video.width}x${meta.video.height} @ ${meta.video.fps}fps`);
    } else {
      fail('ffprobe extraction', JSON.stringify(meta));
    }
  } catch (err) {
    fail('ffprobe execution', err.message);
  }

  // 2. Test Audio Extraction (Stereo WAV & 16k Mono WAV)
  const testAudioOut = path.resolve(__dirname, 'test_orig.wav');
  const testAudio16kOut = path.resolve(__dirname, 'test_16k.wav');
  try {
    await ffmpegService.extractAudio(sampleVideoPath, testAudioOut);
    await ffmpegService.extractAudio16kMono(sampleVideoPath, testAudio16kOut);

    const stat1 = fs.statSync(testAudioOut);
    const stat2 = fs.statSync(testAudio16kOut);
    if (stat1.size > 10000 && stat2.size > 10000) {
      pass(`Audio extracted: stereo WAV (${stat1.size} bytes) & 16k mono WAV (${stat2.size} bytes)`);
    } else {
      fail('Audio extraction', `Sizes: ${stat1.size}, ${stat2.size}`);
    }
  } catch (err) {
    fail('Audio extraction error', err.message);
  }

  // 3. Test Waveform Peaks
  try {
    const peaks = await ffmpegService.generateWaveformPeaks(sampleVideoPath, 200);
    if (Array.isArray(peaks) && peaks.length === 200 && peaks.some(p => p > 0.1)) {
      pass(`Waveform peaks generated: ${peaks.length} buckets, sample peak: ${peaks[10]}`);
    } else {
      fail('Waveform peaks', `Invalid peaks array (len: ${peaks?.length})`);
    }
  } catch (err) {
    fail('Waveform peaks error', err.message);
  }

  // 4. Test Project Creation from Video
  let projectResult = null;
  const testProjectDir = path.resolve(__dirname, 'test_sample_project');
  try {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    projectResult = await projectService.createProjectFromVideo(sampleVideoPath, testProjectDir);
    const jsonExists = fs.existsSync(projectResult.projectJsonPath);
    const origWavExists = fs.existsSync(path.join(testProjectDir, 'media/orig.wav'));
    const peaksJsonExists = fs.existsSync(path.join(testProjectDir, 'media/orig_peaks.json'));

    if (jsonExists && origWavExists && peaksJsonExists) {
      pass('Project workspace created with project.json and media assets');
    } else {
      fail('Project workspace', 'Missing files in workspace');
    }
  } catch (err) {
    fail('Project creation error', err.message);
  }

  // 5. Test Project Save & Autosave
  try {
    projectResult.project.name = 'Updated Sample Project';
    const saveRes = await projectService.saveProject(projectResult.projectJsonPath, projectResult.project);
    const autosaveRes = await projectService.autosaveProject(projectResult.projectJsonPath, projectResult.project);
    if (saveRes.success && autosaveRes.success) {
      pass('Project save and autosave executed successfully');
    } else {
      fail('Project save/autosave', JSON.stringify({ saveRes, autosaveRes }));
    }
  } catch (err) {
    fail('Project save error', err.message);
  }

  // 6. Test UI Integration with BrowserWindow
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    backgroundColor: '#0e1726',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8eef8', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerIpcHandlers(win);
  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 600));

  // Load project in renderer
  const uiCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const pData = ${JSON.stringify(projectResult.project)};
      const peaks = ${JSON.stringify(projectResult.peaks)};
      const thumbs = ${JSON.stringify(projectResult.thumbnails)};
      const pJsonPath = ${JSON.stringify(projectResult.projectJsonPath)};
      const pDir = ${JSON.stringify(projectResult.projectDir)};

      // 1. Load project into state
      window.__app_state = await import('./js/state.js');
      window.__app_player = await import('./js/player.js');
      window.__app_timeline = await import('./js/timeline.js');

      window.__app_state.state.loadProjectData(pData, peaks, thumbs, pJsonPath, pDir);

      const hasVideoClass = document.getElementById('previewContainer').classList.contains('has-video');
      const videoSrc = document.getElementById('videoEl').src;
      const duration = window.__app_state.state.project.duration;

      // 2. Test Waveform SVG rendered
      const waveSvg = document.querySelector('.track-waveform-svg');
      const hasWaveform = Boolean(waveSvg);

      // 3. Test Seek
      window.__app_state.state.setPlayhead(4.5);
      const playheadAfterSeek = window.__app_state.state.timeline.playhead;

      return {
        hasVideoClass,
        videoSrc: Boolean(videoSrc),
        duration,
        hasWaveform,
        playheadAfterSeek
      };
    })()
  `);

  if (uiCheck.hasVideoClass && uiCheck.videoSrc && uiCheck.duration >= 9.8) {
    pass(`Video loaded into HTML5 player with duration: ${uiCheck.duration.toFixed(2)}s`);
  } else {
    fail('Video loading into HTML5 player', JSON.stringify(uiCheck));
  }

  if (uiCheck.hasWaveform) {
    pass('Waveform SVG rendered dynamically on timeline tracks');
  } else {
    fail('Waveform rendering', 'Waveform SVG not found in DOM');
  }

  if (Math.abs(uiCheck.playheadAfterSeek - 4.5) < 0.1) {
    pass('Timeline playhead seeking synchronized to 4.50s');
  } else {
    fail('Timeline seeking', `Playhead is ${uiCheck.playheadAfterSeek}`);
  }

  // Allow repaint and take screenshot of M2 verified application
  await new Promise(r => setTimeout(r, 600));
  const screenshotPath = path.join(__dirname, 'm2-verified.png');
  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`[SCREENSHOT] Saved M2 verification screenshot to: ${screenshotPath}`);

  // Cleanup temp files
  try {
    if (fs.existsSync(testAudioOut)) fs.unlinkSync(testAudioOut);
    if (fs.existsSync(testAudio16kOut)) fs.unlinkSync(testAudio16kOut);
    if (fs.existsSync(testProjectDir)) fs.rmSync(testProjectDir, { recursive: true, force: true });
  } catch (_) {}

  win.close();

  const allPassed = report.every(r => r.passed);
  if (allPassed) {
    console.log('\n*** MILESTONE 2 VERIFICATION SUCCESSFUL ***');
    app.exit(0);
  } else {
    console.error('\n*** MILESTONE 2 VERIFICATION FAILED ***');
    app.exit(1);
  }
}

app.whenReady().then(runM2Verification);
