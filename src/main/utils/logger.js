const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

class Logger {
  constructor() {
    this.logDir = null;
    this.logFilePath = null;
    this.maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const userData = app.getPath('userData');
      this.logDir = path.join(userData, 'logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.logFilePath = path.join(this.logDir, 'app.log');
      this.rotateIfNeeded();
      this.initialized = true;
      this.info('Logger initialized. Log path: ' + this.logFilePath);
    } catch (err) {
      console.error('Failed to initialize logger:', err);
    }
  }

  rotateIfNeeded() {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) return;
    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size >= this.maxSizeBytes) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.logDir, `app-${timestamp}.log`);
        fs.renameSync(this.logFilePath, backupPath);

        // Keep at most 5 old logs
        const files = fs.readdirSync(this.logDir)
          .filter(f => f.startsWith('app-') && f.endsWith('.log'))
          .map(f => ({ name: f, time: fs.statSync(path.join(this.logDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 5) {
          for (let i = 5; i < files.length; i++) {
            try {
              fs.unlinkSync(path.join(this.logDir, files[i].name));
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.error('Error during log rotation:', err);
    }
  }

  write(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let metaStr = '';
    if (meta !== null && meta !== undefined) {
      if (meta instanceof Error || (typeof meta === 'object' && ('message' in meta || 'stack' in meta))) {
        metaStr = ` ${meta.stack || meta.message || ''}`;
        try {
          const clone = { ...meta };
          delete clone.message;
          delete clone.stack;
          delete clone.name;
          if (Object.keys(clone).length > 0) {
            metaStr += ' ' + JSON.stringify(clone);
          }
        } catch (_) {}
      } else if (typeof meta === 'object') {
        try {
          const str = JSON.stringify(meta);
          metaStr = ' ' + (str === '{}' && typeof meta.toString === 'function' && meta.toString() !== '[object Object]' ? meta.toString() : str);
        } catch (_) {
          metaStr = ' ' + String(meta);
        }
      } else {
        metaStr = ' ' + String(meta);
      }
    }
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
    
    // Also log to console in development
    console.log(formatted.trim());

    if (!this.initialized) return;
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFilePath, formatted, 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  info(msg, meta) { this.write('info', msg, meta); }
  warn(msg, meta) { this.write('warn', msg, meta); }
  error(msg, meta) { this.write('error', msg, meta); }
  debug(msg, meta) { this.write('debug', msg, meta); }

  getLogsDir() {
    return this.logDir;
  }

  async openLogsFolder() {
    if (this.logDir && fs.existsSync(this.logDir)) {
      return shell.openPath(this.logDir);
    }
    return false;
  }
}

const logger = new Logger();
module.exports = logger;
