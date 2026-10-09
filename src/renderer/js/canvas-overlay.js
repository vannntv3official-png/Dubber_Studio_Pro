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
    this.snapGuideH = null;
    this.snapGuideV = null;
    this.posBadge = null;

    this.activeDrag = null; // { el, key, startX, startY, origX, origY }
    this.isDragging = false;
  }

  init() {
    this.container = document.getElementById('previewContainer');
    this.capEl = document.getElementById('cap');
    this.wmEl = document.getElementById('watermarkOverlay');
    this.snapGuideH = document.getElementById('snapGuideH');
    this.snapGuideV = document.getElementById('snapGuideV');
    this.posBadge = document.getElementById('overlayPosBadge');

    if (!this.container) return;

    this.setupDraggable(this.capEl, 'subtitle', 50, 86, 'Subtitle');
    this.setupDraggable(this.wmEl, 'watermark', 82, 14, 'Watermark');

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

    // Double click to reset to default position
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.resetPosition(key, defaultX, defaultY, label);
    });
  }

  onMouseMove(e) {
    if (!this.isDragging || !this.activeDrag || !this.container) return;

    const { el, key, label, containerRect } = this.activeDrag;
    const rect = this.container.getBoundingClientRect();

    // Calculate raw mouse position percentage relative to container
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

    const { el, key, label, curXPct, curYPct } = this.activeDrag;
    el.classList.remove('dragging');

    if (this.snapGuideH) this.snapGuideH.hidden = true;
    if (this.snapGuideV) this.snapGuideV.hidden = true;
    if (this.posBadge) this.posBadge.hidden = true;

    // Save overlay coordinates to project state
    state.project.overlays = state.project.overlays || {};
    state.project.overlays[key] = {
      xPercent: Math.round(curXPct * 10) / 10,
      yPercent: Math.round(curYPct * 10) / 10
    };

    state.markDirty();
    ui.showToast(`${label} position set (X: ${Math.round(curXPct)}%, Y: ${Math.round(curYPct)}%)`, 1800);

    this.isDragging = false;
    this.activeDrag = null;
  }

  resetPosition(key, defaultX, defaultY, label) {
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
      const sub = overlays.subtitle || { xPercent: 50, yPercent: 86 };
      this.capEl.style.left = `${sub.xPercent ?? 50}%`;
      this.capEl.style.top = `${sub.yPercent ?? 86}%`;
    }

    if (this.wmEl) {
      const wm = overlays.watermark || { xPercent: 82, yPercent: 14 };
      this.wmEl.style.left = `${wm.xPercent ?? 82}%`;
      this.wmEl.style.top = `${wm.yPercent ?? 14}%`;
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
    return overlays[key] || { xPercent: 50, yPercent: 50 };
  }

  setCoordinates(key, xPercent, yPercent) {
    state.project.overlays = state.project.overlays || {};
    state.project.overlays[key] = {
      xPercent: Math.round(xPercent * 10) / 10,
      yPercent: Math.round(yPercent * 10) / 10
    };
    this.restorePositions();
  }

  resetCoordinates(key) {
    if (key === 'subtitle') {
      this.resetPosition('subtitle', 50, 86, 'Subtitle');
    } else if (key === 'watermark') {
      this.resetPosition('watermark', 82, 14, 'Watermark');
    }
  }
}

export const canvasOverlay = new CanvasOverlayManager();
