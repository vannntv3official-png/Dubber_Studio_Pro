/**
 * Visual Tools & Inspector Controller (Dubber បីសាច)
 * Controls Sponsor Banner, Watermark, Photo/Logo, and Subtitles Typography
 * Live synchronization with the interactive video overlay
 */

import { state } from './state.js';
import { ui } from './ui.js';
import { ipcClient } from './ipc-client.js';

export function initVisualTools() {
  const drawer = document.getElementById('visualInspectorDrawer');
  const overlay = document.getElementById('videoInteractiveOverlay');

  // Video Overlay Elements
  const sponsorVideoBox = document.getElementById('sponsorVideoBox');
  const sponsorVideoDelBtn = document.getElementById('sponsorVideoDelBtn');
  const sponsorMarqueeText = document.getElementById('sponsorMarqueeText');

  const watermarkVideoBox = document.getElementById('watermarkVideoBox');
  const watermarkVideoText = document.getElementById('watermarkVideoText');

  const photoLogoVideoBox = document.getElementById('photoLogoVideoBox');
  const photoLogoImgEl = document.getElementById('photoLogoImgEl');
  const photoLogoDelBtn = document.getElementById('photoLogoDelBtn');

  // Workspace Tools Trigger Buttons & Badges
  const photoLogoBtn = document.getElementById('photoLogoBtn');
  const addSponsorBtn = document.getElementById('addSponsorBtn');
  const addWatermarkBtn = document.getElementById('addWatermarkBtn');
  const subtitlesBtn = document.getElementById('subtitlesBtn');

  const photoLogoBadge = document.getElementById('photoLogoBadge');
  const sponsorBadge = document.getElementById('sponsorBadge');
  const watermarkBadge = document.getElementById('watermarkBadge');
  const subtitlesBadge = document.getElementById('subtitlesBadge');

  // Panels
  const sponsorModal = document.getElementById('sponsorModal');
  const watermarkModal = document.getElementById('watermarkModal');
  const photoLogoModal = document.getElementById('photoLogoModal');
  const subtitlesModal = document.getElementById('subtitlesModal');

  // Ensure state structure exists
  if (!state.project.visualOverlays) {
    state.project.visualOverlays = {
      photoLogo: { enabled: false, imagePath: null, scale: 30, opacity: 100, position: 'top-right', startSec: 0, endSec: 9999 },
      sponsor: { enabled: false, layout: 'dual-ticker', textTop: 'Main Sponsor: Your Brand Name — Quality First', textBottom: '', font: 'Kantumruy Pro', accent: '#FFD700', place: 'bottom', direction: 'left', speed: 15 },
      watermark: { enabled: false, text: '© AI Dubbing Studio', motion: 'diagonal', opacity: 60, fontSize: 24 }
    };
  }
  if (!state.project.subtitleStyle) {
    state.project.subtitleStyle = {
      fontFamily: 'Kantumruy Pro',
      fontSize: 28,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      background: 'none',
      bottomOffset: 10,
      burnIn: true
    };
  }


  // ── 0. BUNDLED LOGOS & CHROMA KEY (DUBBER បីសាច) ─────────────
  const photoLogoTabs = document.getElementById('photoLogoTabs');
  const photoLogoGrid = document.getElementById('photoLogoGrid');
  const photoLogoCustomSection = document.getElementById('photoLogoCustomSection');
  const photoLogoChromaKey = document.getElementById('photoLogoChromaKey');
  const photoLogoChromaGroup = document.getElementById('photoLogoChromaGroup');
  const photoLogoChromaSimilarity = document.getElementById('photoLogoChromaSimilarity');
  const photoLogoChromaVal = document.getElementById('photoLogoChromaVal');

  let logoCatalog = null;
  async function loadLogoCatalog() {
    if (logoCatalog) return logoCatalog;
    try {
      const resp = await window.fetch('./assets/logos/catalog.json');
      logoCatalog = await resp.json();
      return logoCatalog;
    } catch (e) {
      console.warn('Failed to load logos catalog:', e);
      return null;
    }
  }

  async function renderLogoCategory(catId) {
    if (!photoLogoGrid) return;
    photoLogoGrid.innerHTML = '';

    if (catId === 'custom') {
      photoLogoGrid.style.display = 'none';
      if (photoLogoCustomSection) photoLogoCustomSection.style.display = 'block';
      return;
    }

    photoLogoGrid.style.display = 'grid';
    if (photoLogoCustomSection) photoLogoCustomSection.style.display = 'none';

    const cat = await loadLogoCatalog();
    if (!cat || !cat.categories) return;
    const category = cat.categories.find(c => c.id === catId);
    if (!category || !category.items) return;

    category.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'logo-item-card';
      card.title = item.name;

      const img = document.createElement('img');
      const imgRelPath = `assets/logos/${item.file}`;
      img.src = `./${imgRelPath}`;
      img.alt = item.name;

      const currentPath = state.project.visualOverlays?.photoLogo?.imagePath || '';
      if (currentPath.includes(item.file.replace(/\//g, '/')) || currentPath.includes(item.file.replace(/\//g, '\\'))) {
        card.classList.add('selected');
      }

      card.appendChild(img);
      card.addEventListener('click', () => {
        document.querySelectorAll('.logo-item-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const resolvedPath = `${window.location.href.replace(/[^/]*$/, '')}assets/logos/${item.file}`.replace('file:///', '').replace('file://', '');
        state.project.visualOverlays.photoLogo.imagePath = resolvedPath;
        state.project.visualOverlays.photoLogo.enabled = true;
        if (photoLogoPathInp) photoLogoPathInp.value = item.name;
        if (photoLogoPreview) {
          photoLogoPreview.src = `./${imgRelPath}`;
          photoLogoPreview.hidden = false;
        }
        if (photoLogoEmptyState) photoLogoEmptyState.hidden = true;
        syncPhotoLogoVideoOverlay();
        updateToolBadges();
      });

      photoLogoGrid.appendChild(card);
    });
  }

  if (photoLogoTabs) {
    photoLogoTabs.querySelectorAll('.logo-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        photoLogoTabs.querySelectorAll('.logo-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderLogoCategory(btn.getAttribute('data-cat'));
      });
    });
    // Initial category
    renderLogoCategory('bisach-pro');
  }

  if (photoLogoChromaKey) {
    photoLogoChromaKey.addEventListener('change', () => {
      const checked = photoLogoChromaKey.checked;
      if (photoLogoChromaGroup) photoLogoChromaGroup.style.display = checked ? 'block' : 'none';
      if (state.project.visualOverlays?.photoLogo) {
        state.project.visualOverlays.photoLogo.chromaKey = checked;
      }
      syncPhotoLogoVideoOverlay();
    });
  }

  if (photoLogoChromaSimilarity) {
    photoLogoChromaSimilarity.addEventListener('input', () => {
      const v = Number(photoLogoChromaSimilarity.value);
      if (photoLogoChromaVal) photoLogoChromaVal.textContent = `${v}%`;
      if (state.project.visualOverlays?.photoLogo) {
        state.project.visualOverlays.photoLogo.chromaSimilarity = v;
      }
      syncPhotoLogoVideoOverlay();
    });
  }

  // ── WATERMARK PRESETS & LAP LENGTH ───────────────────────────
  const watermarkLapLength = document.getElementById('watermarkLapLength');
  const watermarkLapVal = document.getElementById('watermarkLapVal');
  const watermarkStylePresets = document.getElementById('watermarkStylePresets');

  if (watermarkLapLength) {
    watermarkLapLength.addEventListener('input', () => {
      const v = Number(watermarkLapLength.value);
      if (watermarkLapVal) watermarkLapVal.textContent = `${v}s`;
      if (state.project.visualOverlays?.watermark) {
        state.project.visualOverlays.watermark.periodMs = v * 1000;
      }
      syncWatermarkVideoOverlay();
    });
  }

  const WM_PRESETS = {
    clean: { color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.8)' },
    gold: { color: '#ffd700', textShadow: '0 0 12px rgba(255,215,0,0.8)' },
    cyan: { color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.8)' },
    neon: { color: '#ff2a85', textShadow: '0 0 14px rgba(255,42,133,0.9)' },
    outline: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }
  };

  if (watermarkStylePresets) {
    watermarkStylePresets.querySelectorAll('.btn-style-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        watermarkStylePresets.querySelectorAll('.btn-style-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const st = btn.getAttribute('data-style');
        const cfg = WM_PRESETS[st] || WM_PRESETS.clean;
        if (watermarkVideoText) {
          watermarkVideoText.style.color = cfg.color;
          watermarkVideoText.style.textShadow = cfg.textShadow;
        }
        if (state.project.visualOverlays?.watermark) {
          state.project.visualOverlays.watermark.stylePreset = st;
          state.project.visualOverlays.watermark.color = cfg.color;
        }
      });
    });
  }

  // ── SUBTITLE STYLE PRESETS ──────────────────────────────────
  const subStylePresets = document.getElementById('subStylePresets');
  const SUB_PRESETS = {
    classic: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 2, bg: 'none' },
    yellow: { color: '#ffe600', strokeColor: '#000000', strokeWidth: 3, bg: 'none' },
    darkbox: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, bg: 'semi-dark' },
    gold: { color: '#ffd700', strokeColor: '#78350f', strokeWidth: 3, bg: 'none' },
    neon: { color: '#00f0ff', strokeColor: '#000000', strokeWidth: 2, bg: 'none' }
  };

  if (subStylePresets) {
    subStylePresets.querySelectorAll('.btn-style-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        subStylePresets.querySelectorAll('.btn-style-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pKey = btn.getAttribute('data-sub');
        const p = SUB_PRESETS[pKey] || SUB_PRESETS.classic;

        state.project.subtitleStyle.color = p.color;
        state.project.subtitleStyle.strokeColor = p.strokeColor;
        state.project.subtitleStyle.strokeWidth = p.strokeWidth;
        state.project.subtitleStyle.background = p.bg;

        if (subColorInp) subColorInp.value = p.color;
        if (subStrokeInp) subStrokeInp.value = p.strokeColor;
        if (subStrokeWidthInp) {
          subStrokeWidthInp.value = p.strokeWidth;
          if (subStrokeWidthVal) subStrokeWidthVal.textContent = `${p.strokeWidth}px`;
        }
        if (subBgSelect) subBgSelect.value = p.bg;

        syncSubtitlePreview();
      });
    });
  }

  function closeAllPanels() {
    if (drawer) drawer.hidden = true;
    if (sponsorModal) sponsorModal.hidden = true;
    if (watermarkModal) watermarkModal.hidden = true;
    if (photoLogoModal) photoLogoModal.hidden = true;
    if (subtitlesModal) subtitlesModal.hidden = true;
  }

  function syncFormControls(panelEl) {
    const overlays = state.project.visualOverlays || {};
    const sp = overlays.sponsor || {};
    const wm = overlays.watermark || {};
    const pl = overlays.photoLogo || {};
    const sub = state.project.subtitleStyle || {};

    if (panelEl === sponsorModal) {
      if (sponsorTopTextInp) sponsorTopTextInp.value = sp.textTop || '';
      if (sponsorBottomTextInp) sponsorBottomTextInp.value = sp.textBottom || '';
      if (sponsorFontSelect && sp.font) sponsorFontSelect.value = sp.font;
      if (sponsorPlaceSelect && sp.place) sponsorPlaceSelect.value = sp.place;
      if (sponsorDirectionSelect && sp.direction) sponsorDirectionSelect.value = sp.direction;
      if (sponsorSpeedRange) {
        sponsorSpeedRange.value = sp.speed || 15;
        if (sponsorSpeedVal) sponsorSpeedVal.textContent = sp.speed || 15;
      }
      if (sp.layout) setSponsorLayout(sp.layout);
    } else if (panelEl === watermarkModal) {
      if (watermarkTextInp) watermarkTextInp.value = wm.text || '© AI Dubbing Studio';
      if (watermarkMotionSelect && wm.motion) {
        watermarkMotionSelect.value = wm.motion;
        if (watermarkMotionHint && motionHints[wm.motion]) {
          watermarkMotionHint.textContent = motionHints[wm.motion];
        }
      }
      if (watermarkFontSize) {
        watermarkFontSize.value = wm.fontSize || 24;
        if (watermarkFontSizeVal) watermarkFontSizeVal.textContent = wm.fontSize || 24;
      }
      if (watermarkOpacity) {
        const op = wm.opacity !== undefined ? wm.opacity : 60;
        watermarkOpacity.value = op;
        if (watermarkOpacityVal) watermarkOpacityVal.textContent = `${op}%`;
      }
    } else if (panelEl === photoLogoModal) {
      if (photoLogoPathInp) photoLogoPathInp.value = pl.imagePath || '';
      if (photoLogoScale) {
        photoLogoScale.value = pl.scale || 30;
        if (photoLogoScaleVal) photoLogoScaleVal.textContent = `${pl.scale || 30}%`;
      }
      if (photoLogoOpacity) {
        const op = pl.opacity !== undefined ? pl.opacity : 100;
        photoLogoOpacity.value = op;
        if (photoLogoOpacityVal) photoLogoOpacityVal.textContent = `${op}%`;
      }
      if (photoLogoPosSelect && pl.position) photoLogoPosSelect.value = pl.position;
      if (photoLogoPreview) {
        if (pl.imagePath) {
          photoLogoPreview.src = `file://${pl.imagePath.replace(/\\/g, '/')}`;
          photoLogoPreview.hidden = false;
        } else {
          photoLogoPreview.hidden = true;
        }
      }
      if (photoLogoEmptyState) photoLogoEmptyState.hidden = Boolean(pl.imagePath);
    } else if (panelEl === subtitlesModal) {
      if (subFontSelect && sub.fontFamily) subFontSelect.value = sub.fontFamily;
      if (subFontSizeInp) {
        subFontSizeInp.value = sub.fontSize || 28;
        if (subFontSizeVal) subFontSizeVal.textContent = `${sub.fontSize || 28}px`;
      }
      if (subColorInp && sub.color) subColorInp.value = sub.color;
      if (subStrokeInp && sub.strokeColor) subStrokeInp.value = sub.strokeColor;
      if (subStrokeWidthInp) {
        const sw = sub.strokeWidth !== undefined ? sub.strokeWidth : 2;
        subStrokeWidthInp.value = sw;
        if (subStrokeWidthVal) subStrokeWidthVal.textContent = `${sw}px`;
      }
      if (subBgSelect && sub.background) subBgSelect.value = sub.background;
      if (subBottomOffsetInp) {
        const bo = sub.bottomOffset !== undefined ? sub.bottomOffset : 10;
        subBottomOffsetInp.value = bo;
        if (subBottomOffsetVal) subBottomOffsetVal.textContent = `${bo}%`;
      }
      if (subBurnInToggle) subBurnInToggle.checked = sub.burnIn !== false;
    }
  }

  function openPanel(panelEl) {
    if (!drawer || !panelEl) return;
    // Toggle close if currently visible
    if (!drawer.hidden && !panelEl.hidden) {
      closeAllPanels();
      return;
    }
    syncFormControls(panelEl);
    drawer.hidden = false;
    sponsorModal.hidden = (panelEl !== sponsorModal);
    watermarkModal.hidden = (panelEl !== watermarkModal);
    photoLogoModal.hidden = (panelEl !== photoLogoModal);
    subtitlesModal.hidden = (panelEl !== subtitlesModal);
  }

  function updateToolBadges() {
    const overlays = state.project.visualOverlays;
    if (sponsorBadge) sponsorBadge.hidden = !overlays?.sponsor?.enabled;
    if (watermarkBadge) watermarkBadge.hidden = !overlays?.watermark?.enabled;
    if (photoLogoBadge) photoLogoBadge.hidden = !overlays?.photoLogo?.enabled;
    if (subtitlesBadge) subtitlesBadge.hidden = false;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SPONSOR BANNER CONTROLLER
  // ─────────────────────────────────────────────────────────────
  const sponsorCloseBtn = document.getElementById('sponsorCloseBtn');
  const sponsorDismissBtn = document.getElementById('sponsorDismissBtn');
  const sponsorSaveBtn = document.getElementById('sponsorSaveBtn');
  const sponsorRemoveBtn = document.getElementById('sponsorRemoveBtn');
  const sponsorTopTextInp = document.getElementById('sponsorTopTextInp');
  const sponsorBottomTextInp = document.getElementById('sponsorBottomTextInp');
  const sponsorTemplateSelect = document.getElementById('sponsorTemplateSelect');
  const sponsorPlaceSelect = document.getElementById('sponsorPlaceSelect');
  const sponsorAccentSelect = document.getElementById('sponsorAccentSelect');
  const sponsorSpeedSelect = document.getElementById('sponsorSpeedSelect');
  const sponsorSpeedRange = document.getElementById('sponsorSpeedRange');
  const sponsorSpeedVal = document.getElementById('sponsorSpeedVal');
  const sponsorDirectionSelect = document.getElementById('sponsorDirectionSelect');
  const sponsorFontSelect = document.getElementById('sponsorFontSelect');
  const sponsorSnapSafeBtn = document.getElementById('sponsorSnapSafeBtn');
  const sponsorLayoutHint = document.getElementById('sponsorLayoutHint');

  const layoutCards = [
    { id: 'layoutDualTicker', val: 'dual-ticker', hint: 'Two solid bars running opposite ways. Branding on top, the offer underneath.' },
    { id: 'layoutGlassCapsule', val: 'glass-capsule', hint: 'A floating rounded pill of dark glass with a pale edge.' },
    { id: 'layoutNewsBadge', val: 'news-badge', hint: 'A fixed SPONSOR / PROMO label the line passes out from behind.' },
    { id: 'layoutSplitBrand', val: 'split-brand', hint: 'A quiet, slow brand line on top; a loud, fast offer line underneath.' }
  ];

  function syncSponsorVideoOverlay() {
    const cfg = state.project.visualOverlays.sponsor;
    if (!sponsorVideoBox) return;

    if (!cfg || !cfg.enabled) {
      sponsorVideoBox.hidden = true;
      return;
    }

    sponsorVideoBox.hidden = false;
    if (sponsorMarqueeText) {
      sponsorMarqueeText.textContent = cfg.textTop || 'Main Sponsor: Your Brand Name — Quality First';
      sponsorMarqueeText.style.fontFamily = cfg.font || 'Kantumruy Pro';
      sponsorMarqueeText.style.color = cfg.accent || '#FFD700';

      const dur = Math.max(4, Math.round(180 / (cfg.speed || 15)));
      sponsorMarqueeText.style.animationDuration = `${dur}s`;
      sponsorMarqueeText.style.animationDirection = (cfg.direction === 'right') ? 'reverse' : 'normal';
    }

    if (cfg.place === 'top') {
      sponsorVideoBox.classList.remove('at-bottom');
      sponsorVideoBox.style.top = '10%';
      sponsorVideoBox.style.bottom = 'auto';
    } else {
      sponsorVideoBox.classList.add('at-bottom');
      sponsorVideoBox.style.top = 'auto';
      sponsorVideoBox.style.bottom = '10%';
    }
  }

  function setSponsorLayout(layoutId) {
    layoutCards.forEach(c => {
      const el = document.getElementById(c.id);
      if (el) el.classList.toggle('active', c.val === layoutId);
      if (c.val === layoutId && sponsorLayoutHint) {
        sponsorLayoutHint.textContent = c.hint;
      }
    });
    if (sponsorTemplateSelect) sponsorTemplateSelect.value = layoutId;
    if (state.project.visualOverlays.sponsor) {
      state.project.visualOverlays.sponsor.layout = layoutId;
    }
    syncSponsorVideoOverlay();
  }

  layoutCards.forEach(c => {
    const el = document.getElementById(c.id);
    if (el) {
      el.addEventListener('click', () => setSponsorLayout(c.val));
    }
  });

  // Swatches
  const swatchButtons = document.querySelectorAll('#sponsorColorPalette .swatch-circle');
  swatchButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      swatchButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const col = btn.getAttribute('data-color');
      if (sponsorAccentSelect) sponsorAccentSelect.value = col;
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.accent = col;
      }
      syncSponsorVideoOverlay();
    });
  });

  if (sponsorTopTextInp) {
    sponsorTopTextInp.addEventListener('input', () => {
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.textTop = sponsorTopTextInp.value;
      }
      syncSponsorVideoOverlay();
    });
  }

  if (sponsorFontSelect) {
    sponsorFontSelect.addEventListener('change', () => {
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.font = sponsorFontSelect.value;
      }
      syncSponsorVideoOverlay();
    });
  }

  if (sponsorPlaceSelect) {
    sponsorPlaceSelect.addEventListener('change', () => {
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.place = sponsorPlaceSelect.value;
      }
      syncSponsorVideoOverlay();
    });
  }

  if (sponsorDirectionSelect) {
    sponsorDirectionSelect.addEventListener('change', () => {
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.direction = sponsorDirectionSelect.value;
      }
      syncSponsorVideoOverlay();
    });
  }

  if (sponsorSpeedRange) {
    sponsorSpeedRange.addEventListener('input', () => {
      const v = Number(sponsorSpeedRange.value);
      if (sponsorSpeedVal) sponsorSpeedVal.textContent = v;
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.speed = v;
      }
      syncSponsorVideoOverlay();
    });
  }

  if (sponsorSnapSafeBtn) {
    sponsorSnapSafeBtn.addEventListener('click', () => {
      if (sponsorPlaceSelect) sponsorPlaceSelect.value = 'bottom';
      if (sponsorVideoBox) {
        sponsorVideoBox.classList.add('at-bottom');
        sponsorVideoBox.style.top = 'auto';
        sponsorVideoBox.style.bottom = '10%';
        sponsorVideoBox.style.left = '6%';
        sponsorVideoBox.style.right = '6%';
      }
      if (state.project.visualOverlays.sponsor) {
        state.project.visualOverlays.sponsor.place = 'bottom';
      }
      ui.showToast('Snapped banner to safe zone', 1800);
    });
  }

  if (addSponsorBtn) {
    addSponsorBtn.addEventListener('click', () => {
      state.project.visualOverlays.sponsor.enabled = true;
      openPanel(sponsorModal);
      syncSponsorVideoOverlay();
      updateToolBadges();
    });
  }

  if (sponsorCloseBtn) sponsorCloseBtn.addEventListener('click', closeAllPanels);
  if (sponsorDismissBtn) sponsorDismissBtn.addEventListener('click', closeAllPanels);

  if (sponsorSaveBtn) {
    sponsorSaveBtn.addEventListener('click', () => {
      state.project.visualOverlays.sponsor.enabled = true;
      syncSponsorVideoOverlay();
      updateToolBadges();
      closeAllPanels();
      ui.showToast('Sponsor banner applied', 2000);
    });
  }

  function removeSponsorAction() {
    state.project.visualOverlays.sponsor.enabled = false;
    syncSponsorVideoOverlay();
    updateToolBadges();
    closeAllPanels();
    ui.showToast('Sponsor banner removed', 2000);
  }

  if (sponsorRemoveBtn) sponsorRemoveBtn.addEventListener('click', removeSponsorAction);
  if (sponsorVideoDelBtn) sponsorVideoDelBtn.addEventListener('click', removeSponsorAction);

  // ─────────────────────────────────────────────────────────────
  // 2. WATERMARK CONTROLLER
  // ─────────────────────────────────────────────────────────────
  const watermarkCloseBtn = document.getElementById('watermarkCloseBtn');
  const watermarkDismissBtn = document.getElementById('watermarkDismissBtn');
  const watermarkSaveBtn = document.getElementById('watermarkSaveBtn');
  const watermarkRemoveBtn = document.getElementById('watermarkRemoveBtn');
  const watermarkTextInp = document.getElementById('watermarkTextInp');
  const watermarkMotionSelect = document.getElementById('watermarkMotionSelect');
  const watermarkMotionHint = document.getElementById('watermarkMotionHint');
  const watermarkFontSize = document.getElementById('watermarkFontSize');
  const watermarkFontSizeVal = document.getElementById('watermarkFontSizeVal');
  const watermarkOpacity = document.getElementById('watermarkOpacity');
  const watermarkOpacityVal = document.getElementById('watermarkOpacityVal');

  const motionHints = {
    diagonal: 'Rises at 45° from the bottom-left to the top-right, straight through the middle of the frame.',
    bounce: 'Floats around the whole canvas and bounces off the edges, never landing twice in the same place.',
    band: 'Scrolls across the lower middle — chest height on the subject — drifting up and down as it goes.',
    hop: 'Sits in one spot, fades out and reappears somewhere else — five spots a lap, so no one patch can be blurred away.',
    lissajous: 'Wanders a slow figure-of-eight around the middle of the frame, crossing its own path as it goes.',
    static: 'Sits fixed in the top-right corner of the video.'
  };

  function syncWatermarkVideoOverlay() {
    const wm = state.project.visualOverlays.watermark;
    if (!watermarkVideoBox) return;

    if (!wm || !wm.enabled) {
      watermarkVideoBox.hidden = true;
      return;
    }

    watermarkVideoBox.hidden = false;
    if (watermarkVideoText) {
      watermarkVideoText.textContent = wm.text || '© AI Dubbing Studio';
    }

    watermarkVideoBox.className = `watermark-video-box motion-${wm.motion || 'diagonal'}`;
    watermarkVideoBox.style.fontSize = `${wm.fontSize || 24}px`;
    watermarkVideoBox.style.opacity = (wm.opacity !== undefined ? wm.opacity : 60) / 100;
  }

  if (watermarkMotionSelect) {
    watermarkMotionSelect.addEventListener('change', () => {
      const mot = watermarkMotionSelect.value;
      if (watermarkMotionHint && motionHints[mot]) {
        watermarkMotionHint.textContent = motionHints[mot];
      }
      if (state.project.visualOverlays.watermark) {
        state.project.visualOverlays.watermark.motion = mot;
      }
      syncWatermarkVideoOverlay();
    });
  }

  if (watermarkTextInp) {
    watermarkTextInp.addEventListener('input', () => {
      if (state.project.visualOverlays.watermark) {
        state.project.visualOverlays.watermark.text = watermarkTextInp.value;
      }
      syncWatermarkVideoOverlay();
    });
  }

  if (watermarkFontSize) {
    watermarkFontSize.addEventListener('input', () => {
      const sz = Number(watermarkFontSize.value);
      if (watermarkFontSizeVal) watermarkFontSizeVal.textContent = sz;
      if (state.project.visualOverlays.watermark) {
        state.project.visualOverlays.watermark.fontSize = sz;
      }
      syncWatermarkVideoOverlay();
    });
  }

  if (watermarkOpacity) {
    watermarkOpacity.addEventListener('input', () => {
      const op = Number(watermarkOpacity.value);
      if (watermarkOpacityVal) watermarkOpacityVal.textContent = `${op}%`;
      if (state.project.visualOverlays.watermark) {
        state.project.visualOverlays.watermark.opacity = op;
      }
      syncWatermarkVideoOverlay();
    });
  }

  if (addWatermarkBtn) {
    addWatermarkBtn.addEventListener('click', () => {
      state.project.visualOverlays.watermark.enabled = true;
      openPanel(watermarkModal);
      syncWatermarkVideoOverlay();
      updateToolBadges();
    });
  }

  if (watermarkCloseBtn) watermarkCloseBtn.addEventListener('click', closeAllPanels);
  if (watermarkDismissBtn) watermarkDismissBtn.addEventListener('click', closeAllPanels);

  if (watermarkSaveBtn) {
    watermarkSaveBtn.addEventListener('click', () => {
      state.project.visualOverlays.watermark.enabled = true;
      syncWatermarkVideoOverlay();
      updateToolBadges();
      closeAllPanels();
      ui.showToast('Watermark applied with drift motion', 2000);
    });
  }

  if (watermarkRemoveBtn) {
    watermarkRemoveBtn.addEventListener('click', () => {
      state.project.visualOverlays.watermark.enabled = false;
      syncWatermarkVideoOverlay();
      updateToolBadges();
      closeAllPanels();
      ui.showToast('Watermark removed', 2000);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PHOTO / LOGO CONTROLLER
  // ─────────────────────────────────────────────────────────────
  const photoLogoCloseBtn = document.getElementById('photoLogoCloseBtn');
  const photoLogoDismissBtn = document.getElementById('photoLogoDismissBtn');
  const photoLogoSaveBtn = document.getElementById('photoLogoSaveBtn');
  const photoLogoRemoveBtn = document.getElementById('photoLogoRemoveBtn');
  const selectPhotoLogoBtn = document.getElementById('selectPhotoLogoBtn');
  const photoLogoPathInp = document.getElementById('photoLogoPathInp');
  const photoLogoPreview = document.getElementById('photoLogoPreview');
  const photoLogoEmptyState = document.getElementById('photoLogoEmptyState');
  const photoLogoScale = document.getElementById('photoLogoScale');
  const photoLogoScaleVal = document.getElementById('photoLogoScaleVal');
  const photoLogoOpacity = document.getElementById('photoLogoOpacity');
  const photoLogoOpacityVal = document.getElementById('photoLogoOpacityVal');
  const photoLogoPosSelect = document.getElementById('photoLogoPosSelect');
  const photoLogoTimingAll = document.getElementById('photoLogoTimingAll');
  const photoLogoTimingCustom = document.getElementById('photoLogoTimingCustom');
  const photoLogoTimingGroup = document.getElementById('photoLogoTimingGroup');
  const photoLogoStartSec = document.getElementById('photoLogoStartSec');
  const photoLogoEndSec = document.getElementById('photoLogoEndSec');

  function syncPhotoLogoVideoOverlay() {
    const pl = state.project.visualOverlays.photoLogo;
    if (!photoLogoVideoBox) return;

    if (!pl || !pl.enabled || !pl.imagePath) {
      photoLogoVideoBox.hidden = true;
      return;
    }

    photoLogoVideoBox.hidden = false;
    if (photoLogoImgEl) {
      photoLogoImgEl.src = `file://${pl.imagePath.replace(/\\/g, '/')}`;
    }

    photoLogoVideoBox.style.opacity = (pl.opacity !== undefined ? pl.opacity : 100) / 100;
    photoLogoVideoBox.style.width = `${pl.scale || 30}%`;

    // Position
    photoLogoVideoBox.style.top = 'auto';
    photoLogoVideoBox.style.bottom = 'auto';
    photoLogoVideoBox.style.left = 'auto';
    photoLogoVideoBox.style.right = 'auto';

    switch (pl.position) {
      case 'top-left':
        photoLogoVideoBox.style.top = '16px';
        photoLogoVideoBox.style.left = '16px';
        break;
      case 'bottom-left':
        photoLogoVideoBox.style.bottom = '16px';
        photoLogoVideoBox.style.left = '16px';
        break;
      case 'bottom-right':
        photoLogoVideoBox.style.bottom = '16px';
        photoLogoVideoBox.style.right = '16px';
        break;
      case 'center':
        photoLogoVideoBox.style.top = '40%';
        photoLogoVideoBox.style.left = '35%';
        break;
      case 'top-right':
      default:
        photoLogoVideoBox.style.top = '16px';
        photoLogoVideoBox.style.right = '16px';
        break;
    }
  }

  if (selectPhotoLogoBtn) {
    selectPhotoLogoBtn.addEventListener('click', async () => {
      const res = await ipcClient.selectOverlayImage();
      if (res && res.filePath) {
        if (photoLogoPathInp) photoLogoPathInp.value = res.filePath;
        if (photoLogoPreview) {
          photoLogoPreview.src = `file://${res.filePath.replace(/\\/g, '/')}`;
          photoLogoPreview.hidden = false;
        }
        if (photoLogoEmptyState) photoLogoEmptyState.hidden = true;
        state.project.visualOverlays.photoLogo.imagePath = res.filePath;
        state.project.visualOverlays.photoLogo.enabled = true;
        syncPhotoLogoVideoOverlay();
      }
    });
  }

  if (photoLogoScale) {
    photoLogoScale.addEventListener('input', () => {
      const v = Number(photoLogoScale.value);
      if (photoLogoScaleVal) photoLogoScaleVal.textContent = `${v}%`;
      if (state.project.visualOverlays.photoLogo) {
        state.project.visualOverlays.photoLogo.scale = v;
      }
      syncPhotoLogoVideoOverlay();
    });
  }

  if (photoLogoOpacity) {
    photoLogoOpacity.addEventListener('input', () => {
      const v = Number(photoLogoOpacity.value);
      if (photoLogoOpacityVal) photoLogoOpacityVal.textContent = `${v}%`;
      if (state.project.visualOverlays.photoLogo) {
        state.project.visualOverlays.photoLogo.opacity = v;
      }
      syncPhotoLogoVideoOverlay();
    });
  }

  if (photoLogoPosSelect) {
    photoLogoPosSelect.addEventListener('change', () => {
      if (state.project.visualOverlays.photoLogo) {
        state.project.visualOverlays.photoLogo.position = photoLogoPosSelect.value;
      }
      syncPhotoLogoVideoOverlay();
    });
  }

  if (photoLogoTimingAll && photoLogoTimingCustom) {
    photoLogoTimingAll.addEventListener('change', () => {
      if (photoLogoTimingGroup) photoLogoTimingGroup.style.display = 'none';
      if (state.project.visualOverlays.photoLogo) {
        state.project.visualOverlays.photoLogo.startSec = 0;
        state.project.visualOverlays.photoLogo.endSec = 99999;
      }
    });
    photoLogoTimingCustom.addEventListener('change', () => {
      if (photoLogoTimingGroup) photoLogoTimingGroup.style.display = 'grid';
    });
  }

  if (photoLogoBtn) {
    photoLogoBtn.addEventListener('click', () => {
      openPanel(photoLogoModal);
      syncPhotoLogoVideoOverlay();
      updateToolBadges();
    });
  }

  if (photoLogoCloseBtn) photoLogoCloseBtn.addEventListener('click', closeAllPanels);
  if (photoLogoDismissBtn) photoLogoDismissBtn.addEventListener('click', closeAllPanels);

  if (photoLogoSaveBtn) {
    photoLogoSaveBtn.addEventListener('click', () => {
      state.project.visualOverlays.photoLogo.enabled = Boolean(state.project.visualOverlays.photoLogo.imagePath);
      syncPhotoLogoVideoOverlay();
      updateToolBadges();
      closeAllPanels();
      ui.showToast('Photo/Logo overlay applied', 2000);
    });
  }

  function removePhotoLogoAction() {
    state.project.visualOverlays.photoLogo.enabled = false;
    state.project.visualOverlays.photoLogo.imagePath = null;
    if (photoLogoPathInp) photoLogoPathInp.value = '';
    if (photoLogoPreview) photoLogoPreview.hidden = true;
    if (photoLogoEmptyState) photoLogoEmptyState.hidden = false;
    syncPhotoLogoVideoOverlay();
    updateToolBadges();
    closeAllPanels();
    ui.showToast('Photo/Logo removed', 2000);
  }

  if (photoLogoRemoveBtn) photoLogoRemoveBtn.addEventListener('click', removePhotoLogoAction);
  if (photoLogoDelBtn) photoLogoDelBtn.addEventListener('click', removePhotoLogoAction);

  // ─────────────────────────────────────────────────────────────
  // 4. SUBTITLES TYPOGRAPHY CONTROLLER
  // ─────────────────────────────────────────────────────────────
  const subtitlesCloseBtn = document.getElementById('subtitlesCloseBtn');
  const subtitlesDismissBtn = document.getElementById('subtitlesDismissBtn');
  const subtitlesSaveBtn = document.getElementById('subtitlesSaveBtn');
  const subtitlesResetBtn = document.getElementById('subtitlesResetBtn');
  const subFontSelect = document.getElementById('subFontSelect');
  const subFontSizeInp = document.getElementById('subFontSizeInp');
  const subFontSizeVal = document.getElementById('subFontSizeVal');
  const subColorInp = document.getElementById('subColorInp');
  const subStrokeInp = document.getElementById('subStrokeInp');
  const subStrokeWidthInp = document.getElementById('subStrokeWidthInp');
  const subStrokeWidthVal = document.getElementById('subStrokeWidthVal');
  const subBgSelect = document.getElementById('subBgSelect');
  const subBottomOffsetInp = document.getElementById('subBottomOffsetInp');
  const subBottomOffsetVal = document.getElementById('subBottomOffsetVal');
  const subBurnInToggle = document.getElementById('subBurnInToggle');
  const subPreviewSampleText = document.getElementById('subPreviewSampleText');

  function syncSubtitlePreview() {
    const s = state.project.subtitleStyle;
    if (!subPreviewSampleText) return;

    subPreviewSampleText.style.fontFamily = s.fontFamily;
    subPreviewSampleText.style.fontSize = `${s.fontSize}px`;
    subPreviewSampleText.style.color = s.color;
    subPreviewSampleText.style.webkitTextStroke = `${s.strokeWidth}px ${s.strokeColor}`;

    const capBox = document.getElementById('cap');
    if (capBox) {
      capBox.style.fontFamily = s.fontFamily;
      capBox.style.fontSize = `${s.fontSize}px`;
      capBox.style.color = s.color;
      capBox.style.webkitTextStroke = `${s.strokeWidth}px ${s.strokeColor}`;
      capBox.style.bottom = `${s.bottomOffset}%`;
    }
  }

  if (subFontSelect) {
    subFontSelect.addEventListener('change', () => {
      state.project.subtitleStyle.fontFamily = subFontSelect.value;
      syncSubtitlePreview();
    });
  }

  if (subFontSizeInp) {
    subFontSizeInp.addEventListener('input', () => {
      const v = Number(subFontSizeInp.value);
      if (subFontSizeVal) subFontSizeVal.textContent = `${v}px`;
      state.project.subtitleStyle.fontSize = v;
      syncSubtitlePreview();
    });
  }

  if (subColorInp) {
    subColorInp.addEventListener('input', () => {
      state.project.subtitleStyle.color = subColorInp.value;
      syncSubtitlePreview();
    });
  }

  if (subStrokeInp) {
    subStrokeInp.addEventListener('input', () => {
      state.project.subtitleStyle.strokeColor = subStrokeInp.value;
      syncSubtitlePreview();
    });
  }

  if (subStrokeWidthInp) {
    subStrokeWidthInp.addEventListener('input', () => {
      const v = Number(subStrokeWidthInp.value);
      if (subStrokeWidthVal) subStrokeWidthVal.textContent = `${v}px`;
      state.project.subtitleStyle.strokeWidth = v;
      syncSubtitlePreview();
    });
  }

  if (subBgSelect) {
    subBgSelect.addEventListener('change', () => {
      state.project.subtitleStyle.background = subBgSelect.value;
      syncSubtitlePreview();
    });
  }

  if (subBottomOffsetInp) {
    subBottomOffsetInp.addEventListener('input', () => {
      const v = Number(subBottomOffsetInp.value);
      if (subBottomOffsetVal) subBottomOffsetVal.textContent = `${v}%`;
      state.project.subtitleStyle.bottomOffset = v;
      syncSubtitlePreview();
    });
  }

  if (subBurnInToggle) {
    subBurnInToggle.addEventListener('change', () => {
      state.project.subtitleStyle.burnIn = subBurnInToggle.checked;
    });
  }

  if (subtitlesBtn) {
    subtitlesBtn.addEventListener('click', () => {
      openPanel(subtitlesModal);
      syncSubtitlePreview();
    });
  }

  if (subtitlesCloseBtn) subtitlesCloseBtn.addEventListener('click', closeAllPanels);
  if (subtitlesDismissBtn) subtitlesDismissBtn.addEventListener('click', closeAllPanels);

  if (subtitlesResetBtn) {
    subtitlesResetBtn.addEventListener('click', () => {
      state.project.subtitleStyle = {
        fontFamily: 'Kantumruy Pro',
        fontSize: 28,
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2,
        background: 'none',
        bottomOffset: 10,
        burnIn: true
      };
      if (subFontSelect) subFontSelect.value = 'Kantumruy Pro';
      if (subFontSizeInp) subFontSizeInp.value = 28;
      if (subFontSizeVal) subFontSizeVal.textContent = '28px';
      if (subColorInp) subColorInp.value = '#ffffff';
      if (subStrokeInp) subStrokeInp.value = '#000000';
      if (subStrokeWidthInp) subStrokeWidthInp.value = 2;
      if (subStrokeWidthVal) subStrokeWidthVal.textContent = '2px';
      if (subBgSelect) subBgSelect.value = 'none';
      if (subBottomOffsetInp) subBottomOffsetInp.value = 10;
      if (subBottomOffsetVal) subBottomOffsetVal.textContent = '10%';
      if (subBurnInToggle) subBurnInToggle.checked = true;
      syncSubtitlePreview();
      ui.showToast('Subtitles style reset to default', 1800);
    });
  }

  if (subtitlesSaveBtn) {
    subtitlesSaveBtn.addEventListener('click', () => {
      syncSubtitlePreview();
      closeAllPanels();
      ui.showToast('Subtitles typography saved', 2000);
    });
  }

  // Refresh on project loaded
  if (typeof state.on === 'function') {
    state.on('projectLoaded', () => {
      syncSponsorVideoOverlay();
      syncWatermarkVideoOverlay();
      syncPhotoLogoVideoOverlay();
      syncSubtitlePreview();
      updateToolBadges();
    });
  }

  // Initial sync
  syncSponsorVideoOverlay();
  syncWatermarkVideoOverlay();
  syncPhotoLogoVideoOverlay();
  syncSubtitlePreview();
  updateToolBadges();
}
