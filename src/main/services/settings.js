/**
 * Persistent Settings Service (Schema Version 2)
 * Manages configuration for General, Theme, Gemini AI, ASR, Voice Presets,
 * Pronunciation, Shortcuts, and System options with automatic backward-compatible migration.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('../utils/logger');

const DEFAULT_SETTINGS = {
  schemaVersion: 2,
  general: {
    uiLanguage: 'km',
    targetLanguage: 'Khmer',
    defaultProjectFolder: '',
    cacheFolder: '',
    autosaveIntervalSec: 30,
    confirmDelete: true,
    startupAction: 'startScreen'
  },
  theme: {
    mode: 'dark', // 'dark' | 'light' | 'system'
    accentColor: '#10b981', // emerald teal
    glassBlurIntensity: 12, // 0 - 24 px
    reduceMotion: false,
    toolbarTheme: 'capy-cafe',
    proBadgeStyle: 'royal-gold'
  },
  gemini: {
    transcriptionModel: 'gemini-3.8-flash',
    translationModel: 'gemini-3.8-flash',
    maxConcurrency: 4,
    batchSize: 30,
    temperature: 0.2
  },
  codecraft: {
    apiKey: '',
    baseUrl: 'https://codecraftapi.com/v1',
    translationModel: 'gemini-3.7-flash',
    asrModel: 'whisper-1',
    temperature: 0.2,
    batchSize: 25,
    maxConcurrency: 3
  },
  cambai: {
    apiKey: '',
    speechModel: 'mars-8.1-flash-beta', // 'mars-8.1-flash-beta' | 'mars-81-flash' | 'mars-81' | 'mars-x-instruct'
    voiceId: 147320,
    language: 'km'
  },
  asr: {
    engine: 'faster-whisper', // 'faster-whisper' | 'gemini' | 'hybrid' | 'mock'
    whisperModel: 'base',
    whisperDevice: 'auto',
    whisperComputeType: 'auto',
    whisperLanguage: 'auto',
    beamSize: 5
  },
  tts: {
    engine: 'edge-tts',
    concurrency: 4
  },
  voicePresets: {
    A1: { name: 'Piseth Normal', baseVoice: 'km-KH-PisethNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%', gender: 'M' },
    A2: { name: 'Piseth Deep', baseVoice: 'km-KH-PisethNeural', rate: '+0%', pitch: '-4Hz', volume: '+0%', gender: 'M' },
    A3: { name: 'Sreymom Normal', baseVoice: 'km-KH-SreymomNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%', gender: 'F' },
    A4: { name: 'Piseth Fast', baseVoice: 'km-KH-PisethNeural', rate: '+10%', pitch: '+0Hz', volume: '+0%', gender: 'M' },
    A5: { name: 'Sreymom High', baseVoice: 'km-KH-SreymomNeural', rate: '+0%', pitch: '+5Hz', volume: '+0%', gender: 'F' }
  },
  shortcuts: {
    playPause: 'Space',
    split: 'KeyS',
    save: 'Ctrl+KeyS',
    undo: 'Ctrl+KeyZ',
    redo: 'Ctrl+KeyY',
    findReplace: 'Ctrl+KeyF',
    deleteRow: 'Delete',
    prevRow: 'ArrowUp',
    nextRow: 'ArrowDown'
  },
  system: {
    ffmpegThreads: 0, // 0 = auto
    developerMode: false
  },
  separation: {
    engine: 'demucs'
  }
};

class SettingsService {
  constructor() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.storagePath = null;
    this.initStoragePath();
    this.load();
  }

  getUserDataDir() {
    try {
      if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
      }
    } catch (_) {}
    return path.join(__dirname, '../../../.data');
  }

  initStoragePath() {
    const baseDir = this.getUserDataDir();
    const configDir = path.join(baseDir, 'config');
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
      } catch (_) {}
    }
    this.storagePath = path.join(configDir, 'settings.json');
  }

  getModelsDir() {
    const baseDir = this.getUserDataDir();
    const modelsDir = path.join(baseDir, 'models', 'whisper');
    if (!fs.existsSync(modelsDir)) {
      try {
        fs.mkdirSync(modelsDir, { recursive: true });
      } catch (_) {}
    }
    return modelsDir;
  }

  getCacheDir() {
    if (this.settings?.general?.cacheFolder) {
      const custom = this.settings.general.cacheFolder;
      if (!fs.existsSync(custom)) {
        try {
          fs.mkdirSync(custom, { recursive: true });
        } catch (_) {}
      }
      return custom;
    }

    const baseDir = this.getUserDataDir();
    const dir = path.join(baseDir, 'tts-cache');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
    }
    return dir;
  }

  /**
   * Safe migration from v1 to v2 schema without losing existing keys or presets
   */
  migrateFromV1(parsed) {
    logger.info('Migrating settings from schema v1 to v2...');
    const migrated = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    // Preserve ASR engine & whisper settings
    if (parsed.asrEngine) migrated.asr.engine = parsed.asrEngine;
    if (parsed.whisperModel) migrated.asr.whisperModel = parsed.whisperModel;
    if (parsed.whisperDevice) migrated.asr.whisperDevice = parsed.whisperDevice;
    if (parsed.whisperComputeType) migrated.asr.whisperComputeType = parsed.whisperComputeType;
    if (parsed.whisperLanguage) migrated.asr.whisperLanguage = parsed.whisperLanguage;

    // Preserve Gemini settings
    if (parsed.geminiModel) {
      migrated.gemini.translationModel = parsed.geminiModel;
      migrated.gemini.transcriptionModel = parsed.geminiModel;
    }
    if (parsed.geminiTemperature !== undefined) migrated.gemini.temperature = parsed.geminiTemperature;

    // Preserve Voice Presets
    if (parsed.voicePresets && typeof parsed.voicePresets === 'object') {
      migrated.voicePresets = {
        ...migrated.voicePresets,
        ...parsed.voicePresets
      };
    }

    // Preserve TTS settings
    if (parsed.ttsEngine) migrated.tts.engine = parsed.ttsEngine;
    if (parsed.concurrency) migrated.tts.concurrency = parsed.concurrency;

    migrated.schemaVersion = 2;
    return migrated;
  }

  load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);

        if (!parsed.schemaVersion || parsed.schemaVersion < 2) {
          this.settings = this.migrateFromV1(parsed);
          this.save();
        } else {
          // Merge sections safely with defaults
          this.settings = this._mergeDefaults(parsed);

          // Auto-heal deprecated model names to gemini-3.8-flash
          const DEPRECATED_MODELS = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-001',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash-lite-001',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro',
            'gemini-3.5-transcribe'
          ];
          if (DEPRECATED_MODELS.includes(this.settings.gemini.transcriptionModel)) {
            this.settings.gemini.transcriptionModel = 'gemini-3.8-flash';
          }
          if (DEPRECATED_MODELS.includes(this.settings.gemini.translationModel)) {
            this.settings.gemini.translationModel = 'gemini-3.8-flash';
          }
        }
        logger.info('Loaded settings successfully.');
      } else {
        this.save();
      }
    } catch (err) {
      logger.error(`Failed to load settings: ${err.message}`);
      const bakPath = `${this.storagePath}.bak`;
      if (fs.existsSync(bakPath)) {
        try {
          const bakData = fs.readFileSync(bakPath, 'utf-8');
          const parsed = JSON.parse(bakData);
          logger.info('Recovered settings from backup (.bak).');
          this.settings = this._mergeDefaults(parsed);
          try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.settings, null, 2), 'utf-8');
          } catch (_) {}
          return;
        } catch (_) {}
      }
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      try {
        fs.writeFileSync(this.storagePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      } catch (_) {}
    }
  }

  save() {
    try {
      const content = JSON.stringify(this.settings, null, 2);
      const tempPath = `${this.storagePath}.tmp`;
      const bakPath = `${this.storagePath}.bak`;

      // 1. Write to temporary file
      fs.writeFileSync(tempPath, content, 'utf-8');

      // 2. If storagePath exists, back it up to .bak
      if (fs.existsSync(this.storagePath)) {
        try {
          fs.copyFileSync(this.storagePath, bakPath);
        } catch (copyErr) {
          logger.warn(`Failed to create settings backup: ${copyErr.message}`);
        }
      }

      // 3. Atomically rename tempPath -> storagePath
      fs.renameSync(tempPath, this.storagePath);
      logger.info('Settings saved to disk.');
    } catch (err) {
      logger.error(`Failed to save settings: ${err.message}`);
    }
  }

  /**
   * Return complete settings with backward-compatible top-level keys
   */
  get() {
    return {
      ...this.settings,
      // Backward-compatibility mirror properties
      asrEngine: this.settings.asr.engine,
      whisperModel: this.settings.asr.whisperModel,
      whisperDevice: this.settings.asr.whisperDevice,
      whisperComputeType: this.settings.asr.whisperComputeType,
      whisperLanguage: this.settings.asr.whisperLanguage,
      geminiModel: this.settings.gemini.translationModel,
      ttsEngine: this.settings.tts.engine,
      concurrency: this.settings.tts.concurrency,
      modelsDir: this.getModelsDir(),
      cacheDir: this.getCacheDir()
    };
  }

  getSettings() {
    return this.get();
  }

  _mergeDefaults(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      general: { ...DEFAULT_SETTINGS.general, ...(parsed.general || {}) },
      theme: { ...DEFAULT_SETTINGS.theme, ...(parsed.theme || {}) },
      gemini: { ...DEFAULT_SETTINGS.gemini, ...(parsed.gemini || {}) },
      codecraft: { ...DEFAULT_SETTINGS.codecraft, ...(parsed.codecraft || {}) },
      cambai: { ...DEFAULT_SETTINGS.cambai, ...(parsed.cambai || {}) },
      asr: { ...DEFAULT_SETTINGS.asr, ...(parsed.asr || {}) },
      tts: { ...DEFAULT_SETTINGS.tts, ...(parsed.tts || {}) },
      voicePresets: { ...DEFAULT_SETTINGS.voicePresets, ...(parsed.voicePresets || {}) },
      shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(parsed.shortcuts || {}) },
      system: { ...DEFAULT_SETTINGS.system, ...(parsed.system || {}) },
      separation: { ...DEFAULT_SETTINGS.separation, ...(parsed.separation || {}) }
    };
  }

  update(partial) {
    if (!partial || typeof partial !== 'object') return { success: true, ...this.get() };

    // Support section updates
    if (partial.general) this.settings.general = { ...this.settings.general, ...partial.general };
    if (partial.theme) this.settings.theme = { ...this.settings.theme, ...partial.theme };
    if (partial.gemini) this.settings.gemini = { ...this.settings.gemini, ...partial.gemini };
    if (partial.codecraft) this.settings.codecraft = { ...this.settings.codecraft, ...partial.codecraft };
    if (partial.cambai) this.settings.cambai = { ...this.settings.cambai, ...partial.cambai };
    if (partial.asr) this.settings.asr = { ...this.settings.asr, ...partial.asr };
    if (partial.tts) this.settings.tts = { ...this.settings.tts, ...partial.tts };
    if (partial.voicePresets) this.settings.voicePresets = { ...this.settings.voicePresets, ...partial.voicePresets };
    if (partial.shortcuts) this.settings.shortcuts = { ...this.settings.shortcuts, ...partial.shortcuts };
    if (partial.system) this.settings.system = { ...this.settings.system, ...partial.system };
    if (partial.separation) this.settings.separation = { ...this.settings.separation, ...partial.separation };

    // Range clamping & sanitization
    if (this.settings.tts?.concurrency != null) {
      this.settings.tts.concurrency = Math.max(1, Math.min(8, Number(this.settings.tts.concurrency) || 3));
    }
    if (this.settings.gemini?.maxConcurrency != null) {
      this.settings.gemini.maxConcurrency = Math.max(1, Math.min(6, Number(this.settings.gemini.maxConcurrency) || 3));
    }
    if (this.settings.codecraft?.batchSize != null) {
      this.settings.codecraft.batchSize = Math.max(5, Math.min(50, Number(this.settings.codecraft.batchSize) || 25));
    }
    if (this.settings.codecraft?.temperature != null) {
      this.settings.codecraft.temperature = Math.max(0, Math.min(1, Number(this.settings.codecraft.temperature) || 0.2));
    }

    // Backward-compatibility legacy top-level keys
    if (partial.asrEngine) this.settings.asr.engine = partial.asrEngine;
    if (partial.whisperModel) this.settings.asr.whisperModel = partial.whisperModel;
    if (partial.whisperDevice) this.settings.asr.whisperDevice = partial.whisperDevice;
    if (partial.ttsEngine) this.settings.tts.engine = partial.ttsEngine;
    if (partial.concurrency) this.settings.tts.concurrency = Math.max(1, Math.min(8, Number(partial.concurrency) || 3));
    if (partial.separationEngine) this.settings.separation.engine = partial.separationEngine;

    this.save();
    return { success: true, ...this.get() };
  }

  resetSection(section) {
    if (DEFAULT_SETTINGS[section]) {
      this.settings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
      this.save();
    }
    return { success: true, ...this.get() };
  }
}

const settingsService = new SettingsService();
settingsService.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports = settingsService;
