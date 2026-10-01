const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class SidecarManager {
  constructor() {
    this.proc = null;
    this.rl = null;
    this.requests = new Map(); // id -> { resolve, reject, onProgress, timer }
    this.isReady = false;
    this.readyResolvers = [];
    this.hardwareInfo = null;
    this.isShuttingDown = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
  }

  resolvePythonPath() {
    // 1. Packaged python executable in extraResources
    if (process.resourcesPath) {
      const packagedPy = path.join(process.resourcesPath, 'python', process.platform === 'win32' ? 'python.exe' : 'python');
      if (fs.existsSync(packagedPy)) return packagedPy;
    }

    // 2. Default to system python
    return 'python';
  }

  resolveScriptPath() {
    // Check in app root / src / sidecar
    const devPath = path.join(__dirname, '../../sidecar/sidecar.py');
    if (fs.existsSync(devPath)) return devPath;

    if (process.resourcesPath) {
      const resPath = path.join(process.resourcesPath, 'sidecar', 'sidecar.py');
      if (fs.existsSync(resPath)) return resPath;
    }

    return devPath;
  }

  start() {
    if (this.proc && !this.proc.killed) {
      return Promise.resolve(this.hardwareInfo);
    }

    this.isShuttingDown = false;
    const pythonExe = this.resolvePythonPath();
    const scriptPath = this.resolveScriptPath();

    logger.info(`Starting Python sidecar: ${pythonExe} -u ${scriptPath}`);

    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject });

      try {
        this.proc = spawn(pythonExe, ['-u', scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'UTF-8'
          }
        });
      } catch (err) {
        logger.error(`Failed to spawn Python process: ${err.message}`);
        return reject(err);
      }

      this.rl = readline.createInterface({
        input: this.proc.stdout,
        terminal: false
      });

      this.rl.on('line', (line) => {
        this.handleMessage(line);
      });

      this.proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          logger.warn(`[Sidecar stderr] ${text}`);
        }
      });

      this.proc.on('error', (err) => {
        logger.error(`Sidecar process error: ${err.message}`);
        this.handleProcessExit(-1, err);
      });

      this.proc.on('exit', (code, signal) => {
        logger.warn(`Sidecar process exited with code ${code}, signal ${signal}`);
        this.handleProcessExit(code);
      });
    });
  }

  handleMessage(line) {
    if (!line || !line.trim()) return;

    let msg;
    try {
      msg = JSON.parse(line.trim());
    } catch (e) {
      logger.warn(`Unparseable sidecar output: ${line}`);
      return;
    }

    // Handle startup ready event
    if (msg.event === 'ready') {
      this.isReady = true;
      this.hardwareInfo = msg.hardware || null;
      logger.info('Python sidecar ready. Hardware: ' + JSON.stringify(this.hardwareInfo));

      while (this.readyResolvers.length > 0) {
        const r = this.readyResolvers.shift();
        r.resolve(this.hardwareInfo);
      }
      return;
    }

    const { id, type, data, error, progress, message } = msg;
    if (!id) return;

    const req = this.requests.get(id);
    if (!req) return;

    if (type === 'progress') {
      if (typeof req.onProgress === 'function') {
        req.onProgress({ percent: progress, message: message || '' });
      }
    } else if (type === 'result') {
      if (req.timer) clearTimeout(req.timer);
      this.requests.delete(id);
      req.resolve(data);
    } else if (type === 'cancelled') {
      if (req.timer) clearTimeout(req.timer);
      this.requests.delete(id);
      req.resolve({ cancelled: true });
    } else if (type === 'error') {
      if (req.timer) clearTimeout(req.timer);
      this.requests.delete(id);
      req.reject(new Error(error || 'Sidecar execution error'));
    }
  }

  handleProcessExit(code, error) {
    this.isReady = false;

    // Fail all pending requests
    for (const [id, req] of this.requests.entries()) {
      if (req.timer) clearTimeout(req.timer);
      req.reject(new Error(`Sidecar process exited unexpectedly (code: ${code})`));
    }
    this.requests.clear();

    // Fail any waiting ready resolvers
    while (this.readyResolvers.length > 0) {
      const r = this.readyResolvers.shift();
      r.reject(error || new Error(`Sidecar exited during startup (code: ${code})`));
    }

    // Attempt auto-restart if not intentionally shut down
    if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      const delay = this.restartAttempts * 1000;
      logger.info(`Auto-restarting sidecar in ${delay}ms (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
      setTimeout(() => {
        this.start().catch((err) => {
          logger.error(`Sidecar restart failed: ${err.message}`);
        });
      }, delay);
    }
  }

  async sendRequest(action, payload = {}, onProgress = null, timeoutMs = 0) {
    if (!this.isReady) {
      await this.start();
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.requests.has(id)) {
            this.requests.delete(id);
            this.cancel(id);
            reject(new Error(`Sidecar request '${action}' timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }

      this.requests.set(id, { resolve, reject, onProgress, timer });

      const line = JSON.stringify({ id, action, payload }) + '\n';
      try {
        this.proc.stdin.write(line, 'utf-8');
      } catch (err) {
        this.requests.delete(id);
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });
  }

  cancel(jobId) {
    if (!this.proc || this.proc.killed) return;
    try {
      const cancelMsg = JSON.stringify({
        id: `cancel_${Date.now()}`,
        action: 'cancel',
        payload: { target_id: jobId }
      }) + '\n';
      this.proc.stdin.write(cancelMsg, 'utf-8');
      logger.info(`Sent cancellation signal for job: ${jobId}`);
    } catch (e) {
      logger.warn(`Failed to send cancel to sidecar: ${e.message}`);
    }
  }

  ping() {
    return this.sendRequest('ping', {}, null, 10000);
  }

  detectHardware() {
    return this.sendRequest('detect_hardware', {}, null, 15000);
  }

  listVoices() {
    return this.sendRequest('list_voices', {}, null, 30000);
  }

  downloadModel(modelSize, downloadRoot, onProgress) {
    return this.sendRequest('download_model', {
      model_size: modelSize,
      download_root: downloadRoot
    }, onProgress, 0); // No timeout for model download
  }

  transcribeWhisper(options, onProgress) {
    return this.sendRequest('transcribe_whisper', options, onProgress, 0);
  }

  synthesizeTts(options, onProgress) {
    return this.sendRequest('synthesize_tts', options, onProgress, 60000);
  }

  shutdown() {
    this.isShuttingDown = true;
    logger.info('Shutting down Python sidecar...');

    if (this.proc && !this.proc.killed) {
      try {
        this.proc.stdin.end();
        this.proc.kill('SIGTERM');
      } catch (_) {}
    }
    this.proc = null;
    this.isReady = false;
  }
}

// Singleton instance
const sidecarManager = new SidecarManager();

module.exports = sidecarManager;
