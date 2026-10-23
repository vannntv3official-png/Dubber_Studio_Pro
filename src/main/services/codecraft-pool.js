/**
 * CodeCraft API Key Pool Service
 * Manages multiple CodeCraft API keys with Least-Recently-Used round-robin,
 * automatic cooldowns on 429 rate limits, per-key error tracking, and validation.
 */

const EventEmitter = require('events');
const settingsService = require('./settings');
const logger = require('../utils/logger');

class CodecraftKeyPoolService extends EventEmitter {
  constructor() {
    super();
    this.keys = [];
    this.currentIndex = 0;
    this.syncFromSettings();
  }

  maskKey(key) {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.length <= 10) return '***';
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  /**
   * Synchronizes key pool from application settings.
   * Parses single apiKey string, comma/newline-delimited keys, or apiKeys array.
   */
  syncFromSettings() {
    try {
      const settings = settingsService.get();
      const codecraft = settings.codecraft || {};

      const rawList = [];
      if (Array.isArray(codecraft.apiKeys)) {
        rawList.push(...codecraft.apiKeys);
      }
      if (typeof codecraft.apiKey === 'string' && codecraft.apiKey.trim()) {
        const split = codecraft.apiKey.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
        rawList.push(...split);
      }

      // Deduplicate and retain runtime cooldown / error metrics
      const existingMap = new Map(this.keys.map(k => [k.key, k]));
      const newKeys = [];

      for (const item of rawList) {
        const cleanKey = typeof item === 'object' && item?.key ? String(item.key).trim() : String(item).trim();
        if (!cleanKey) continue;
        if (newKeys.some(k => k.key === cleanKey)) continue;

        const existing = existingMap.get(cleanKey);
        if (existing) {
          newKeys.push(existing);
        } else {
          newKeys.push({
            id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            key: cleanKey,
            masked: this.maskKey(cleanKey),
            cooldownUntil: 0,
            consecutiveErrors: 0,
            lastUsed: 0
          });
        }
      }

      this.keys = newKeys;
    } catch (err) {
      logger.error(`Failed to sync CodeCraft keys from settings: ${err.message}`);
    }
  }

  hasKeys() {
    this.syncFromSettings();
    return this.keys.length > 0;
  }

  getKeys() {
    this.syncFromSettings();
    return this.keys.map(k => ({
      id: k.id,
      masked: k.masked,
      coolingDown: k.cooldownUntil > Date.now(),
      cooldownRemainingSec: Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)),
      consecutiveErrors: k.consecutiveErrors || 0
    }));
  }

  /**
   * Retrieves next available key using fair Least-Recently-Used rotation
   */
  getNextKey() {
    this.syncFromSettings();
    if (this.keys.length === 0) {
      throw new Error('No CodeCraft API keys configured. Please add your CodeCraft key in Settings.');
    }

    const now = Date.now();
    const available = this.keys.filter(k => k.cooldownUntil <= now);

    if (available.length === 0) {
      const shortest = Math.min(...this.keys.map(k => k.cooldownUntil));
      const remainingSec = Math.max(1, Math.ceil((shortest - now) / 1000));
      throw new Error(`All CodeCraft API keys are cooling down. Next available in ${remainingSec}s.`);
    }

    available.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    const selected = available[0];
    selected.lastUsed = now;
    return selected.key;
  }

  markCooldown(keyString, durationMs = 30000) {
    const entry = this.keys.find(k => k.key === keyString);
    if (entry) {
      entry.cooldownUntil = Date.now() + durationMs;
      entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
      logger.warn(`CodeCraft key ${entry.masked} cooling down for ${Math.round(durationMs / 1000)}s (errors: ${entry.consecutiveErrors})`);
      this.emit('status-changed');
    }
  }

  markSuccess(keyString) {
    const entry = this.keys.find(k => k.key === keyString);
    if (entry) {
      entry.consecutiveErrors = 0;
    }
  }

  resetCooldowns() {
    for (const k of this.keys) {
      k.cooldownUntil = 0;
      k.consecutiveErrors = 0;
    }
    this.emit('status-changed');
  }

  /**
   * Validates a CodeCraft key by querying models endpoint
   */
  async testKey(keyString) {
    const key = (keyString || '').trim();
    if (!key) return { valid: false, error: 'Empty key provided' };

    const settings = settingsService.get();
    const baseUrl = (settings.codecraft?.baseUrl || 'https://codecraftapi.com/v1').replace(/\/+$/, '');

    try {
      const signal = typeof globalThis.AbortSignal !== 'undefined' && typeof globalThis.AbortSignal.timeout === 'function'
        ? globalThis.AbortSignal.timeout(12000)
        : undefined;

      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json'
        },
        signal
      });

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, error: `HTTP ${res.status}: ${text.slice(0, 150)}` };
      }

      const json = await res.json();
      const count = Array.isArray(json?.data) ? json.data.length : 0;
      return { valid: true, modelsCount: count };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

const codecraftKeyPool = new CodecraftKeyPoolService();
module.exports = codecraftKeyPool;
