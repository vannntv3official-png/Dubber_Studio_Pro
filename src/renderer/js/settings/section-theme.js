/**
 * Settings Section: Theme
 * Manages Dark/Light/System theme modes, accent color presets,
 * glass blur intensity, and reduced motion toggles with live preview.
 */

import { theme } from '../theme.js';

let markDirtyFn = () => {};
let currentAccentColor = '#10b981';

export const sectionTheme = {
  id: 'secTheme',

  init(ctx) {
    if (ctx && typeof ctx.markDirty === 'function') {
      markDirtyFn = ctx.markDirty;
    }

    const modeSel = document.getElementById('setThemeMode');
    const blurRange = document.getElementById('setThemeBlur');
    const blurOut = document.getElementById('setThemeBlurOut');
    const reduceMotionInp = document.getElementById('setThemeReduceMotion');
    const accentRow = document.getElementById('accentColorRow');

    // Theme Mode change with live preview
    modeSel?.addEventListener('change', () => {
      markDirtyFn();
      this.applyMode(modeSel.value);
    });

    // Accent Color preset buttons with live preview
    accentRow?.querySelectorAll('.color-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (!color) return;
        markDirtyFn();
        this.selectAccentColor(color);
        this.applyAccent(color);
      });
    });

    // Glass Blur slider with live preview
    blurRange?.addEventListener('input', () => {
      markDirtyFn();
      const val = parseInt(blurRange.value, 10);
      if (blurOut) blurOut.textContent = `${val}px`;
      this.applyBlur(val);
    });

    // Reduce Motion checkbox with live preview
    reduceMotionInp?.addEventListener('change', () => {
      markDirtyFn();
      this.applyReduceMotion(reduceMotionInp.checked);
    });
  },

  load(settings) {
    const themeSettings = settings?.theme || {};

    const modeSel = document.getElementById('setThemeMode');
    const blurRange = document.getElementById('setThemeBlur');
    const blurOut = document.getElementById('setThemeBlurOut');
    const reduceMotionInp = document.getElementById('setThemeReduceMotion');

    const mode = themeSettings.mode || 'dark';
    if (modeSel) modeSel.value = mode;
    this.applyMode(mode);

    const accent = themeSettings.accentColor || '#10b981';
    this.selectAccentColor(accent);
    this.applyAccent(accent);

    const blur = themeSettings.glassBlurIntensity ?? 12;
    if (blurRange) blurRange.value = blur;
    if (blurOut) blurOut.textContent = `${blur}px`;
    this.applyBlur(blur);

    const reduceMotion = Boolean(themeSettings.reduceMotion);
    if (reduceMotionInp) reduceMotionInp.checked = reduceMotion;
    this.applyReduceMotion(reduceMotion);
  },

  selectAccentColor(color) {
    currentAccentColor = color;
    const accentRow = document.getElementById('accentColorRow');
    if (!accentRow) return;
    accentRow.querySelectorAll('.color-dot').forEach(btn => {
      if (btn.dataset.color?.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  applyMode(mode) {
    if (mode === 'system') {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      theme.applyTheme(prefersLight ? 'light' : 'dark');
    } else {
      theme.applyTheme(mode);
    }
  },

  applyAccent(color) {
    if (!color) return;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--ambient-2', color);
    // Provide a complementary hover tint
    document.documentElement.style.setProperty('--accent-hover', color + 'dd');
  },

  applyBlur(intensity) {
    const val = Math.max(0, Math.min(32, parseInt(intensity, 10) || 0));
    document.documentElement.style.setProperty('--blur', `blur(${val}px) saturate(140%)`);
  },

  applyReduceMotion(reduce) {
    if (reduce) {
      document.documentElement.dataset.reduceMotion = 'true';
    } else {
      delete document.documentElement.dataset.reduceMotion;
    }
  },

  getData() {
    const modeSel = document.getElementById('setThemeMode');
    const blurRange = document.getElementById('setThemeBlur');
    const reduceMotionInp = document.getElementById('setThemeReduceMotion');

    return {
      mode: modeSel?.value || 'dark',
      accentColor: currentAccentColor || '#10b981',
      glassBlurIntensity: parseInt(blurRange?.value || '12', 10),
      reduceMotion: reduceMotionInp ? reduceMotionInp.checked : false
    };
  }
};
