/**
 * Demucs Local Separation Provider
 * Uses Demucs deep learning audio source separation if installed,
 * or guides the user to load their own BGM file.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseSeparationProvider = require('./base');
const logger = require('../../../utils/logger');

class DemucsSeparationProvider extends BaseSeparationProvider {
  constructor() {
    super('demucs');
  }

  async checkInstalled() {
    return new Promise(resolve => {
      const proc = spawn('demucs', ['--help']);
      proc.on('error', () => resolve(false));
      proc.on('close', code => resolve(code === 0));
    });
  }

  async separate(audioPath, outputDir, onProgress = null) {
    const isAvail = await this.checkInstalled();
    if (!isAvail) {
      throw new Error(
        'Local Demucs separation model not found.\n' +
        'Tip: You can use "Load BGM" to import your own background music track directly, ' +
        'or install demucs via: pip install demucs'
      );
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (onProgress) onProgress({ percent: 10, message: 'Running Demucs neural stem separation...' });

    return new Promise((resolve, reject) => {
      const proc = spawn('demucs', [
        '--two-stems', 'vocals',
        '-o', outputDir,
        audioPath
      ]);

      proc.stdout.on('data', data => {
        const text = data.toString();
        logger.debug('demucs stdout: ' + text);
      });

      proc.stderr.on('data', data => {
        const text = data.toString();
        // Parse progress if available
        const match = text.match(/(\d+)%/);
        if (match && onProgress) {
          onProgress({ percent: parseInt(match[1], 10), message: 'Separating audio stems...' });
        }
      });

      proc.on('error', err => reject(err));
      proc.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`Demucs exited with code ${code}`));
        }

        const baseName = path.basename(audioPath, path.extname(audioPath));
        const modelOutputDir = path.join(outputDir, 'htdemucs', baseName);
        const vocalsPath = path.join(modelOutputDir, 'vocals.wav');
        const bgmPath = path.join(modelOutputDir, 'no_vocals.wav');

        resolve({ vocalsPath, bgmPath });
      });
    });
  }
}

module.exports = DemucsSeparationProvider;
