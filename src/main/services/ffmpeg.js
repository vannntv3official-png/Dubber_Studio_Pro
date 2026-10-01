const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class FfmpegService {
  constructor() {
    this.ffmpegPath = this.resolveBinary('ffmpeg');
    this.ffprobePath = this.resolveBinary('ffprobe');
    logger.info(`FFmpeg path: ${this.ffmpegPath}`);
    logger.info(`FFprobe path: ${this.ffprobePath}`);
  }

  resolveBinary(name) {
    const isWin = process.platform === 'win32';
    const exeName = isWin ? `${name}.exe` : name;

    // 1. Check extraResources / unpacked location (for production packaged app)
    if (process.resourcesPath) {
      const resourcePath = path.join(process.resourcesPath, 'bin', exeName);
      if (fs.existsSync(resourcePath)) return resourcePath;
    }

    // 2. Check ffmpeg-static / ffprobe-static npm modules
    try {
      if (name === 'ffmpeg') {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
      } else if (name === 'ffprobe') {
        const ffprobeStatic = require('ffprobe-static');
        if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
          return ffprobeStatic.path;
        }
      }
    } catch (_) {}

    // 3. Fallback to system command
    return exeName;
  }

  /**
   * Probe media file using ffprobe
   * Returns metadata: duration, dimensions, codecs, bitrates, audio stream info
   */
  probeMedia(filePath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }

      const args = [
        '-v', 'error',
        '-show_format',
        '-show_streams',
        '-print_format', 'json',
        filePath
      ];

      execFile(this.ffprobePath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          logger.error('ffprobe execution failed', { error: err.message, stderr });
          return reject(new Error(`ffprobe failed: ${err.message}`));
        }

        try {
          const info = JSON.parse(stdout);
          const format = info.format || {};
          const streams = info.streams || [];

          const videoStream = streams.find(s => s.codec_type === 'video');
          const audioStream = streams.find(s => s.codec_type === 'audio');

          const duration = parseFloat(format.duration || (videoStream && videoStream.duration) || 0);

          let fps = 30;
          if (videoStream && videoStream.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split('/');
            if (parts.length === 2 && parseFloat(parts[1]) > 0) {
              fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
            }
          }

          const result = {
            filePath,
            duration,
            sizeBytes: parseInt(format.size || '0', 10),
            bitrate: parseInt(format.bit_rate || '0', 10),
            formatName: format.format_name,
            hasVideo: Boolean(videoStream),
            hasAudio: Boolean(audioStream),
            video: videoStream ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              aspectRatio: videoStream.display_aspect_ratio || `${videoStream.width}:${videoStream.height}`,
              fps
            } : null,
            audio: audioStream ? {
              codec: audioStream.codec_name,
              channels: audioStream.channels,
              sampleRate: parseInt(audioStream.sample_rate || '44100', 10),
              bitrate: parseInt(audioStream.bit_rate || '0', 10)
            } : null
          };

          resolve(result);
        } catch (parseErr) {
          reject(new Error(`Failed to parse ffprobe output: ${parseErr.message}`));
        }
      });
    });
  }

  /**
   * Central command builder that applies system FFmpeg settings (such as -threads N).
   * If ffmpegThreads is 0 ("Auto") or not set, the -threads flag is omitted.
   * @param {string[]} args
   * @returns {string[]}
   */
  buildFfmpegArgs(args = []) {
    let threads = 0;
    try {
      const settingsService = require('./settings');
      const settings = settingsService.get();
      threads = parseInt(settings?.system?.ffmpegThreads, 10) || 0;
    } catch (_) {}

    if (threads > 0) {
      if (!args.includes('-threads')) {
        return ['-threads', String(threads), ...args];
      }
    }
    return [...args];
  }

  /**
   * Extract audio to stereo WAV for playback and waveform display
   */
  extractAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const rawArgs = [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        outputPath
      ];
      const args = this.buildFfmpegArgs(rawArgs);

      execFile(this.ffmpegPath, args, (err, _stdout, stderr) => {
        if (err) {
          logger.error('Failed to extract audio', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Extract audio to 16 kHz mono WAV for ASR (Whisper / Gemini)
   */
  extractAudio16kMono(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const rawArgs = [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        outputPath
      ];
      const args = this.buildFfmpegArgs(rawArgs);

      execFile(this.ffmpegPath, args, (err, _stdout, stderr) => {
        if (err) {
          logger.error('Failed to extract 16k mono audio', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Generate waveform peaks from an audio/video file
   * Streams downsampled 8kHz mono PCM to stdout and computes min/max normalized peaks
   */
  generateWaveformPeaks(filePath, numPeaks = 600) {
    return new Promise((resolve, reject) => {
      const rawArgs = [
        '-v', 'error',
        '-i', filePath,
        '-vn',
        '-ac', '1',
        '-ar', '8000',
        '-f', 's16le',
        '-'
      ];
      const args = this.buildFfmpegArgs(rawArgs);

      const proc = spawn(this.ffmpegPath, args);
      const chunks = [];

      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.stderr.on('data', data => logger.debug('ffmpeg peaks stderr: ' + data));

      proc.on('error', err => reject(err));

      proc.on('close', code => {
        if (code !== 0 && chunks.length === 0) {
          return reject(new Error(`FFmpeg exited with code ${code}`));
        }

        const buffer = Buffer.concat(chunks);
        const sampleCount = Math.floor(buffer.length / 2);
        if (sampleCount === 0) {
          // Return default flat peaks if no audio stream
          return resolve(new Array(numPeaks).fill(0.05));
        }

        const samplesPerPeak = Math.max(1, Math.floor(sampleCount / numPeaks));
        const peaks = [];
        let maxOverall = 0;

        for (let p = 0; p < numPeaks; p++) {
          const startSample = p * samplesPerPeak;
          const endSample = Math.min(sampleCount, startSample + samplesPerPeak);
          let sumSquares = 0;
          let count = 0;

          for (let i = startSample; i < endSample; i += 4) { // step by 4 for high performance
            const val = buffer.readInt16LE(i * 2);
            sumSquares += val * val;
            count++;
          }

          const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
          if (rms > maxOverall) maxOverall = rms;
          peaks.push(rms);
        }

        // Normalize between 0.05 and 1.0
        const divisor = maxOverall > 0 ? maxOverall : 32767;
        const normalized = peaks.map(p => {
          const norm = Math.round((p / divisor) * 100) / 100;
          return Math.max(0.05, Math.min(1.0, norm));
        });

        resolve(normalized);
      });
    });
  }

  /**
   * Generate thumbnail filmstrip frames for the video track
   */
  generateThumbnails(videoPath, outputDir, count = 10, width = 120) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const meta = await this.probeMedia(videoPath);
        if (!meta.hasVideo || meta.duration <= 0) {
          return resolve([]);
        }

        const interval = meta.duration / (count + 1);
        const promises = [];
        const thumbFiles = [];

        for (let i = 0; i < count; i++) {
          const timeSec = (i + 0.5) * interval;
          const thumbPath = path.join(outputDir, `thumb_${i}.jpg`);
          thumbFiles.push({ index: i, time: timeSec, path: thumbPath });

          const p = new Promise((res, rej) => {
            const rawArgs = [
              '-y',
              '-ss', timeSec.toFixed(2),
              '-i', videoPath,
              '-vframes', '1',
              '-vf', `scale=${width}:-1`,
              '-q:v', '5',
              thumbPath
            ];
            const args = this.buildFfmpegArgs(rawArgs);
            execFile(this.ffmpegPath, args, err => {
              if (err) rej(err);
              else res(thumbPath);
            });
          });
          promises.push(p);
        }

        await Promise.all(promises);
        resolve(thumbFiles);
      } catch (err) {
        logger.error('Failed to generate thumbnails', err);
        resolve([]); // Non-fatal, resolve empty
      }
    });
  }

  /**
   * Apply tempo adjustment to an audio file using FFmpeg atempo filters
   */
  applyAtempo(inputPath, outputPath, ratio) {
    const { buildAtempoChain } = require('./timing/auto-fit');
    const chain = buildAtempoChain(ratio);

    return new Promise((resolve, reject) => {
      if (chain.length === 0) {
        // No filter needed, copy audio
        try {
          fs.copyFileSync(inputPath, outputPath);
          return resolve(outputPath);
        } catch (copyErr) {
          return reject(copyErr);
        }
      }

      const rawArgs = [
        '-y',
        '-i', inputPath,
        '-filter:a', chain.join(','),
        outputPath
      ];
      const args = this.buildFfmpegArgs(rawArgs);

      execFile(this.ffmpegPath, args, (err, _stdout, stderr) => {
        if (err) {
          logger.error('Failed to apply atempo filter', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Generate a synthetic sine-wave tone audio file (used by Mock TTS and tone tests)
   */
  generateSineTone(outputPath, durationSeconds = 1.0, frequencyHz = 440) {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const dur = Math.max(0.1, Number(durationSeconds) || 1.0);
      const freq = Math.max(50, Number(frequencyHz) || 440);

      const rawArgs = [
        '-y',
        '-f', 'lavfi',
        '-i', `sine=frequency=${freq}:duration=${dur.toFixed(3)}`,
        outputPath
      ];
      const args = this.buildFfmpegArgs(rawArgs);

      execFile(this.ffmpegPath, args, (err, _stdout, stderr) => {
        if (err) {
          logger.error('Failed to generate sine tone', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
    });
  }
}

const ffmpegService = new FfmpegService();
module.exports = ffmpegService;
