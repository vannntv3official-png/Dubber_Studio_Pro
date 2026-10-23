/**
 * Pronunciation Dictionary Service
 * Allows users to define custom phonetic mappings (Written text -> Spoken text)
 * applied to dialogue before sending it to Edge-TTS or other TTS engines.
 * Fixes Khmer words and proper nouns that are pronounced incorrectly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('../utils/logger');

class PronunciationService {
  constructor() {
    this.entries = []; // Array of { id, written, spoken, lang }
    this.storagePath = null;
    this.initStoragePath();
    this.load();
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
    this.storagePath = path.join(configDir, 'pronunciation.json');
  }

  load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed;
          logger.info(`Loaded ${this.entries.length} pronunciation dictionary rules.`);
          return;
        }
      }
    } catch (err) {
      logger.error(`Failed to load pronunciation dictionary: ${err.message}`);
    }

    // Per Item 12: Do not seed default rules silently. Keep empty until user requests.
    this.entries = [];
    this.save();
  }

  /**
   * Adds example pronunciation rules explicitly on user request.
   */
  addExampleRules() {
    const examples = [
      { written: 'AI', spoken: 'អេអាយ', lang: 'km' },
      { written: 'Studio', spoken: 'ស្ទូឌីយោ', lang: 'km' },
      { written: 'PRO', spoken: 'ប្រូ', lang: 'km' },
      { written: 'OK', spoken: 'អូខេ', lang: 'km' },
      { written: 'FBI', spoken: 'អេហ្វប៊ីអាយ', lang: 'km' },
      { written: 'CIA', spoken: 'ស៊ីអាយអេ', lang: 'km' },
      { written: 'Doctor', spoken: 'ដុកទ័រ', lang: 'km' },
      { written: 'Police', spoken: 'ប៉ូលីស', lang: 'km' },
      { written: 'Boss', spoken: 'មេ', lang: 'km' },
      { written: 'Sir', spoken: 'សឺ', lang: 'km' },
      { written: 'Madam', spoken: 'ម៉ាដាម', lang: 'km' },
      { written: 'Miss', spoken: 'កញ្ញា', lang: 'km' },
      { written: 'Hero', spoken: 'ហេរ៉ូ', lang: 'km' },
      { written: 'Team', spoken: 'ក្រុម', lang: 'km' },
      { written: 'Game', spoken: 'ហ្គេម', lang: 'km' },
      { written: 'Level', spoken: 'ឡេវែល', lang: 'km' },
      { written: 'Camera', spoken: 'កាមេរ៉ា', lang: 'km' },
      { written: 'Video', spoken: 'វីដេអូ', lang: 'km' },
      { written: 'iPhone', spoken: 'អាយហ្វូន', lang: 'km' },
      { written: 'Facebook', spoken: 'ហ្វេសប៊ុក', lang: 'km' },
      { written: 'YouTube', spoken: 'យូធូប', lang: 'km' },
      { written: 'TikTok', spoken: 'ទីកតុក', lang: 'km' },
      { written: 'Coffee', spoken: 'កាហ្វេ', lang: 'km' },
      { written: 'Pizza', spoken: 'ភីហ្សា', lang: 'km' },
      { written: 'Party', spoken: 'ផាធី', lang: 'km' },
      { written: 'Virus', spoken: 'វីរុស', lang: 'km' }
    ];
    let addedCount = 0;
    for (const ex of examples) {
      if (!this.entries.some(e => (e.written || '').toLowerCase() === ex.written.toLowerCase())) {
        this.entries.push({
          id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          written: ex.written,
          spoken: ex.spoken,
          lang: ex.lang || 'km'
        });
        addedCount++;
      }
    }
    if (addedCount > 0) {
      this.save();
    }
    return { success: true, addedCount, rules: this.getAll() };
  }

  save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`Failed to save pronunciation dictionary: ${err.message}`);
    }
  }

  getAll() {
    return [...this.entries];
  }

  getRules() {
    return this.getAll();
  }

  setAll(newEntries) {
    if (!Array.isArray(newEntries)) return false;
    this.entries = newEntries.map((e, idx) => ({
      id: e.id || `p_${Date.now()}_${idx}`,
      written: String(e.written || '').trim(),
      spoken: String(e.spoken || '').trim(),
      lang: String(e.lang || 'km').trim()
    })).filter(e => e.written.length > 0 && e.spoken.length > 0);

    this.save();
    return true;
  }

  addEntry({ written, spoken, lang = 'km' }) {
    const w = String(written || '').trim();
    const s = String(spoken || '').trim();
    if (!w || !s) throw new Error('Both written and spoken text are required');

    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = { id, written: w, spoken: s, lang: lang || 'km' };
    this.entries.push(entry);
    this.save();
    return entry;
  }

  updateEntry(id, { written, spoken, lang }) {
    const item = this.entries.find(e => e.id === id);
    if (!item) return false;
    if (written !== undefined) item.written = String(written).trim();
    if (spoken !== undefined) item.spoken = String(spoken).trim();
    if (lang !== undefined) item.lang = String(lang).trim();
    this.save();
    return true;
  }

  deleteEntry(id) {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Applies the pronunciation rules to input text.
   * Matches longer phrases first to avoid partial substitutions.
   */
  apply(text, lang = 'km') {
    if (!text || typeof text !== 'string') return text;
    let result = text;

    // Filter by matching lang or universal
    const rules = this.entries
      .filter(e => !e.lang || e.lang === 'all' || e.lang === lang)
      .sort((a, b) => b.written.length - a.written.length);

    for (const rule of rules) {
      if (!rule.written || !rule.spoken) continue;
      // If rule is purely ASCII/word characters, use word boundary; else use global substring replace
      const isAsciiWord = /^[A-Za-z0-9_]+$/.test(rule.written);
      try {
        const pattern = isAsciiWord
          ? new RegExp(`\\b${rule.written}\\b`, 'gi')
          : new RegExp(rule.written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        result = result.replace(pattern, rule.spoken);
      } catch (_) {}
    }

    return result;
  }

  /**
   * Returns a deterministic 8-character hash of the current pronunciation dictionary.
   * Included in TTS cache key so changes immediately bust the cache and regenerate audio.
   */
  getHash() {
    const serialized = this.entries
      .map(e => `${e.written}->${e.spoken}@${e.lang}`)
      .sort()
      .join('|');
    return crypto.createHash('md5').update(serialized).digest('hex').slice(0, 8);
  }

  exportToJson() {
    return JSON.stringify(this.entries, null, 2);
  }

  exportToCsv() {
    const lines = ['written,spoken,lang'];
    for (const e of this.entries) {
      const w = `"${(e.written || '').replace(/"/g, '""')}"`;
      const s = `"${(e.spoken || '').replace(/"/g, '""')}"`;
      const l = `"${(e.lang || 'km').replace(/"/g, '""')}"`;
      lines.push(`${w},${s},${l}`);
    }
    return lines.join('\n');
  }

  importFromJson(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Invalid JSON format: expected array');
    let imported = 0;
    for (const item of parsed) {
      if (item && item.written && item.spoken) {
        // Avoid exact duplicate written entries
        const existing = this.entries.find(e => e.written.toLowerCase() === item.written.toLowerCase());
        if (!existing) {
          this.entries.push({
            id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            written: item.written.trim(),
            spoken: item.spoken.trim(),
            lang: item.lang || 'km'
          });
          imported++;
        }
      }
    }
    this.save();
    return imported;
  }

  importFromCsv(csvStr) {
    const lines = csvStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let imported = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && line.toLowerCase().includes('written')) continue; // Skip header
      const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const w = parts[0];
        const s = parts[1];
        const l = parts[2] || 'km';
        if (!this.entries.some(e => e.written.toLowerCase() === w.toLowerCase())) {
          this.entries.push({
            id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            written: w,
            spoken: s,
            lang: l
          });
          imported++;
        }
      }
    }
    this.save();
    return imported;
  }
}

const pronunciationService = new PronunciationService();
module.exports = pronunciationService;
