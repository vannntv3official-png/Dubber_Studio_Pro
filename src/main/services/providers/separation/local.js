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

// Find bundled ffmpeg if present to provide to demucs environment
let bundledFfmpegDir = null;
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    bundledFfmpegDir = path.dirname(ffmpegStatic);
  }
} catch (_) {}

class DemucsSeparationProvider extends BaseSeparationProvider {
  constructor() {
    super('demucs');
    this.proc = null;
  }

  getSpawnEnv() {
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    };

    if (bundledFfmpegDir) {
      const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
      const currentPath = env[pathKey] || env.PATH || '';
      env[pathKey] = `${bundledFfmpegDir}${path.delimiter}${currentPath}`;
      env.PATH = env[pathKey];
    }

    return env;
  }

  async checkInstalled() {
    return new Promise(resolve => {
      const proc = spawn('demucs', ['--help'], {
        env: this.getSpawnEnv(),
        shell: process.platform === 'win32'
      });
      proc.on('error', () => resolve(false));
      proc.on('close', code => resolve(code === 0));
    });
  }

  cancel() {
    super.cancel();
    if (this.proc && !this.proc.killed) {
      try {
        logger.info('Terminating active Demucs separation process');
        if (process.platform === 'win32' && this.proc.pid) {
          spawn('taskkill', ['/pid', String(this.proc.pid), '/f', '/t']);
        } else {
          this.proc.kill('SIGTERM');
        }
      } catch (err) {
        logger.warn('Failed to kill Demucs process', err);
      }
    }
  }

  async separate(audioPath, outputDir, onProgress = null) {
    this.reset();

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

    if (onProgress) onProgress({ percent: 5, message: 'Initializing Demucs neural separation...' });

    return new Promise((resolve, reject) => {
      let stderrBuffer = '';
      let stdoutBuffer = '';

      const proc = spawn('demucs', [
        '--two-stems', 'vocals',
        '-o', outputDir,
        audioPath
      ], {
        env: this.getSpawnEnv(),
        shell: process.platform === 'win32'
      });

      this.proc = proc;

      proc.stdout.on('data', data => {
        const text = data.toString('utf8');
        stdoutBuffer += text;
        logger.debug('demucs stdout: ' + text.trim());
      });

      proc.stderr.on('data', data => {
        const text = data.toString('utf8');
        stderrBuffer += text;
        logger.debug('demucs stderr: ' + text.trim());

        // Parse progress percentage if available in stderr progress bar
        const match = text.match(/(\d+)%/);
        if (match && onProgress) {
          const pct = Math.min(99, Math.max(5, parseInt(match[1], 10)));
          onProgress({ percent: pct, message: `Separating audio stems... (${pct}%)` });
        }
      });

      proc.on('error', err => {
        this.proc = null;
        reject(err);
      });

      proc.on('close', code => {
        this.proc = null;

        if (this.isCancelled) {
          return reject(new Error('Audio separation cancelled by user.'));
        }

        if (code !== 0) {
          const detail = (stderrBuffer || stdoutBuffer || '').trim();
          const lastLines = detail.split('\n').slice(-8).join('\n');
          return reject(new Error(`Demucs separation failed (exit code ${code}):\n${lastLines || 'Unknown error'}`));
        }

        const baseName = path.basename(audioPath, path.extname(audioPath));
        let vocalsPath = path.join(outputDir, 'htdemucs', baseName, 'vocals.wav');
        let bgmPath = path.join(outputDir, 'htdemucs', baseName, 'no_vocals.wav');

        // Robust fallback: if not in default htdemucs path, search outputDir recursively
        if (!fs.existsSync(bgmPath) || !fs.existsSync(vocalsPath)) {
          const findStem = (dir, targetPrefix) => {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  const found = findStem(full, targetPrefix);
                  if (found) return found;
                } else if (entry.isFile()) {
                  const lower = entry.name.toLowerCase();
                  if (lower.startsWith(targetPrefix.toLowerCase())) {
                    return full;
                  }
                }
              }
            } catch (_) {}
            return null;
          };

          const fallbackBgm = findStem(outputDir, 'no_vocals');
          const fallbackVocals = findStem(outputDir, 'vocals');

          if (fallbackBgm) bgmPath = fallbackBgm;
          if (fallbackVocals) vocalsPath = fallbackVocals;
        }

        if (!fs.existsSync(bgmPath)) {
          return reject(new Error(`Demucs finished successfully, but output file not found in ${outputDir}`));
        }

        if (onProgress) onProgress({ percent: 100, message: 'Audio separation complete!' });
        resolve({ vocalsPath, bgmPath });
      });
    });
  }
}

module.exports = DemucsSeparationProvider;
