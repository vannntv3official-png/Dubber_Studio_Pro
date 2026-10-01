/**
 * Intro & Outro Video Concatenation Module
 * Prepend or append an intro/outro video or title card to the output video.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../ffmpeg');
const logger = require('../../utils/logger');

class IntroOutroService {
  constructor() {
    this.ffmpegPath = ffmpegService.ffmpegPath;
  }

  /**
   * Concat intro, main, and outro video files.
   * Scales clips to matching width/height and pixel format.
   */
  async concatenateVideoSegments({
    mainVideoPath,
    introPath = null,
    outroPath = null,
    outputPath,
    onProgress = null
  }) {
    if (!introPath && !outroPath) {
      // Nothing to concat, copy main video
      fs.copyFileSync(mainVideoPath, outputPath);
      return outputPath;
    }

    const mainMeta = await ffmpegService.probeMedia(mainVideoPath);
    const width = mainMeta.video?.width || 1280;
    const height = mainMeta.video?.height || 720;
    const fps = mainMeta.video?.fps || 30;

    const inputs = [];
    if (introPath && fs.existsSync(introPath)) {
      inputs.push(introPath);
    }
    inputs.push(mainVideoPath);
    if (outroPath && fs.existsSync(outroPath)) {
      inputs.push(outroPath);
    }

    const args = ['-y'];
    inputs.forEach(inp => args.push('-i', inp));

    const filterParts = [];
    const concatInputs = [];

    inputs.forEach((_, idx) => {
      // Normalize video: scale, pad, set fps, set sar, format yuv420p
      const vNorm = `v_norm${idx}`;
      const aNorm = `a_norm${idx}`;

      filterParts.push(
        `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[${vNorm}]`,
        `[${idx}:a]aformat=sample_rates=44100:channel_layouts=stereo[${aNorm}]`
      );
      concatInputs.push(`[${vNorm}][${aNorm}]`);
    });

    filterParts.push(
      `${concatInputs.join('')}concat=n=${inputs.length}:v=1:a=1[v_out][a_out]`
    );

    args.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[v_out]',
      '-map', '[a_out]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath
    );

    return new Promise((resolve, reject) => {
      logger.info(`Concatenating ${inputs.length} video segments into: ${outputPath}`);
      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      execFile(this.ffmpegPath, finalArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) {
          logger.error('Intro/Outro concatenation failed', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
    });
  }
}

const introOutroService = new IntroOutroService();
module.exports = introOutroService;
