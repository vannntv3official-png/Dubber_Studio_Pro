/**
 * Master Video Export Service
 * Integrates audio mixing, BGM ducking, video filter complexes (hard-sub blur & watermark),
 * intro/outro concatenation, and real-time FFmpeg progress reporting.
 */

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../ffmpeg');
const audioMixer = require('../mixing/audio-mixer');
const videoEffects = require('../effects/video-effects');
const introOutroService = require('./intro-outro');
const logger = require('../../utils/logger');

class ExportService {
  constructor() {
    this.ffmpegPath = ffmpegService.ffmpegPath;
    this.activeProcess = null;
    this.isCancelled = false;
  }

  /**
   * Parses FFmpeg time string "00:01:23.45" into total seconds
   */
  parseTimeString(str) {
    if (!str) return 0;
    const parts = str.trim().split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]) || 0;
      const minutes = parseFloat(parts[1]) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }

  /**
   * Render and export final dubbed MP4 video
   */
  async exportVideo({
    videoPath,
    segments = [],
    bgmPath = null,
    originalAudioPath = null,
    outputPath,
    options = {},
    projectDir = null,
    onProgress = null
  }) {
    this.isCancelled = false;
    logger.info(`Starting video export: ${videoPath} -> ${outputPath}`);

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const tempDir = projectDir
      ? path.join(projectDir, 'temp_export')
      : path.join(outDir, '.temp_export');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      if (onProgress) onProgress({ percent: 5, message: 'Probing video streams...' });
      const videoMeta = await ffmpegService.probeMedia(videoPath);
      const totalDuration = videoMeta.duration || 10;

      // Stage 1: Assembled Dub Vocal Track
      if (this.isCancelled) throw new Error('Export cancelled');
      if (onProgress) onProgress({ percent: 15, message: 'Assembling dubbed dialogue clips...' });

      const dubWavPath = path.join(tempDir, 'assembled_dub.wav');
      await audioMixer.buildDubTrack(segments, dubWavPath, totalDuration);

      // Stage 2: Master Audio Mixing with Ducking & DSP Effects
      if (this.isCancelled) throw new Error('Export cancelled');
      if (onProgress) onProgress({ percent: 30, message: 'Mixing master audio (ducking, BGM, effects)...' });

      const masterAudioPath = path.join(tempDir, 'master_mix.wav');
      await audioMixer.buildFinalMasterAudio({
        dubAudioPath: dubWavPath,
        originalAudioPath,
        bgmAudioPath: bgmPath,
        outputPath: masterAudioPath,
        options,
        totalDuration
      });

      // Stage 3: Video Overlay Filters (Blur Hard-subs, Watermark & Burn Subtitles)
      let subAssPath = null;
      if (options.burnSubtitles && Array.isArray(segments) && segments.length > 0) {
        subAssPath = path.join(tempDir, 'subtitles_burned.ass');
        const assData = videoEffects.generateAssFileContent(segments, options.subtitlePreset || 'tiktok-yellow');
        fs.writeFileSync(subAssPath, assData, 'utf8');
      }

      const filterResult = videoEffects.buildFilter({
        blurHardSubs: Boolean(options.blurHardSubs),
        blurBox: options.blurBox,
        watermark: Boolean(options.watermark),
        watermarkText: options.watermarkText || 'AI Dubbing Studio',
        watermarkImage: options.watermarkImage,
        watermarkXPercent: options.watermarkXPercent,
        watermarkYPercent: options.watermarkYPercent,
        burnSubtitles: Boolean(options.burnSubtitles),
        subtitleFilePath: subAssPath
      });

      const hasVideoFilters = filterResult.needsReencode;
      const hasIntroOutro = Boolean(options.introPath || options.outroPath);

      // Stage 4: Render Video with New Master Audio
      if (this.isCancelled) throw new Error('Export cancelled');
      if (onProgress) onProgress({ percent: 45, message: 'Rendering final MP4 container...' });

      const intermediateMp4 = hasIntroOutro
        ? path.join(tempDir, 'main_rendered.mp4')
        : outputPath;

      await this.runFfmpegMux({
        videoPath,
        masterAudioPath,
        filterResult,
        outputPath: intermediateMp4,
        totalDuration,
        options,
        onProgress: (p) => {
          if (onProgress) {
            // Scale render progress from 45% to 90%
            const scaled = Math.min(90, Math.max(45, Math.round(45 + (p.percent * 0.45))));
            onProgress({
              percent: scaled,
              fps: p.fps,
              timeSec: p.timeSec,
              totalSec: totalDuration,
              message: `Rendering video frames (${p.percent}%)...`
            });
          }
        }
      });

      // Stage 5: Concat Intro & Outro if specified
      if (hasIntroOutro) {
        if (this.isCancelled) throw new Error('Export cancelled');
        if (onProgress) onProgress({ percent: 92, message: 'Attaching intro and outro clips...' });

        await introOutroService.concatenateVideoSegments({
          mainVideoPath: intermediateMp4,
          introPath: options.introPath,
          outroPath: options.outroPath,
          outputPath
        });
      }

      if (onProgress) onProgress({ percent: 100, message: 'Video exported successfully!' });
      logger.info(`Video export completed successfully: ${outputPath}`);

      return {
        outputPath,
        success: true,
        duration: totalDuration
      };

    } finally {
      // Clean up temporary files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (_) {}
      this.activeProcess = null;
    }
  }

  /**
   * Muxes video stream and master audio track with real-time stderr progress tracking
   */
  runFfmpegMux({ videoPath, masterAudioPath, filterResult, outputPath, totalDuration, options, onProgress }) {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', videoPath,
        '-i', masterAudioPath
      ];

      const durArgs = (totalDuration && totalDuration > 0) ? ['-t', Number(totalDuration).toFixed(3)] : [];

      if (filterResult.needsReencode) {
        // Video re-encoding required due to filters
        args.push(
          '-filter_complex', filterResult.filterString,
          '-map', filterResult.outputLabel,
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', options.preset || 'veryfast',
          '-crf', '20',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', options.audioBitrate || '192k',
          ...durArgs,
          outputPath
        );
      } else {
        // Stream copy video when no filters (blazing fast export)
        args.push(
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', options.audioBitrate || '192k',
          ...durArgs,
          outputPath
        );
      }

      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      const proc = spawn(this.ffmpegPath, finalArgs);
      this.activeProcess = proc;

      let stderrLog = '';

      proc.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderrLog += text;

        if (onProgress && totalDuration > 0) {
          const timeMatch = text.match(/time=(\d+:\d+:\d+\.\d+)/);
          const fpsMatch = text.match(/fps=\s*(\d+(\.\d+)?)/);

          if (timeMatch) {
            const currentSec = this.parseTimeString(timeMatch[1]);
            const percent = Math.min(100, Math.round((currentSec / totalDuration) * 100));
            const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
            onProgress({ percent, timeSec: currentSec, fps });
          }
        }
      });

      proc.on('error', err => {
        this.activeProcess = null;
        reject(err);
      });

      proc.on('close', code => {
        this.activeProcess = null;
        if (this.isCancelled) {
          if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch (_) {}
          }
          return reject(new Error('Export cancelled by user'));
        }

        if (code === 0) {
          resolve(outputPath);
        } else {
          logger.error('FFmpeg export mux error', { code, stderr: stderrLog.slice(-500) });
          reject(new Error(`FFmpeg exited with error code ${code}`));
        }
      });
    });
  }

  cancel() {
    this.isCancelled = true;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGKILL');
      } catch (_) {}
      this.activeProcess = null;
    }
  }
}

const exportService = new ExportService();
module.exports = exportService;
