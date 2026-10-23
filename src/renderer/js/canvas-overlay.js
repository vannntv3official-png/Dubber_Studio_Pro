/**
 * Interactive On-Video Canvas Overlay Module
 * Enables direct drag & drop positioning for subtitles and watermarks
 * with magnetic snapping guides (center lines, bottom margin)
 * and coordinate persistence in project state.
 */

import { state } from './state.js';
import { ui } from './ui.js';

class CanvasOverlayManager {
  constructor() {
    this.container = null;
    this.capEl = null;
    this.wmEl = null;
    this.blurEl = null;
    this.snapGuideH = null;
    this.snapGuideV = null;
    this.posBadge = null;

    this.activeDrag = null; // { el, key, startX, startY, origX, origY, ... }
    this.isDragging = false;
  }

  init() {
    this.container = document.getElementById('previewContainer');
    this.capEl = document.getElementById('cap');
    this.wmEl = document.getElementById('watermarkOverlay');
    this.blurEl = document.getElementById('blurOverlay');
    this.snapGuideH = document.getElementById('snapGuideH');
    this.snapGuideV = document.getElementById('snapGuideV');
    this.posBadge = document.getElementById('overlayPosBadge');

    if (!this.container) return;

    this.setupDraggable(this.capEl, 'subtitle', 50, 86, 'Subtitle');
    this.setupDraggable(this.wmEl, 'watermark', 82, 14, 'Watermark');
    this.setupBlurOverlay();

    // Subtitle Caption button on preview toolbar
    document.getElementById('btnCaption')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.showToast('✨ Subtitle Caption — Coming Soon (មុខងារនេះនឹងមកដល់ឆាប់ៗនេះ!)', 2500);
    });

    // Global drag move and release handlers
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());

    // Listen to project load to restore saved positions
    state.on('projectLoaded', () => this.restorePositions());
    state.on('change', (payload) => {
      if (payload && payload.source === 'undo') {
        this.restorePositions();
      }
    });

    this.restorePositions();
    this.initQuickStudio();
  }

  setupDraggable(el, key, defaultX, defaultY, label) {
    if (!el) return;

    // Start drag on mousedown
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      e.preventDefault();
      e.stopPropagation();

      const rect = this.container.getBoundingClientRect();
      const currentXPct = parseFloat(el.style.left) || defaultX;
      const currentYPct = parseFloat(el.style.top) || defaultY;

      this.activeDrag = {
        el,
        key,
        label,
        defaultX,
        defaultY,
        containerRect: rect,
        curXPct: currentXPct,
        curYPct: currentYPct
      };

      this.isDragging = true;
      el.classList.add('dragging');

      if (this.posBadge) {
        this.posBadge.hidden = false;
        this.posBadge.textContent = `${label}: X: ${Math.round(currentXPct)}% · Y: ${Math.round(currentYPct)}%`;
      }
    });

    // Direct wheel scaling on Subtitle box
    if (key === 'subtitle') {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const curScale = typeof state.project.subtitleScalePct === 'number'
          ? state.project.subtitleScalePct
          : 100;
        const step = e.shiftKey ? 15 : 5;
        const delta = e.deltaY < 0 ? step : -step;
        const newScale = Math.max(50, Math.min(250, curScale + delta));
        state.project.subtitleScalePct = newScale;
        state.markDirty();
        state.emit('subtitleScaleChange', newScale);

        if (this.posBadge) {
          this.posBadge.hidden = false;
          this.posBadge.textContent = `🔤 Subtitle Size: ${newScale}%`;
          clearTimeout(this._badgeTimer);
          this._badgeTimer = setTimeout(() => {
            if (!this.isDragging && this.posBadge) this.posBadge.hidden = true;
          }, 1200);
        }
      }, { passive: false });
    }

    // Double click: open Quick Studio on subtitle, reset on others
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'subtitle') {
        this.openSubtitleQuickStudio();
      } else {
        this.resetPosition(key, defaultX, defaultY, label);
      }
    });
  }

  setupBlurOverlay() {
    if (!this.blurEl) return;

    const defaultBox = { x: 5, y: 84, w: 90, h: 14, intensity: 16, tint: 35 };

    // Mousedown on blur overlay (either move whole box or resize via handle)
    this.blurEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      // Do not initiate drag if user clicked HUD buttons or popover controls
      if (e.target.closest('.blur-hud-actions') || e.target.closest('.blur-control-popover')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const rect = this.container.getBoundingClientRect();
      const currentX = parseFloat(this.blurEl.style.left) || defaultBox.x;
      const currentY = parseFloat(this.blurEl.style.top) || defaultBox.y;
      const currentW = parseFloat(this.blurEl.style.width) || defaultBox.w;
      const currentH = parseFloat(this.blurEl.style.height) || defaultBox.h;

      const handle = e.target.dataset.handle;

      if (handle) {
        // RESIZING MODE
        this.activeDrag = {
          mode: 'resize',
          key: 'blur',
          label: 'Blur Mask',
          handle,
          el: this.blurEl,
          startX: e.clientX,
          startY: e.clientY,
          origX: currentX,
          origY: currentY,
          origW: currentW,
          origH: currentH,
          curXPct: currentX,
          curYPct: currentY,
          curWPct: currentW,
          curHPct: currentH,
          containerRect: rect
        };
        this.blurEl.classList.add('resizing');
      } else {
        // MOVING MODE
        this.activeDrag = {
          mode: 'move',
          key: 'blur',
          label: 'Blur Mask',
          el: this.blurEl,
          startX: e.clientX,
          startY: e.clientY,
          origX: currentX,
          origY: currentY,
          origW: currentW,
          origH: currentH,
          curXPct: currentX,
          curYPct: currentY,
          curWPct: currentW,
          curHPct: currentH,
          containerRect: rect
        };
        this.blurEl.classList.add('dragging');
      }

      this.isDragging = true;
      if (this.posBadge) {
        this.posBadge.hidden = false;
        this.posBadge.textContent = `Blur Mask: X: ${Math.round(currentX)}% · Y: ${Math.round(currentY)}% · W: ${Math.round(currentW)}% · H: ${Math.round(currentH)}%`;
      }
    });

    // Mouse wheel sizing on blur mask (wheel -> height, Shift+wheel -> width)
    this.blurEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const overlays = state.project.overlays?.blur || defaultBox;
      let curX = overlays.xPercent ?? defaultBox.x;
      let curY = overlays.yPercent ?? defaultBox.y;
      let curW = overlays.wPercent ?? defaultBox.w;
      let curH = overlays.hPercent ?? defaultBox.h;

      const step = e.altKey ? 1 : 2;
      const delta = e.deltaY < 0 ? step : -step;

      if (e.shiftKey) {
        curW = Math.max(10, Math.min(100 - curX, Math.round((curW + delta) * 10) / 10));
      } else {
        curH = Math.max(4, Math.min(80, Math.round((curH + delta) * 10) / 10));
        if (curY + curH > 100) {
          curY = Math.max(0, 100 - curH);
        }
      }

      this.blurEl.style.left = `${curX}%`;
      this.blurEl.style.top = `${curY}%`;
      this.blurEl.style.width = `${curW}%`;
      this.blurEl.style.height = `${curH}%`;

      state.project.overlays = state.project.overlays || {};
      const curBlur = state.project.overlays.blur || {};
      state.project.overlays.blur = {
        ...curBlur,
        xPercent: curX,
        yPercent: curY,
        wPercent: curW,
        hPercent: curH
      };
      state.markDirty();
      this.updateBlurPopoverPosition();

      if (this.posBadge) {
        this.posBadge.hidden = false;
        this.posBadge.textContent = `Blur Mask: W: ${Math.round(curW)}% · H: ${Math.round(curH)}%`;
        clearTimeout(this._blurBadgeTimer);
        this._blurBadgeTimer = setTimeout(() => {
          if (!this.isDragging && this.posBadge) this.posBadge.hidden = true;
        }, 1200);
      }
    }, { passive: false });

    // Double-click to reset blur mask to default
    this.blurEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('.blur-hud-actions') || e.target.closest('.blur-control-popover')) return;
      e.preventDefault();
      e.stopPropagation();
      this.resetBlurPosition();
    });

    // HUD Header Buttons
    const settingsBtn = document.getElementById('blurHudSettingsBtn');
    const popover = document.getElementById('blurControlPopover');
    settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!popover) return;
      popover.hidden = !popover.hidden;
      this.updateBlurPopoverPosition();
      this.syncBlurHudUI();
    });

    document.getElementById('blurHudResetBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetBlurPosition();
    });

    document.getElementById('blurHudCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.previewBlur = false;
      if (this.blurEl) this.blurEl.hidden = true;
      const blurBtn = document.getElementById('btnBlur');
      blurBtn?.classList.remove('on');
      ui.showToast('Blur mask hidden');
    });

    // Blur Popover Sliders
    const intensitySlider = document.getElementById('blurIntensitySlider');
    const intensityVal = document.getElementById('blurIntensityVal');
    const tintSlider = document.getElementById('blurTintSlider');
    const tintVal = document.getElementById('blurTintVal');

    intensitySlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (intensityVal) intensityVal.textContent = `${val}px`;
      this.setBlurIntensity(val);
    });

    tintSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (tintVal) tintVal.textContent = `${val}%`;
      this.setBlurTint(val);
    });

    // Alignment Presets
    const presetMap = {
      bottom: { x: 5, y: 84, w: 90, h: 14, name: 'Bottom Subtitle' },
      center: { x: 5, y: 44, w: 90, h: 14, name: 'Center' },
      top:    { x: 5, y: 4,  w: 90, h: 14, name: 'Top Title' },
      full:   { x: 0, y: 82, w: 100, h: 18, name: 'Full Width Bottom' }
    };

    ['Bottom', 'Center', 'Top', 'Full'].forEach(k => {
      const btn = document.getElementById(`blurPreset${k}Btn`);
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = presetMap[k.toLowerCase()];
        if (p) this.applyBlurPreset(p);
      });
    });

    // Close popover when clicking outside in preview container
    this.container?.addEventListener('mousedown', (e) => {
      if (popover && !popover.hidden) {
        if (!popover.contains(e.target) && !settingsBtn?.contains(e.target)) {
          popover.hidden = true;
        }
      }
    });

    // Initial styles
    this.applyBlurVisualStyles();
    this.syncBlurHudUI();
  }

  setBlurIntensity(val) {
    state.project.overlays = state.project.overlays || {};
    state.project.overlays.blur = state.project.overlays.blur || { xPercent: 5, yPercent: 84, wPercent: 90, hPercent: 14 };
    state.project.overlays.blur.intensity = val;
    state.markDirty();
    this.applyBlurVisualStyles();
  }

  setBlurTint(val) {
    state.project.overlays = state.project.overlays || {};
    state.project.overlays.blur = state.project.overlays.blur || { xPercent: 5, yPercent: 84, wPercent: 90, hPercent: 14 };
    state.project.overlays.blur.tint = val;
    state.markDirty();
    this.applyBlurVisualStyles();
  }

  applyBlurVisualStyles() {
    if (!this.blurEl) return;
    const blur = state.project?.overlays?.blur || {};
    const intensity = blur.intensity ?? 16;
    const tint = blur.tint ?? 35;
    this.blurEl.style.backdropFilter = `blur(${intensity}px)`;
    this.blurEl.style.webkitBackdropFilter = `blur(${intensity}px)`;
    this.blurEl.style.backgroundColor = `rgba(0, 0, 0, ${(tint / 100).toFixed(2)})`;
  }

  applyBlurPreset({ x, y, w, h, name }) {
    if (this.blurEl) {
      this.blurEl.style.left = `${x}%`;
      this.blurEl.style.top = `${y}%`;
      this.blurEl.style.width = `${w}%`;
      this.blurEl.style.height = `${h}%`;
    }

    state.project.overlays = state.project.overlays || {};
    const cur = state.project.overlays.blur || {};
    state.project.overlays.blur = {
      ...cur,
      xPercent: x,
      yPercent: y,
      wPercent: w,
      hPercent: h
    };
    state.markDirty();
    this.updateBlurPopoverPosition();
    if (typeof ui !== 'undefined' && ui.showToast) {
      ui.showToast(`Applied ${name} Blur Preset`, 1600);
    }
  }

  updateBlurPopoverPosition() {
    if (typeof document === 'undefined') return;
    const popover = document.getElementById('blurControlPopover');
    if (!popover || !this.blurEl) return;
    const topPct = parseFloat(this.blurEl.style.top) || 84;
    if (topPct < 28) {
      popover.classList.add('popover-flipped');
    } else {
      popover.classList.remove('popover-flipped');
    }
  }

  syncBlurHudUI() {
    if (typeof document === 'undefined') return;
    const blur = state.project?.overlays?.blur || {};
    const intensity = blur.intensity ?? 16;
    const tint = blur.tint ?? 35;
    const intensitySlider = document.getElementById('blurIntensitySlider');
    const intensityVal = document.getElementById('blurIntensityVal');
    const tintSlider = document.getElementById('blurTintSlider');
    const tintVal = document.getElementById('blurTintVal');

    if (intensitySlider) intensitySlider.value = intensity;
    if (intensityVal) intensityVal.textContent = `${intensity}px`;
    if (tintSlider) tintSlider.value = tint;
    if (tintVal) tintVal.textContent = `${tint}%`;
  }

  resetBlurPosition() {
    const defaultBox = { x: 5, y: 84, w: 90, h: 14, intensity: 16, tint: 35 };
    if (this.blurEl) {
      this.blurEl.style.left = `${defaultBox.x}%`;
      this.blurEl.style.top = `${defaultBox.y}%`;
      this.blurEl.style.width = `${defaultBox.w}%`;
      this.blurEl.style.height = `${defaultBox.h}%`;
    }

    state.project.overlays = state.project.overlays || {};
    state.project.overlays.blur = {
      xPercent: defaultBox.x,
      yPercent: defaultBox.y,
      wPercent: defaultBox.w,
      hPercent: defaultBox.h,
      intensity: defaultBox.intensity,
      tint: defaultBox.tint
    };
    this.applyBlurVisualStyles();
    this.syncBlurHudUI();
    this.updateBlurPopoverPosition();
    state.markDirty();
    if (typeof ui !== 'undefined' && ui.showToast) {
      ui.showToast('Reset Blur mask position, size & styles', 1800);
    }
  }

  onMouseMove(e) {
    if (!this.isDragging || !this.activeDrag || !this.container) return;

    const { el, key, label, containerRect } = this.activeDrag;
    const rect = this.container.getBoundingClientRect();

    // Special handling for Blur Mask (supports both Move and Handle Resize)
    if (key === 'blur') {
      const { mode, handle, startX, startY, origX, origY, origW, origH } = this.activeDrag;
      const deltaXPct = ((e.clientX - startX) / rect.width) * 100;
      const deltaYPct = ((e.clientY - startY) / rect.height) * 100;

      if (mode === 'resize') {
        let newX = origX;
        let newY = origY;
        let newW = origW;
        let newH = origH;

        if (handle.includes('r')) {
          newW = Math.max(8, Math.min(100 - origX, origW + deltaXPct));
        } else if (handle.includes('l')) {
          newX = Math.max(0, Math.min(origX + origW - 8, origX + deltaXPct));
          newW = origW + (origX - newX);
        }

        if (handle.includes('b')) {
          newH = Math.max(4, Math.min(100 - origY, origH + deltaYPct));
        } else if (handle.includes('t')) {
          newY = Math.max(0, Math.min(origY + origH - 4, origY + deltaYPct));
          newH = origH + (origY - newY);
        }

        this.activeDrag.curXPct = newX;
        this.activeDrag.curYPct = newY;
        this.activeDrag.curWPct = newW;
        this.activeDrag.curHPct = newH;

        this.blurEl.style.left = `${newX.toFixed(1)}%`;
        this.blurEl.style.top = `${newY.toFixed(1)}%`;
        this.blurEl.style.width = `${newW.toFixed(1)}%`;
        this.blurEl.style.height = `${newH.toFixed(1)}%`;

        if (this.posBadge) {
          this.posBadge.textContent = `Blur Size: W: ${Math.round(newW)}% · H: ${Math.round(newH)}% (X: ${Math.round(newX)}%, Y: ${Math.round(newY)}%)`;
        }
        return;
      }

      // Move Mode for Blur
      let newX = Math.max(0, Math.min(100 - origW, origX + deltaXPct));
      let newY = Math.max(0, Math.min(100 - origH, origY + deltaYPct));

      // Horizontal magnetic center snap (50%)
      const centerX = newX + origW / 2;
      if (Math.abs(centerX - 50) < 2) {
        newX = 50 - origW / 2;
        if (this.snapGuideV) {
          this.snapGuideV.style.left = '50%';
          this.snapGuideV.hidden = false;
        }
      } else {
        if (this.snapGuideV) this.snapGuideV.hidden = true;
      }

      // Bottom baseline snap (98%)
      if (Math.abs((newY + origH) - 98) < 2) {
        newY = 98 - origH;
        if (this.snapGuideH) {
          this.snapGuideH.style.top = '98%';
          this.snapGuideH.hidden = false;
        }
      } else {
        if (this.snapGuideH) this.snapGuideH.hidden = true;
      }

      this.activeDrag.curXPct = newX;
      this.activeDrag.curYPct = newY;
      this.activeDrag.curWPct = origW;
      this.activeDrag.curHPct = origH;

      this.blurEl.style.left = `${newX.toFixed(1)}%`;
      this.blurEl.style.top = `${newY.toFixed(1)}%`;

      if (this.posBadge) {
        this.posBadge.textContent = `Blur Mask: X: ${Math.round(newX)}% · Y: ${Math.round(newY)}% · W: ${Math.round(origW)}% · H: ${Math.round(origH)}%`;
      }
      return;
    }

    // Default Subtitle & Watermark positioning
    let rawXPct = ((e.clientX - rect.left) / rect.width) * 100;
    let rawYPct = ((e.clientY - rect.top) / rect.height) * 100;

    // Clamp within safe margins (5% to 95%)
    let xPct = Math.max(5, Math.min(95, rawXPct));
    let yPct = Math.max(5, Math.min(95, rawYPct));

    let snappedX = false;
    let snappedY = false;

    // 1. Horizontal center magnetic snap (50%)
    if (Math.abs(xPct - 50) < 2.5) {
      xPct = 50;
      snappedX = true;
      if (this.snapGuideV) {
        this.snapGuideV.style.left = '50%';
        this.snapGuideV.hidden = false;
      }
    } else {
      if (this.snapGuideV) this.snapGuideV.hidden = true;
    }

    // 2. Vertical center snap (50%) or Default Subtitle Baseline snap (86%)
    if (Math.abs(yPct - 50) < 2.5) {
      yPct = 50;
      snappedY = true;
      if (this.snapGuideH) {
        this.snapGuideH.style.top = '50%';
        this.snapGuideH.hidden = false;
      }
    } else if (key === 'subtitle' && Math.abs(yPct - 86) < 2.5) {
      yPct = 86;
      snappedY = true;
      if (this.snapGuideH) {
        this.snapGuideH.style.top = '86%';
        this.snapGuideH.hidden = false;
      }
    } else if (key === 'watermark' && Math.abs(yPct - 14) < 2.5) {
      yPct = 14;
      snappedY = true;
      if (this.snapGuideH) {
        this.snapGuideH.style.top = '14%';
        this.snapGuideH.hidden = false;
      }
    } else {
      if (this.snapGuideH) this.snapGuideH.hidden = true;
    }

    this.activeDrag.curXPct = xPct;
    this.activeDrag.curYPct = yPct;

    // Apply live style
    el.style.left = `${xPct.toFixed(1)}%`;
    el.style.top = `${yPct.toFixed(1)}%`;

    if (this.posBadge) {
      this.posBadge.textContent = `${label}: X: ${Math.round(xPct)}% · Y: ${Math.round(yPct)}%`;
    }
  }

  onMouseUp() {
    if (!this.isDragging || !this.activeDrag) return;

    const { el, key, label, curXPct, curYPct, curWPct, curHPct } = this.activeDrag;
    el.classList.remove('dragging', 'resizing');

    if (this.snapGuideH) this.snapGuideH.hidden = true;
    if (this.snapGuideV) this.snapGuideV.hidden = true;
    if (this.posBadge) this.posBadge.hidden = true;

    // Save overlay coordinates to project state
    state.project.overlays = state.project.overlays || {};
    if (key === 'blur') {
      const curBlur = state.project.overlays.blur || {};
      state.project.overlays.blur = {
        ...curBlur,
        xPercent: Math.round((curXPct ?? 5) * 10) / 10,
        yPercent: Math.round((curYPct ?? 84) * 10) / 10,
        wPercent: Math.round((curWPct ?? 90) * 10) / 10,
        hPercent: Math.round((curHPct ?? 14) * 10) / 10
      };
      state.markDirty();
      this.updateBlurPopoverPosition();
      ui.showToast(`Blur mask updated (X: ${Math.round(curXPct)}%, Y: ${Math.round(curYPct)}%, W: ${Math.round(curWPct)}%, H: ${Math.round(curHPct)}%)`, 1800);
    } else {
      state.project.overlays[key] = {
        xPercent: Math.round(curXPct * 10) / 10,
        yPercent: Math.round(curYPct * 10) / 10
      };
      state.markDirty();
      ui.showToast(`${label} position set (X: ${Math.round(curXPct)}%, Y: ${Math.round(curYPct)}%)`, 1800);
    }

    this.isDragging = false;
    this.activeDrag = null;
  }

  resetPosition(key, defaultX, defaultY, label) {
    if (key === 'blur') {
      this.resetBlurPosition();
      return;
    }

    const el = key === 'subtitle' ? this.capEl : this.wmEl;
    if (!el) return;

    el.style.left = `${defaultX}%`;
    el.style.top = `${defaultY}%`;

    state.project.overlays = state.project.overlays || {};
    state.project.overlays[key] = { xPercent: defaultX, yPercent: defaultY };
    state.markDirty();

    ui.showToast(`Reset ${label} to default position`, 1800);
  }

  restorePositions() {
    const overlays = state.project?.overlays || {};

    if (this.capEl) {
      this.capEl.style.display = 'none';
      const sub = overlays.subtitle || { xPercent: 50, yPercent: 86 };
      this.capEl.style.left = `${sub.xPercent ?? 50}%`;
      this.capEl.style.top = `${sub.yPercent ?? 86}%`;
    }

    if (this.wmEl) {
      const wm = overlays.watermark || { xPercent: 82, yPercent: 14 };
      this.wmEl.style.left = `${wm.xPercent ?? 82}%`;
      this.wmEl.style.top = `${wm.yPercent ?? 14}%`;
    }

    if (this.blurEl) {
      const bl = overlays.blur || { xPercent: 5, yPercent: 84, wPercent: 90, hPercent: 14, intensity: 16, tint: 35 };
      this.blurEl.style.left = `${bl.xPercent ?? 5}%`;
      this.blurEl.style.top = `${bl.yPercent ?? 84}%`;
      this.blurEl.style.width = `${bl.wPercent ?? 90}%`;
      this.blurEl.style.height = `${bl.hPercent ?? 14}%`;
      this.applyBlurVisualStyles();
      this.syncBlurHudUI();
      this.updateBlurPopoverPosition();
    }
  }

  getCoordinates(key) {
    const overlays = state.project?.overlays || {};
    if (key === 'subtitle') {
      return overlays.subtitle || { xPercent: 50, yPercent: 86 };
    }
    if (key === 'watermark') {
      return overlays.watermark || { xPercent: 82, yPercent: 14 };
    }
    if (key === 'blur') {
      const cur = overlays.blur || { xPercent: 5, yPercent: 84, wPercent: 90, hPercent: 14 };
      return {
        xPercent: cur.xPercent ?? 5,
        yPercent: cur.yPercent ?? 84,
        wPercent: cur.wPercent ?? 90,
        hPercent: cur.hPercent ?? 14,
        intensity: cur.intensity ?? 16,
        tint: cur.tint ?? 35
      };
    }
    return overlays[key] || { xPercent: 50, yPercent: 50 };
  }

  setCoordinates(key, xPercent, yPercent, wPercent, hPercent, intensity, tint) {
    state.project.overlays = state.project.overlays || {};
    if (key === 'blur') {
      const cur = state.project.overlays.blur || {};
      state.project.overlays.blur = {
        ...cur,
        xPercent: Math.round(xPercent * 10) / 10,
        yPercent: Math.round(yPercent * 10) / 10,
        wPercent: Math.round((wPercent ?? 90) * 10) / 10,
        hPercent: Math.round((hPercent ?? 14) * 10) / 10,
        intensity: intensity ?? cur.intensity ?? 16,
        tint: tint ?? cur.tint ?? 35
      };
    } else {
      state.project.overlays[key] = {
        xPercent: Math.round(xPercent * 10) / 10,
        yPercent: Math.round(yPercent * 10) / 10
      };
    }
    this.restorePositions();
  }

  resetCoordinates(key) {
    if (key === 'blur') {
      this.resetBlurPosition();
    } else if (key === 'subtitle') {
      this.resetPosition('subtitle', 50, 86, 'Subtitle');
    } else if (key === 'watermark') {
      this.resetPosition('watermark', 82, 14, 'Watermark');
    }
  }

  initQuickStudio() {
    this.quickPopover = document.getElementById('subQuickPopover');
    this.quickHeader = document.getElementById('subQuickHeader');
    this.quickTimeBadge = document.getElementById('subQuickTimeBadge');
    this.quickCharCount = document.getElementById('subQuickCharCount');
    this.quickCloseBtn = document.getElementById('subQuickCloseBtn');
    this.quickTextInp = document.getElementById('subQuickTextInp');
    this.quickSizeVal = document.getElementById('subQuickSizeVal');
    this.quickSizeSlider = document.getElementById('subQuickSizeSlider');
    this.quickSizeMinusBtn = document.getElementById('subQuickSizeMinusBtn');
    this.quickSizePlusBtn = document.getElementById('subQuickSizePlusBtn');
    this.quickPresetChips = document.getElementById('subQuickPresetChips');
    this.quickResetPosBtn = document.getElementById('subQuickResetPosBtn');
    this.quickDualToggleBtn = document.getElementById('subQuickDualToggleBtn');

    if (!this.quickPopover) return;

    this.quickCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSubtitleQuickStudio();
    });

    // Close when clicking outside inside previewContainer
    this.container?.addEventListener('mousedown', (e) => {
      if (this.quickPopover && !this.quickPopover.hidden) {
        if (!this.quickPopover.contains(e.target) && !this.capEl?.contains(e.target)) {
          this.closeSubtitleQuickStudio();
        }
      }
    });

    // Dragging the popover panel via header
    let isPanelDragging = false;
    let panelStartX = 0;
    let panelStartY = 0;
    let panelOrigLeft = 0;
    let panelOrigTop = 0;

    this.quickHeader?.addEventListener('mousedown', (e) => {
      if (e.target.closest('#subQuickCloseBtn')) return;
      isPanelDragging = true;
      panelStartX = e.clientX;
      panelStartY = e.clientY;
      const rect = this.quickPopover.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      panelOrigLeft = rect.left - containerRect.left + rect.width / 2;
      panelOrigTop = rect.top - containerRect.top + rect.height / 2;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanelDragging || !this.quickPopover || !this.container) return;
      const dx = e.clientX - panelStartX;
      const dy = e.clientY - panelStartY;
      const containerRect = this.container.getBoundingClientRect();
      const newXPct = Math.max(15, Math.min(85, ((panelOrigLeft + dx) / containerRect.width) * 100));
      const newYPct = Math.max(15, Math.min(85, ((panelOrigTop + dy) / containerRect.height) * 100));
      this.quickPopover.style.left = `${newXPct.toFixed(1)}%`;
      this.quickPopover.style.top = `${newYPct.toFixed(1)}%`;
    });

    window.addEventListener('mouseup', () => {
      isPanelDragging = false;
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.quickPopover && !this.quickPopover.hidden) {
        this.closeSubtitleQuickStudio();
      }
    });

    const updateCharCount = (text) => {
      if (this.quickCharCount) {
        this.quickCharCount.textContent = `${(text || '').length} chars`;
      }
    };

    // Live Text Edit synchronization
    this.quickTextInp?.addEventListener('input', (e) => {
      const newText = e.target.value;
      updateCharCount(newText);
      const curTime = state.timeline.playhead;
      let activeSeg = state.rows.find(r => r.s <= curTime && curTime <= r.e);
      if (!activeSeg) activeSeg = state.getCur();
      if (activeSeg) {
        activeSeg.t = newText;
        state.markDirty();
        state.emit('change', { source: 'quickStudioText' });
      }
    });

    // Font size scaling controls
    const updateSize = (scale) => {
      const clamped = Math.max(50, Math.min(250, Math.round(scale)));
      state.project.subtitleScalePct = clamped;
      if (this.quickSizeSlider) this.quickSizeSlider.value = clamped;
      if (this.quickSizeVal) this.quickSizeVal.textContent = `${clamped}%`;
      state.markDirty();
      state.emit('subtitleScaleChange', clamped);
    };

    this.quickSizeVal?.addEventListener('click', () => {
      updateSize(100);
      ui.showToast('Reset font size to 100%', 1200);
    });

    this.quickSizeSlider?.addEventListener('input', (e) => {
      updateSize(Number(e.target.value));
    });

    this.quickSizeMinusBtn?.addEventListener('click', () => {
      const cur = Number(this.quickSizeSlider?.value) || state.project.subtitleScalePct || 100;
      updateSize(cur - 10);
    });

    this.quickSizePlusBtn?.addEventListener('click', () => {
      const cur = Number(this.quickSizeSlider?.value) || state.project.subtitleScalePct || 100;
      updateSize(cur + 10);
    });

    // Preset chip buttons
    this.quickPresetChips?.addEventListener('click', (e) => {
      const btn = e.target.closest('.sub-chip-btn');
      if (!btn) return;
      const preset = btn.dataset.preset;
      if (!preset) return;
      state.project.subtitlePreset = preset;
      state.markDirty();
      this.updatePresetChipsUI(preset);
      const toolbarPresetSelect = document.getElementById('subtitlePresetSelect');
      if (toolbarPresetSelect) toolbarPresetSelect.value = preset;
      state.emit('subtitlePresetChange', preset);
      ui.showToast(`Applied preset: ${preset}`, 1500);
    });

    // Reset position button
    this.quickResetPosBtn?.addEventListener('click', () => {
      this.resetPosition('subtitle', 50, 86, 'Subtitle');
      this.closeSubtitleQuickStudio();
    });

    // Dual Subtitles toggle button
    this.quickDualToggleBtn?.addEventListener('click', () => {
      state.project.bilingualSubtitles = !state.project.bilingualSubtitles;
      state.markDirty();
      this.updateDualToggleBtnUI();
      state.emit('bilingualSubtitlesChange', state.project.bilingualSubtitles);
      ui.showToast(
        state.project.bilingualSubtitles
          ? 'Bilingual Dual-Subs Enabled'
          : 'Bilingual Dual-Subs Disabled',
        1800
      );
    });
  }

  updatePresetChipsUI(activePreset) {
    if (!this.quickPresetChips) return;
    const chips = this.quickPresetChips.querySelectorAll('.sub-chip-btn');
    chips.forEach(c => {
      if (c.dataset.preset === activePreset) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  updateDualToggleBtnUI() {
    if (!this.quickDualToggleBtn) return;
    const isDual = Boolean(state.project.bilingualSubtitles);
    if (isDual) {
      this.quickDualToggleBtn.classList.add('primary');
      this.quickDualToggleBtn.textContent = '✓ Dual Active';
    } else {
      this.quickDualToggleBtn.classList.remove('primary');
      this.quickDualToggleBtn.textContent = '🌐 Dual Subs';
    }
  }

  openSubtitleQuickStudio() {
    ui.showToast('✨ Subtitle Caption Studio — Coming Soon (មុខងារនេះនឹងមកដល់ឆាប់ៗនេះ!)', 2500);
  }

  closeSubtitleQuickStudio() {
    if (this.quickPopover) {
      this.quickPopover.hidden = true;
    }
  }
}

export const canvasOverlay = new CanvasOverlayManager();
