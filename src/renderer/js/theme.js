/**
 * Theme Manager (Dark / Light Glassmorphism)
 */

import { ipcClient } from './ipc-client.js';
import { LucideIcons } from './icons.js';

class ThemeManager {
  constructor() {
    this.currentTheme = 'dark';
    this.accentColor = '#10b981';
    this.glassBlur = 12;
    this.reduceMotion = false;
  }

  init() {
    // 1. Immediate synchronous restoration from localStorage/window to prevent ANY flash before paint
    try {
      const savedTheme = localStorage.getItem('dubber_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        this.currentTheme = savedTheme;
      }
      const savedAccent = localStorage.getItem('dubber_accent');
      if (savedAccent) this.accentColor = savedAccent;

      const savedBlur = localStorage.getItem('dubber_blur');
      if (savedBlur != null) this.glassBlur = parseInt(savedBlur, 10);

      const savedMotion = localStorage.getItem('dubber_reduce_motion');
      if (savedMotion != null) this.reduceMotion = savedMotion === 'true';
    } catch (_) {}

    this.applyAll();

    // 2. Asynchronously sync with persistent settings.json
    this.syncFromSettings();
  }

  applyAll() {
    this.applyTheme(this.currentTheme);
    this.applyAccent(this.accentColor);
    this.applyBlur(this.glassBlur);
    this.applyReduceMotion(this.reduceMotion);
  }

  async syncFromSettings() {
    try {
      const settings = await ipcClient.getSettings();
      if (settings?.theme) {
        if (settings.theme.mode) this.applyTheme(settings.theme.mode);
        if (settings.theme.accentColor) this.applyAccent(settings.theme.accentColor);
        if (settings.theme.glassBlurIntensity != null) this.applyBlur(settings.theme.glassBlurIntensity);
        if (settings.theme.reduceMotion != null) this.applyReduceMotion(settings.theme.reduceMotion);
      }
    } catch (_) {}
  }

  getTheme() {
    return this.currentTheme;
  }

  applyTheme(themeName) {
    this.currentTheme = themeName;
    const isLight = themeName === 'light';

    if (isLight) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const themeBtn = document.getElementById('theme');
    if (themeBtn) {
      themeBtn.innerHTML = isLight ? LucideIcons.sun : LucideIcons.moon;
      themeBtn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    }

    try {
      localStorage.setItem('dubber_theme', themeName);
    } catch (_) {}

    // Update native titlebar overlay button colors in Electron
    ipcClient.setTheme(themeName);
  }

  applyAccent(color) {
    if (!color) return;
    this.accentColor = color;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--ambient-2', color);
    document.documentElement.style.setProperty('--accent-hover', color + 'dd');
    try { localStorage.setItem('dubber_accent', color); } catch (_) {}
  }

  applyBlur(intensity) {
    const val = Math.max(0, Math.min(32, parseInt(intensity, 10) || 0));
    this.glassBlur = val;
    document.documentElement.style.setProperty('--blur', `blur(${val}px) saturate(140%)`);
    try { localStorage.setItem('dubber_blur', String(val)); } catch (_) {}
  }

  applyReduceMotion(reduce) {
    this.reduceMotion = Boolean(reduce);
    if (this.reduceMotion) {
      document.documentElement.dataset.reduceMotion = 'true';
    } else {
      delete document.documentElement.dataset.reduceMotion;
    }
    try { localStorage.setItem('dubber_reduce_motion', String(this.reduceMotion)); } catch (_) {}
  }

  toggleTheme() {
    const next = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(next);
    return next;
  }
}

export const theme = new ThemeManager();
