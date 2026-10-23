const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const EventEmitter = require('events');
const logger = require('../utils/logger');

// Regex matching standard AIza... Google AI keys and new AQ.... OAuth keys
const GEMINI_KEY_REGEX = /^(?:AIza[\w-]{35}|AQ\.[\w-]{30,120})$/;

const ALL_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview'
];

/**
 * Interpret Gemini API HTTP errors into helpful user messages
 */
function interpretGeminiError(status, body = '') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const snippet = text.trim().slice(0, 200);

  if ((status === 401 || status === 403) && /ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_SERVICE_BLOCKED/.test(text)) {
    return 'Google refused this key (401 ACCESS_TOKEN_TYPE_UNSUPPORTED). AI Studio AQ. keys may be blocked on this endpoint. Create a standard AIza... key in Google Cloud console and paste that instead.';
  }

  switch (status) {
    case 400:
      return /API key not valid/i.test(text)
        ? 'Gemini key was not accepted. Ensure it was copied completely without trailing spaces.'
        : 'Gemini request was rejected as malformed. If you customized the model, try the default gemini-3.8-flash.';
    case 401:
      return 'Gemini key is revoked or mistyped. Please generate a new key and update Settings.';
    case 403:
      return /billing|suspended/i.test(text)
        ? 'Google suspended API access for this project. Check billing or free-tier quotas on your Google Cloud account.'
        : 'Generative Language API is not enabled for this project. Enable it in Google Cloud Console.';
    case 404:
      return 'Gemini does not recognize the selected model. Choose another model from the settings list.';
    case 429:
      if (/per_?day/i.test(text)) {
        return 'Daily request quota exceeded for this model. Switch to another model or add a key from a different Google project.';
      }
      return 'Gemini rate limit reached (too many requests in a short time). Waiting before retry...';
    case 500:
    case 502:
    case 503:
    case 504:
      return /overloaded/i.test(text)
        ? 'Gemini servers are currently overloaded. Waiting a moment before automatic retry...'
        : `Gemini service error (${status}). Retrying shortly...`;
    default:
      return snippet ? `Gemini error (${status}): ${snippet}` : `Gemini error (${status})`;
  }
}

class KeyPoolService extends EventEmitter {
  constructor() {
    super();
    this.keys = [];
    this.isLoaded = false;
    this.currentIndex = 0;
    this.storagePath = null;
    this.initStoragePath();
    this.loadKeys();
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

  isValidKeyFormat(key) {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed.length < 20 || trimmed.length > 200) return false;
    return GEMINI_KEY_REGEX.test(trimmed) || trimmed.startsWith('AIza') || trimmed.startsWith('AQ.');
  }

  getCandidateModels(preferredModel = 'gemini-3.8-flash', maxFallbacks = 3) {
    const primary = ALL_GEMINI_MODELS.includes(preferredModel) ? preferredModel : 'gemini-3.8-flash';
    const fallbacks = ALL_GEMINI_MODELS.filter(m => m !== primary).slice(0, maxFallbacks);
    return [primary, ...fallbacks];
  }

  loadKeys() {
    this.isLoaded = true;
    try {
      if (!this.storagePath || !fs.existsSync(this.storagePath)) {
        this.keys = [];
        return;
      }

      const fileData = fs.readFileSync(this.storagePath);
      let entries = [];

      let decryptedText = null;
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          decryptedText = safeStorage.decryptString(fileData);
        } catch (e) {
          // Fallback unencrypted
        }
      }

      if (!decryptedText) {
        if (fileData.slice(0, 3).toString('utf-8') === 'v10' && (!safeStorage || !safeStorage.isEncryptionAvailable())) {
          logger.debug('Keys file is encrypted with safeStorage; deferring decryption until app is ready.');
          this.isLoaded = false;
          return;
        }
        decryptedText = fileData.toString('utf-8');
      }

      entries = JSON.parse(decryptedText);

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

  ensureKeysLoaded() {
    if (!this.isLoaded && this.storagePath && fs.existsSync(this.storagePath) && safeStorage && safeStorage.isEncryptionAvailable()) {
      this.loadKeys();
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
    const key = rawKey.trim().replace(/^["']|["',;]+$/g, '').trim();
    if (!this.isValidKeyFormat(key)) {
      throw new Error('Invalid Gemini API key format (expected standard AIza... or AQ. key)');
    }

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyString}`;
      const signal = typeof globalThis.AbortSignal !== 'undefined' && typeof globalThis.AbortSignal.timeout === 'function'
        ? globalThis.AbortSignal.timeout(15000)
        : undefined;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const errorMsg = interpretGeminiError(response.status, errorBody);
        if (found) {
          found.consecutiveErrors = (found.consecutiveErrors || 0) + 1;
          this.emitStatus();
        }
        return { valid: false, error: errorMsg, status: response.status };
      }

      const data = await response.json();
      const count = (data.models && data.models.length) || 0;
      if (found) {
        found.cooldownUntil = 0;
        found.consecutiveErrors = 0;
        this.emitStatus();
      }
      return { valid: true, modelsCount: count };
    } catch (err) {
      return { valid: false, error: `Connection failed: ${err.message}` };
    }
  }

  getNextKey() {
    this.ensureKeysLoaded();
    if (this.keys.length === 0) {
      throw new Error('No Gemini API keys configured. Please add an API key in Settings.');
    }

    const now = Date.now();
    const availableKeys = this.keys.filter(k => k.cooldownUntil <= now);

    if (availableKeys.length === 0) {
      const shortest = Math.min(...this.keys.map(k => k.cooldownUntil));
      const remainingSec = Math.max(1, Math.ceil((shortest - now) / 1000));
      throw new Error(`All Gemini API keys are in cooldown. Next available in ${remainingSec}s.`);
    }

    // Fair Least-Recently-Used round-robin across all available keys
    availableKeys.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    const selected = availableKeys[0];
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

  resetCooldowns() {
    for (const k of this.keys) {
      k.cooldownUntil = 0;
      k.consecutiveErrors = 0;
    }
    this.emitStatus();
  }

  addBatch(rawInput) {
    if (!rawInput) {
      return { addedCount: 0, duplicates: 0, invalid: 0 };
    }

    const lines = Array.isArray(rawInput)
      ? rawInput.map(l => String(l).trim()).filter(Boolean)
      : String(rawInput).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let addedCount = 0;
    let duplicates = 0;
    let invalid = 0;
    const addedInThisBatch = new Set();

    for (const raw of lines) {
      const key = raw.replace(/^["']|["',;]+$/g, '').trim();
      if (!this.isValidKeyFormat(key)) {
        invalid++;
        continue;
      }
      if (this.keys.some(k => k.key === key) || addedInThisBatch.has(key)) {
        duplicates++;
        continue;
      }

      addedInThisBatch.add(key);
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
    this.ensureKeysLoaded();
    const now = Date.now();
    const total = this.keys.length;
    const available = this.keys.filter(k => k.cooldownUntil <= now).length;
    return { available, total };
  }

  getMaskedKeys() {
    this.ensureKeysLoaded();
    const now = Date.now();
    return this.keys.map(k => {
      const isCooldown = k.cooldownUntil > now;
      const cooldownSec = isCooldown ? Math.ceil((k.cooldownUntil - now) / 1000) : 0;
      let status = 'active';
      if (isCooldown) {
        status = 'cooldown';
      } else if ((k.consecutiveErrors || 0) >= 3) {
        status = 'error';
      } else if ((k.consecutiveErrors || 0) > 0) {
        status = 'warning';
      }
      return {
        id: k.id,
        masked: k.masked,
        addedAt: k.addedAt,
        status,
        cooldownRemainingSec: cooldownSec,
        lastUsed: k.lastUsed || 0,
        errorCount: k.consecutiveErrors || 0
      };
    });
  }

  async callWithKey(fn, maxRetries = 3) {
    let lastError = null;
    const totalKeys = (this.keys && this.keys.length > 0) ? this.keys.length : 1;
    const maxAttempts = Math.max(totalKeys * 2, maxRetries);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let key;
      try {
        key = this.getNextKey();
      } catch (poolErr) {
        lastError = poolErr;
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw poolErr;
      }

      try {
        const result = await fn(key);
        this.markSuccess(key);
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || (err.message?.match(/HTTP\s+(\d+)/i)?.[1] ? parseInt(RegExp.$1, 10) : 0);

        if (status === 429 || status === 503 || /rate limit|quota|resource_exhausted/i.test(err.message)) {
          const cooldownMs = /daily/i.test(err.message) ? 300000 : 30000;
          this.markCooldown(key, cooldownMs);
          if (attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
        } else if (status === 401 || status === 403) {
          this.markCooldown(key, 3600000);
          if (attempt < maxAttempts - 1) {
            continue;
          }
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini API keys failed.');
  }

  emitStatus() {
    const status = this.getStatus();
    this.emit('status-changed', status);
  }
}

// Singleton
const keyPool = new KeyPoolService();
keyPool.interpretGeminiError = interpretGeminiError;
keyPool.ALL_GEMINI_MODELS = ALL_GEMINI_MODELS;

module.exports = keyPool;
