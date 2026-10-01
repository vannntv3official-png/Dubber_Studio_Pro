const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class KeyPoolService extends EventEmitter {
  constructor() {
    super();
    this.keys = []; // Array of { id, key, masked, addedAt, cooldownUntil, consecutiveErrors, lastUsed }
    this.currentIndex = 0;
    this.storagePath = null;
    this.initStoragePath();
  }

  initStoragePath() {
    let baseDir;
    try {
      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      } else {
        baseDir = path.join(__dirname, '../../../.data');
      }
    } catch (_) {
      baseDir = path.join(__dirname, '../../../.data');
    }

    const configDir = path.join(baseDir, 'config');
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
      } catch (_) {}
    }
    this.storagePath = path.join(configDir, 'keys.dat');
  }

  maskKey(key) {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.length <= 10) return '***';
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  loadKeys() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        this.keys = [];
        return;
      }

      const fileData = fs.readFileSync(this.storagePath);
      let entries = [];

      // Try safeStorage first
      let decryptedText = null;
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          decryptedText = safeStorage.decryptString(fileData);
        } catch (e) {
          // May be stored unencrypted from fallback
        }
      }

      if (!decryptedText) {
        decryptedText = fileData.toString('utf-8');
      }

      entries = JSON.parse(decryptedText);
      const now = Date.now();

      this.keys = entries.map(item => ({
        id: item.id || `k_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        key: item.key,
        masked: this.maskKey(item.key),
        addedAt: item.addedAt || new Date().toISOString(),
        cooldownUntil: 0,
        consecutiveErrors: 0,
        lastUsed: 0
      }));

      logger.info(`Loaded ${this.keys.length} Gemini API keys.`);
      this.emitStatus();
    } catch (err) {
      logger.error(`Failed to load Gemini keys: ${err.message}`);
      this.keys = [];
    }
  }

  saveKeys() {
    try {
      const dataToStore = this.keys.map(k => ({
        id: k.id,
        key: k.key,
        addedAt: k.addedAt
      }));
      const jsonStr = JSON.stringify(dataToStore, null, 2);

      let bufferToWrite;
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        bufferToWrite = safeStorage.encryptString(jsonStr);
      } else {
        bufferToWrite = Buffer.from(jsonStr, 'utf-8');
      }

      fs.writeFileSync(this.storagePath, bufferToWrite);
      this.emitStatus();
    } catch (err) {
      logger.error(`Failed to save Gemini keys: ${err.message}`);
    }
  }

  addKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('API key must be a non-empty string');
    }
    const key = rawKey.trim();
    if (key.length < 20) {
      throw new Error('Invalid Gemini API key format (too short)');
    }

    // Check duplicate
    if (this.keys.some(k => k.key === key)) {
      throw new Error('API key already exists in pool');
    }

    const id = `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry = {
      id,
      key,
      masked: this.maskKey(key),
      addedAt: new Date().toISOString(),
      cooldownUntil: 0,
      consecutiveErrors: 0,
      lastUsed: 0
    };

    this.keys.push(entry);
    this.saveKeys();
    logger.info(`Added Gemini key: ${entry.masked}`);
    return { id, masked: entry.masked };
  }

  removeKey(id) {
    const idx = this.keys.findIndex(k => k.id === id);
    if (idx !== -1) {
      const removed = this.keys.splice(idx, 1)[0];
      this.saveKeys();
      logger.info(`Removed Gemini key: ${removed.masked}`);
      return true;
    }
    return false;
  }

  async testKey(rawKeyOrId) {
    let keyString = rawKeyOrId;
    const found = this.keys.find(k => k.id === rawKeyOrId);
    if (found) {
      keyString = found.key;
    }

    if (!keyString) {
      return { valid: false, error: 'No key provided' };
    }

    try {
      // Use official Gemini models list endpoint to test key validity
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyString}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error && parsed.error.message) {
            errorMsg = parsed.error.message;
          }
        } catch (_) {}
        return { valid: false, error: errorMsg, status: response.status };
      }

      const data = await response.json();
      const count = (data.models && data.models.length) || 0;
      return { valid: true, modelsCount: count };
    } catch (err) {
      return { valid: false, error: `Connection failed: ${err.message}` };
    }
  }

  getNextKey() {
    if (this.keys.length === 0) {
      throw new Error('No Gemini API keys configured. Please add an API key in Settings.');
    }

    const now = Date.now();
    const availableKeys = this.keys.filter(k => k.cooldownUntil <= now);

    if (availableKeys.length === 0) {
      // Find shortest cooldown remaining
      const shortest = Math.min(...this.keys.map(k => k.cooldownUntil));
      const remainingSec = Math.max(1, Math.ceil((shortest - now) / 1000));
      throw new Error(`All Gemini API keys are in cooldown. Next available in ${remainingSec}s.`);
    }

    // Round-robin selection
    this.currentIndex = (this.currentIndex + 1) % availableKeys.length;
    const selected = availableKeys[this.currentIndex];
    selected.lastUsed = now;
    return selected.key;
  }

  markCooldown(keyOrId, durationMs = 60000) {
    const entry = this.keys.find(k => k.key === keyOrId || k.id === keyOrId);
    if (entry) {
      entry.cooldownUntil = Date.now() + durationMs;
      entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
      logger.warn(`Gemini key ${entry.masked} marked cooling down for ${durationMs / 1000}s (errors: ${entry.consecutiveErrors})`);
      this.emitStatus();
    }
  }

  markSuccess(keyOrId) {
    const entry = this.keys.find(k => k.key === keyOrId || k.id === keyOrId);
    if (entry) {
      entry.consecutiveErrors = 0;
    }
  }

  addBatch(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { addedCount: 0, duplicates: 0, invalid: 0 };
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let addedCount = 0;
    let duplicates = 0;
    let invalid = 0;

    for (const key of lines) {
      if (key.length < 20) {
        invalid++;
        continue;
      }
      if (this.keys.some(k => k.key === key)) {
        duplicates++;
        continue;
      }

      const id = `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.keys.push({
        id,
        key,
        masked: this.maskKey(key),
        addedAt: new Date().toISOString(),
        cooldownUntil: 0,
        consecutiveErrors: 0,
        lastUsed: 0
      });
      addedCount++;
    }

    if (addedCount > 0) {
      this.saveKeys();
      logger.info(`Batch added ${addedCount} Gemini keys (${duplicates} duplicates, ${invalid} invalid)`);
    }

    return { addedCount, duplicates, invalid };
  }

  getStatus() {
    const now = Date.now();
    const total = this.keys.length;
    const available = this.keys.filter(k => k.cooldownUntil <= now).length;
    return { available, total };
  }

  getMaskedKeys() {
    const now = Date.now();
    return this.keys.map(k => {
      const isCooldown = k.cooldownUntil > now;
      const cooldownSec = isCooldown ? Math.ceil((k.cooldownUntil - now) / 1000) : 0;
      return {
        id: k.id,
        masked: k.masked,
        addedAt: k.addedAt,
        status: isCooldown ? 'cooldown' : 'active',
        cooldownRemainingSec: cooldownSec,
        lastUsed: k.lastUsed || 0,
        errorCount: k.consecutiveErrors || 0
      };
    });
  }

  emitStatus() {
    const status = this.getStatus();
    this.emit('status-changed', status);
  }
}

// Singleton
const keyPool = new KeyPoolService();

module.exports = keyPool;
