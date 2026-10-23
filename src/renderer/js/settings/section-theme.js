/**
 * Settings Section: Theme
 * Manages Dark/Light/System theme modes, accent color presets,
 * glass blur intensity, reduced motion toggles, animated toolbar themes,
 * and luxury Pro badge style customizers with live preview.
 */

import { theme } from '../theme.js';
import { TOOLBAR_THEMES, PRO_BADGE_STYLES } from '../theme-mascots.js';

let markDirtyFn = () => {};
let currentAccentColor = '#10b981';
let currentToolbarTheme = 'capy-cafe';
let currentProBadgeStyle = 'royal-gold';

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

    // Render Animated Toolbar Themes Grid
    this.renderToolbarThemes();

    // Render Clone សម្លេង Pro Badge Styles Grid
    this.renderProBadgeStyles();
  },

  renderToolbarThemes() {
    const container = document.getElementById('toolbarThemesContainer');
    if (!container) return;

    container.innerHTML = TOOLBAR_THEMES.map(t => `
      <div class="theme-mascot-card ${t.id === currentToolbarTheme ? 'active' : ''}" 
           data-theme-id="${t.id}" 
           role="radio" 
           aria-checked="${t.id === currentToolbarTheme ? 'true' : 'false'}"
           tabindex="0"
           title="${t.name}: ${t.desc}">
        <div class="theme-mascot-preview" style="background: ${t.accent}14;">
          ${t.renderMascotSvg()}
        </div>
        <div class="theme-mascot-info">
          <div class="theme-mascot-title">${t.name}</div>
          <div class="theme-mascot-desc">${t.desc}</div>
        </div>
        <div class="card-check" aria-hidden="true">✓</div>
      </div>
    `).join('');

    container.querySelectorAll('.theme-mascot-card').forEach(card => {
      const onSelect = () => {
        const id = card.dataset.themeId;
        if (!id || id === currentToolbarTheme) return;
        markDirtyFn();
        this.selectToolbarTheme(id);
        theme.applyToolbarTheme(id);
      };

      card.addEventListener('click', onSelect);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      });
    });
  },

  renderProBadgeStyles() {
    const container = document.getElementById('proBadgeStylesContainer');
    if (!container) return;

    container.innerHTML = PRO_BADGE_STYLES.map(s => `
      <div class="pro-badge-card ${s.id === currentProBadgeStyle ? 'active' : ''}" 
           data-style-id="${s.id}" 
           role="radio" 
           aria-checked="${s.id === currentProBadgeStyle ? 'true' : 'false'}"
           tabindex="0"
           title="${s.name}">
        <div class="pro-badge-pill ${s.pillClass}">
          <span class="badge-icon">${s.icon}</span>
          <span class="badge-text">PRO Version</span>
        </div>
        <div class="pro-badge-card-name">${s.name}</div>
        <div class="card-check" aria-hidden="true">✓</div>
      </div>
    `).join('');

    container.querySelectorAll('.pro-badge-card').forEach(card => {
      const onSelect = () => {
        const id = card.dataset.styleId;
        if (!id || id === currentProBadgeStyle) return;
        markDirtyFn();
        this.selectProBadgeStyle(id);
        theme.applyProBadgeStyle(id);
      };

      card.addEventListener('click', onSelect);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      });
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

    // Toolbar theme & Pro badge style
    const tbTheme = themeSettings.toolbarTheme || 'capy-cafe';
    this.selectToolbarTheme(tbTheme);
    theme.applyToolbarTheme(tbTheme);

    const badgeStyle = themeSettings.proBadgeStyle || 'royal-gold';
    this.selectProBadgeStyle(badgeStyle);
    theme.applyProBadgeStyle(badgeStyle);
  },

  selectToolbarTheme(id) {
    currentToolbarTheme = id;
    const container = document.getElementById('toolbarThemesContainer');
    if (!container) return;
    container.querySelectorAll('.theme-mascot-card').forEach(card => {
      const match = card.dataset.themeId === id;
      card.classList.toggle('active', match);
      card.setAttribute('aria-checked', match ? 'true' : 'false');
    });
  },

  selectProBadgeStyle(id) {
    currentProBadgeStyle = id;
    const container = document.getElementById('proBadgeStylesContainer');
    if (!container) return;
    container.querySelectorAll('.pro-badge-card').forEach(card => {
      const match = card.dataset.styleId === id;
      card.classList.toggle('active', match);
      card.setAttribute('aria-checked', match ? 'true' : 'false');
    });
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
      reduceMotion: reduceMotionInp ? reduceMotionInp.checked : false,
      toolbarTheme: currentToolbarTheme || 'capy-cafe',
      proBadgeStyle: currentProBadgeStyle || 'royal-gold'
    };
  }
};
