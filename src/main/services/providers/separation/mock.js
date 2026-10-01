/**
 * Mock Separation Provider
 * Uses FFmpeg equalization/bandpass filters to produce vocal and BGM tracks offline.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseSeparationProvider = require('./base');
const ffmpegService = require('../../ffmpeg');
const logger = require('../../../utils/logger');

class MockSeparationProvider extends BaseSeparationProvider {
  constructor() {
    super('mock');
  }

  async separate(audioPath, outputDir, onProgress = null) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const vocalsPath = path.join(outputDir, 'vocals.wav');
    const bgmPath = path.join(outputDir, 'bgm.wav');

    if (onProgress) onProgress({ percent: 15, message: 'Analyzing audio spectrum...' });

    // Generate vocals stem (mid-frequency boost)
    const vocalArgs = [
      '-y',
      '-i', audioPath,
      '-filter:a', 'highpass=f=200,lowpass=f=3500,volume=1.2',
      '-c:a', 'pcm_s16le',
      vocalsPath
    ];

    // Generate BGM stem (bass & high treble boost with vocal notch)
    const bgmArgs = [
      '-y',
      '-i', audioPath,
      '-filter:a', 'bandreject=f=1200:w=1000,volume=0.85',
      '-c:a', 'pcm_s16le',
      bgmPath
    ];

    if (onProgress) onProgress({ percent: 45, message: 'Separating vocals and accompaniment...' });

    await new Promise((resolve, reject) => {
      const finalVocalArgs = ffmpegService.buildFfmpegArgs(vocalArgs);
      execFile(ffmpegService.ffmpegPath, finalVocalArgs, err => {
        if (err) return reject(err);
        resolve();
      });
    });

    if (this.isCancelled) throw new Error('Separation cancelled');
    if (onProgress) onProgress({ percent: 80, message: 'Extracting background music stem...' });

    await new Promise((resolve, reject) => {
      const finalBgmArgs = ffmpegService.buildFfmpegArgs(bgmArgs);
      execFile(ffmpegService.ffmpegPath, finalBgmArgs, err => {
        if (err) return reject(err);
        resolve();
      });
    });

    if (onProgress) onProgress({ percent: 100, message: 'Audio separation complete!' });

    return {
      vocalsPath,
      bgmPath,
      status: 'success'
    };
  }
}

module.exports = MockSeparationProvider;
