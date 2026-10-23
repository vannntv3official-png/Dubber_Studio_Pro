/**
 * Timeline Module: Ruler, Waveforms, Thumbnails, Tracks, Clips,
 * Draggable Clips, Edge Resizing, Split at Playhead, Draggable Playhead, and Zoom
 */

import { state } from './state.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';
import { ipcClient } from './ipc-client.js';
import { detectOverlaps, resolveOverlaps } from './subtitle-utils.js';

export const timeline = {
  container: null,
  zoomSlider: null,
  zoomInBtn: null,
  zoomOutBtn: null,
  followBtn: null,
  followTxt: null,
  edgeLeft: null,
  edgeRight: null,
  splitBtn: null,
  fixOverlapsBtn: null,
  fixOverlapsBadge: null,
  fixOverlapsTxt: null,
  autofitBtn: null,
  crowdBtn: null,
  syncBtn: null,
  duckBtn: null,
  reverbBtn: null,

  // Overview Scrubbing Bar
  overviewBar: null,
  overviewCanvas: null,
  overviewWindow: null,
  overviewHandleL: null,
  overviewHandleR: null,
  overviewPlayhead: null,
  overviewBadge: null,
  zoomFitBtn: null,
  isDraggingOverviewWindow: false,
  isDraggingOverviewHandle: null,

  isDraggingPlayhead: false,
  isProgrammaticScroll: false,
  dragMode: null, // 'move' | 'resize-left' | 'resize-right' | null
  activeClipId: null,
  dragStartX: 0,
  initialStart: 0,
  initialEnd: 0,

  init() {
    this.container = document.getElementById('tracks');
    this.zoomSlider = document.getElementById('zoom');
    this.zoomInBtn = document.getElementById('zoomIn');
    this.zoomOutBtn = document.getElementById('zoomOut');
    this.zoomFitBtn = document.getElementById('zoomFitBtn');
    this.followBtn = document.getElementById('followPlayheadBtn');
    this.followTxt = document.getElementById('followPlayheadTxt');
    this.edgeLeft = document.getElementById('tlEdgeLeft');
    this.edgeRight = document.getElementById('tlEdgeRight');
    this.splitBtn = document.getElementById('split');
    this.fixOverlapsBtn = document.getElementById('fixOverlapsBtn');
    this.fixOverlapsBadge = document.getElementById('fixOverlapsBadge');
    this.fixOverlapsTxt = document.getElementById('fixOverlapsTxt');
    this.autofitBtn = document.getElementById('autofit');
    this.crowdBtn = document.getElementById('crowd');
    this.syncBtn = document.getElementById('sync');
    this.duckBtn = document.getElementById('duck');
    this.reverbBtn = document.getElementById('reverb');

    // Overview bar elements (removed per user request)
    this.overviewBar = null;
    this.overviewCanvas = null;
    this.overviewWindow = null;
    this.overviewHandleL = null;
    this.overviewHandleR = null;
    this.overviewPlayhead = null;
    this.overviewBadge = null;

    this.attachEventListeners();
    this.initOverviewBar();
    this.initSliders();
    this.initResizer();
    this.initShortcuts();

    state.on('change', () => this.render());
    state.on('selectionChange', () => {
      this.syncSlidersToSelection();
      this.render();
      this.scrollSelectedClipIntoView();
    });
    state.on('playheadChange', () => this.updatePlayheadPosition());
    state.on('languageChange', () => this.updateControlLabels());
    state.on('projectLoaded', () => {
      this._waveformCache.clear();
      this.syncSlidersToSelection();
      this.render();
    });
    state.on('followChange', () => this.updateFollowBtnState());
    state.on('muteChange', (isMuted) => {
      const b = this.container?.querySelector('#tlMuteOrig');
      if (b) b.classList.toggle('on', Boolean(isMuted));
    });
    state.on('timelineMuteChange', () => {
      const a1Btn = this.container?.querySelector('#tlMuteA1');
      if (a1Btn) a1Btn.classList.toggle('on', Boolean(state.timeline.a1Muted));
      const bgmBtn = this.container?.querySelector('#tlMuteBgm');
      if (bgmBtn) bgmBtn.classList.toggle('on', Boolean(state.timeline.bgmMuted));
    });

    this.render();
  },

  updateControlLabels() {
    const afLevels = ['Off', 'Low', 'Med', 'High'];
    if (this.autofitBtn) {
      const mode = afLevels[state.timeline.autofitIndex];
      this.autofitBtn.textContent = i18n.t('autoFit', { mode });
    }
    if (this.syncBtn) {
      this.syncBtn.textContent = i18n.t('syncEnd', { state: state.timeline.syncEnd ? 'ON' : 'OFF' });
    }
    if (this.duckBtn) {
      this.updateDuckBtnState();
    }
    this.updateCrowdBtnState();
    this.updateReverbBtnState();
    this.updateFollowBtnState();
  },

  updateCrowdBtnState() {
    if (!this.crowdBtn) return;
    const isCrowd = Boolean(state.timeline.crowd);
    this.crowdBtn.textContent = `Crowd: ${isCrowd ? 'ON' : 'OFF'}`;
    this.crowdBtn.classList.toggle('on', isCrowd);
  },

  updateDuckBtnState() {
    if (!this.duckBtn) return;
    const isDuck = state.timeline.ducking !== false;
    const mode = isDuck ? (state.timeline.duckingPreset || 'balanced').toUpperCase() : 'OFF';
    this.duckBtn.textContent = i18n.t('ducking', { state: mode });
    this.duckBtn.classList.toggle('on', isDuck);
  },

  updateReverbBtnState() {
    if (!this.reverbBtn) return;
    const isRev = Boolean(state.timeline.reverb);
    const preset = state.timeline.reverbPreset || 'hall';
    const labelState = isRev ? preset.toUpperCase() : 'OFF';
    this.reverbBtn.textContent = i18n.t('reverb', { state: labelState });
    this.reverbBtn.classList.toggle('on', isRev);

    // Sync popover inputs if present
    if (typeof document !== 'undefined') {
      const pop = document.getElementById('reverbPopover');
      if (pop) {
        pop.querySelectorAll('.btn-reverb-chip').forEach(chip => {
          chip.classList.toggle('active', chip.dataset.preset === preset);
        });
      }
      const mixSlider = document.getElementById('reverbMixSlider');
      const mixVal = document.getElementById('reverbMixVal');
      if (mixSlider) mixSlider.value = state.timeline.reverbMix ?? 35;
      if (mixVal) mixVal.textContent = `${state.timeline.reverbMix ?? 35}%`;

      const decaySlider = document.getElementById('reverbDecaySlider');
      const decayVal = document.getElementById('reverbDecayVal');
      if (decaySlider) decaySlider.value = state.timeline.reverbDecay ?? 60;
      if (decayVal) decayVal.textContent = `${state.timeline.reverbDecay ?? 60}ms`;
    }
  },

  _waveformCache: new Map(),

  buildWaveformSvg(peaks, color = '#a78bfa', height = 30) {
    if (!Array.isArray(peaks) || peaks.length === 0) return '';
    const cacheKey = `${peaks.length}_${peaks[0] || 0}_${peaks[Math.floor(peaks.length / 2)] || 0}_${color}_${height}`;
    if (this._waveformCache.has(cacheKey)) {
      return this._waveformCache.get(cacheKey);
    }
    const width = Math.max(1000, peaks.length * 2);
    const midY = height / 2;
    const step = width / peaks.length;

    let pathD = `M 0 ${midY} `;
    for (let i = 0; i < peaks.length; i++) {
      const x = (i * step).toFixed(1);
      const amp = Math.max(0.5, (peaks[i] * (height / 2) * 0.95));
      const topY = (midY - amp).toFixed(1);
      pathD += `L ${x} ${topY} `;
    }

    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = (i * step).toFixed(1);
      const amp = Math.max(0.5, (peaks[i] * (height / 2) * 0.95));
      const botY = (midY + amp).toFixed(1);
      pathD += `L ${x} ${botY} `;
    }
    pathD += 'Z';

    const svg = `<svg class="track-waveform-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${color}" stroke-opacity="0.25" stroke-dasharray="2,2"/>
      <path d="${pathD}" fill="${color}" opacity="0.65" />
    </svg>`;

    if (this._waveformCache.size > 30) {
      this._waveformCache.clear();
    }
    this._waveformCache.set(cacheKey, svg);
    return svg;
  },

  render() {
    if (!this.container) return;

    const total = Math.max(0, state.project.duration || 0);
    const playheadPct = total > 0 ? (state.timeline.playhead / total) * 100 : 0;
    const labelW = 138;
    const containerW = this.container.clientWidth || 800;
    const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (Math.max(300, containerW - labelW) / total) : 20);
    const minWidthPx = total > 0 ? Math.round(total * pxPerSec) : (containerW - labelW);

    // Apply synchronized columns to CSS Grid container
    const laneWidth = Math.max(minWidthPx, containerW - labelW);
    this.container.style.gridTemplateColumns = `var(--label-col-w, 138px) ${laneWidth}px`;

    const zoomVal = document.getElementById('zoomVal');
    if (zoomVal) {
      zoomVal.textContent = `${Math.round(pxPerSec)} px/s`;
    }
    if (this.zoomSlider) {
      const minPPS = this.getMinPxPerSec();
      const maxPPS = 200;
      const pct = Math.max(0, Math.min(100, ((pxPerSec - minPPS) / (maxPPS - minPPS)) * 100));
      this.zoomSlider.value = String(Math.round(pct));
    }

    const tracksDef = [
      {
        id: 'ORIG',
        row: 2,
        name: i18n.t('origAudioTrack') || 'ORIG AUDIO',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
        cls: 'thin',
        color: 'rgba(167, 139, 250, 0.3)',
        peaks: state.origPeaks,
        hasMute: true,
        muteId: 'tlMuteOrig',
        isMuted: Boolean(state.timeline.muted),
        muteTitle: 'Mute Original Audio (M)',
        clips: [] // Do NOT stamp text clip over audio waveform
      },
      {
        id: 'V1',
        row: 3,
        name: i18n.t('videoTrack') || 'V1 (Video)',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>',
        cls: '',
        color: 'rgba(167, 139, 250, 0.35)',
        hasThumbnails: state.thumbnails && state.thumbnails.length > 0,
        clips: (state.project.videoFilePath && total > 0) ? [{ s: 0, e: total, t: `00:00.00 - ${ui.formatTime(total)}` }] : []
      },
      {
        id: 'T1',
        row: 4,
        name: i18n.t('subtitlesTrack') || 'T1 (Subtitles)',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        cls: '',
        color: 'rgba(94, 234, 212, 0.45)',
        isSubtitleTrack: true,
        emptyHint: i18n.t('noSubsYet') || 'No subtitles yet',
        clips: state.rows.map(r => ({
          id: r.id,
          s: r.s,
          e: r.e,
          t: r.t,
          overflow: r.overflow,
          overflowDelta: r.overflowDelta
        }))
      },
      {
        id: 'A1',
        row: 5,
        name: i18n.t('dubTrack') || 'A1 (Dub)',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
        cls: '',
        color: 'rgba(249, 168, 212, 0.45)',
        emptyHint: i18n.t('noDubYet') || 'No dub audio yet',
        hasMute: true,
        muteId: 'tlMuteA1',
        isMuted: Boolean(state.timeline.a1Muted),
        muteTitle: 'Mute Dub Audio (A1)',
        peaks: (state.dubPeaks && state.dubPeaks.length > 0) ? state.dubPeaks : (state.rows.some(r => r.ok) ? state.origPeaks : null),
        clips: state.project.a1Path
          ? [{ s: 0, e: total, t: `DUB: ${state.project.a1Path.split(/[\\/]/).pop()}` }]
          : state.rows.filter(r => r.ok).map(r => ({ id: r.id, s: r.s, e: r.e, t: r.t }))
      },
      {
        id: 'A2',
        row: 6,
        name: i18n.t('bgmTrack') || 'BGM (Music)',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
        cls: '',
        color: 'rgba(139, 92, 246, 0.75)',
        hasMute: true,
        muteId: 'tlMuteBgm',
        isMuted: Boolean(state.timeline.bgmMuted),
        muteTitle: 'Mute BGM Track',
        peaks: (state.bgmPeaks && state.bgmPeaks.length > 0) ? state.bgmPeaks : state.origPeaks,
        clips: [] // Do NOT stamp text clip over BGM waveform
      }
    ];

    // Adaptive ruler ticks based on zoom level:
    // Centiseconds shown ONLY at high zoom (pxPerSec >= 80 or interval < 1s)
    const candidateIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const intervalSec = candidateIntervals.find(iv => iv * pxPerSec >= 75) || 300;
    const marks = [];
    if (total > 0) {
      for (let t = 0; t <= total; t += intervalSec) {
        const leftPct = (t / total) * 100;
        let timeStr;
        if (pxPerSec >= 80 || intervalSec < 1) {
          timeStr = ui.formatTime(t);
        } else {
          const m = Math.floor(t / 60);
          const s = Math.floor(t % 60);
          timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        let posStyle = `left:${leftPct}%;`;
        if (t === 0) {
          posStyle += ' transform: translateX(4px);';
        } else if (t + intervalSec > total) {
          posStyle += ' transform: translateX(-100%); margin-left: -4px;';
        }

        marks.push(`<span class="tl-ruler-mark" style="${posStyle}">${timeStr}</span>`);
      }
    } else {
      marks.push(`<span class="tl-ruler-mark" style="left:0%; transform: translateX(4px);">00:00</span>`);
    }

    const curTimeStr = ui.formatTime(state.timeline.playhead);
    const rulerHtml = `
      <div class="tl-ruler" id="tlRuler" data-track="ruler" style="grid-row:1; grid-column:2;">
        ${marks.join('')}
        <div class="playhead" style="left:${playheadPct}%;">
          <div class="playhead-time-pill" id="tlPlayheadPill">${curTimeStr}</div>
        </div>
      </div>
    `;

    const tracksHtml = tracksDef.map(trk => {
      const clipsHtml = trk.clips.map((c, cIdx) => {
        const leftPct = (c.s / total) * 100;
        const widthPct = Math.max(0.4, ((c.e - c.s) / total) * 100);
        const isSel = c.id && c.id === state.selectedId;
        const clipW = ((c.e - c.s) / total) * (minWidthPx || 900);
        const isNarrow = clipW < 28;
        const narrowCls = isNarrow ? 'narrow-clip' : '';

        // Render resize handles only on editable subtitle track (T1)
        const handles = trk.isSubtitleTrack ? `
          <div class="resize-handle left" data-handle="left"></div>
          <div class="resize-handle right" data-handle="right"></div>
        ` : '';

        if (trk.id === 'V1') {
          return `<div class="clip v1-clip ${trk.cls}" 
                       data-track="V1" 
                       style="left:${leftPct}%; width:${widthPct}%;">
            <span class="v1-range-pill">${c.t}</span>
          </div>`;
        }

        const isOverflow = Boolean(c.overflow);
        const overflowCls = isOverflow ? 'overflow-warning' : '';
        const overflowBadge = isOverflow ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="margin-right:3px; flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>' : '';

        // Subtitle overlap detection
        const nextClip = trk.isSubtitleTrack ? trk.clips[cIdx + 1] : null;
        const isOverlap = Boolean(nextClip && (c.e > nextClip.s + 0.01));
        const overlapCls = isOverlap ? 'clip-overlap' : '';
        const overlapSec = isOverlap ? (c.e - nextClip.s).toFixed(2) : 0;
        const overlapBadge = isOverlap ? `<span class="clip-overlap-badge" title="⚠️ Overlap: +${overlapSec}s with next subtitle" style="color:#f59e0b; font-weight:bold; margin-right:3px; flex-shrink:0; font-size:10px;">⚠️</span>` : '';

        const durationSec = (c.e - c.s).toFixed(2);
        const fullTooltip = `${c.t} [${ui.formatTime(c.s)} - ${ui.formatTime(c.e)} (${durationSec}s)]${isOverflow ? ' [Overflow: +' + (c.overflowDelta || 0.5) + 's]' : ''}${isOverlap ? ' [⚠️ Overlap: +' + overlapSec + 's]' : ''}`;

        return `<div class="clip ${isSel ? 'sel' : ''} ${overflowCls} ${overlapCls} ${narrowCls}" 
                     data-id="${c.id || ''}" 
                     data-track="${trk.id}"
                     title="${fullTooltip}"
                     aria-label="${fullTooltip}"
                     style="left:${leftPct}%; width:${widthPct}%; background:${trk.color};">
          ${handles}
          ${overflowBadge}
          ${overlapBadge}
          <span style="overflow:hidden; text-overflow:ellipsis; pointer-events:none;">${c.t}</span>
        </div>`;
      }).join('');

      let extraContent = '';
      if (trk.peaks && trk.peaks.length > 0) {
        extraContent += this.buildWaveformSvg(trk.peaks, trk.id === 'A1' ? '#f9a8d4' : '#a78bfa', trk.cls === 'thin' ? 24 : 36);
      } else if (trk.clips.length === 0 && trk.emptyHint) {
        extraContent += `<div class="track-empty-lane"><span class="track-empty-hint">${trk.emptyHint}</span></div>`;
      } else if (trk.clips.length > 0 && !trk.isSubtitleTrack && trk.id !== 'V1') {
        extraContent += '<div class="track-waveform"></div>';
      }

      if (trk.id === 'V1') {
        if (trk.hasThumbnails) {
          const thumbs = state.thumbnails.map(t => {
            let src = t.path || t.fullPath || t.relPath;
            if (src && !src.startsWith('file://')) {
              src = 'file:///' + src.replace(/\\/g, '/');
            }
            return `<img class="track-thumb" src="${src}" alt="thumb">`;
          }).join('');
          extraContent += `<div class="track-thumbnails">${thumbs}</div>`;
        } else {
          // Dedicated clean video placeholder (never audio zebra stripes)
          const hasVideo = Boolean(state.project.videoFilePath || state.videoFilePath);
          const videoLabel = hasVideo
            ? (i18n.t('noFilmstripYet') || 'Filmstrip not yet extracted')
            : (i18n.t('loadVideoForFilmstrip') || 'No video loaded');
          extraContent += `
            <div class="track-video-placeholder" id="v1Placeholder" title="${videoLabel}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 8 6 4-6 4Z"/></svg>
              <span>${videoLabel}</span>
              ${hasVideo ? `<button class="btn-extract-thumbs" id="btnExtractThumbs">Extract Filmstrip</button>` : ''}
            </div>
          `;
        }
      }

      return `<div class="track ${trk.cls}" data-track="${trk.id}" style="grid-row:${trk.row}; grid-column:2;">
        ${extraContent}
        ${clipsHtml}
        <div class="playhead" style="left:${playheadPct}%;"></div>
      </div>`;
    }).join('');

    // Sticky Left Labels Column Cells
    const labelsCellsHtml = tracksDef.map(trk => {
      const muteBtnHtml = trk.hasMute 
        ? `<button class="tl-mute-mini ${trk.isMuted ? 'on' : ''}" id="${trk.muteId}" title="${trk.muteTitle}">M</button>` 
        : '';
      return `
        <div class="tl-label-cell ${trk.cls}" data-track="${trk.id}" title="${trk.name}" style="grid-row:${trk.row}; grid-column:1;">
          <span class="tl-label-icon">${trk.icon}</span>
          <span class="tl-label-name">${trk.name}</span>
          ${muteBtnHtml}
        </div>
      `;
    }).join('');

    const labelsHtml = `
      <div class="tl-labels-column" id="tlLabelsCol">
        <div class="tl-label-cell tl-ruler-corner" data-track="ruler" style="grid-row:1; grid-column:1;">TIME</div>
        ${labelsCellsHtml}
      </div>
    `;

    // Horizontally Scrolling Lanes Area
    const lanesHtml = `
      <div class="tl-lanes-column" id="tlLanesCol">
        ${rulerHtml}
        ${tracksHtml}
      </div>
    `;

    this.container.innerHTML = labelsHtml + lanesHtml;

    // Attach listeners for Mute buttons
    const muteOrigBtn = this.container.querySelector('#tlMuteOrig');
    if (muteOrigBtn) {
      muteOrigBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMuted = state.toggleMuted();
        ui.showToast(isMuted ? (i18n.t('mutedOriginal') || 'Original audio muted') : (i18n.t('unmutedOriginal') || 'Original audio unmuted'));
      });
    }

    const muteA1Btn = this.container.querySelector('#tlMuteA1');
    if (muteA1Btn) {
      muteA1Btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.timeline.a1Muted = !state.timeline.a1Muted;
        muteA1Btn.classList.toggle('on', state.timeline.a1Muted);
        state.emit('timelineMuteChange');
        state.markDirty();
        ui.showToast(state.timeline.a1Muted ? 'Dub audio muted' : 'Dub audio unmuted');
      });
    }

    const muteBgmBtn = this.container.querySelector('#tlMuteBgm');
    if (muteBgmBtn) {
      muteBgmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.timeline.bgmMuted = !state.timeline.bgmMuted;
        muteBgmBtn.classList.toggle('on', state.timeline.bgmMuted);
        state.emit('timelineMuteChange');
        state.markDirty();
        ui.showToast(state.timeline.bgmMuted ? 'BGM muted' : 'BGM unmuted');
      });
    }

    const btnExtractThumbs = this.container.querySelector('#btnExtractThumbs');
    if (btnExtractThumbs) {
      btnExtractThumbs.addEventListener('click', async (e) => {
        e.stopPropagation();
        const videoPath = state.project.videoFilePath || state.videoFilePath;
        if (!videoPath) {
          ui.showToast(i18n.t('loadVideoFirst') || 'Please load a video first');
          return;
        }
        btnExtractThumbs.disabled = true;
        btnExtractThumbs.textContent = 'Extracting filmstrip...';
        try {
          const res = await ipcClient.generateThumbnails({ videoPath, count: 12, width: 160 });
          if (res && res.success && Array.isArray(res.thumbnails) && res.thumbnails.length > 0) {
            state.thumbnails = res.thumbnails;
            state.emit('change', { source: 'thumbnailsExtracted' });
            ui.showToast('Filmstrip extracted successfully');
          } else {
            btnExtractThumbs.disabled = false;
            btnExtractThumbs.textContent = 'Extract Filmstrip';
            ui.showToast(res?.error || 'Failed to extract filmstrip');
          }
        } catch (err) {
          btnExtractThumbs.disabled = false;
          btnExtractThumbs.textContent = 'Extract Filmstrip';
          ui.showToast(`Extraction error: ${err.message}`);
        }
      });
    }

    this.playheadEls = this.container ? Array.from(this.container.querySelectorAll('.playhead')) : [];
    this.playheadPillEl = document.getElementById('tlPlayheadPill');
    this.syncSlidersToSelection();
    this.updateEdgeIndicators();
    this.updateFollowBtnState();
    this.drawOverviewWaveform();
    this.updateOverviewWindow();
    this.updateOverviewPlayhead();
    this.updateOverlapButtonState();
  },

  _playheadRaf: null,

  updatePlayheadPosition() {
    if (this._playheadRaf) return;
    this._playheadRaf = requestAnimationFrame(() => {
      this._playheadRaf = null;
      this._doUpdatePlayheadPosition();
    });
  },

  _doUpdatePlayheadPosition() {
    const total = Math.max(0, state.project.duration || 0);
    const playheadPct = total > 0 ? (state.timeline.playhead / total) * 100 : 0;
    const playheadPctStr = `${playheadPct}%`;

    const playheads = (this.playheadEls && this.playheadEls.length > 0)
      ? this.playheadEls
      : (this.container?.querySelectorAll('.playhead') || []);

    for (let i = 0; i < playheads.length; i++) {
      playheads[i].style.left = playheadPctStr;
    }

    const pill = this.playheadPillEl || document.getElementById('tlPlayheadPill');
    if (pill) {
      pill.textContent = ui.formatTime(state.timeline.playhead);
    }
    this.updateOverviewPlayhead();

    // Auto-scroll when follow playhead is active (page-flip style, zero jitter)
    if (state.timeline.followPlayhead && !state.timeline.followPaused && this.container) {
      const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (this.container.clientWidth / total) : 20);
      const playheadPx = state.timeline.playhead * pxPerSec;
      const scrollLeft = this.container.scrollLeft;
      const labelW = 138;
      const visibleW = this.container.clientWidth - labelW;

      if (playheadPx >= scrollLeft + visibleW - 30) {
        this.isProgrammaticScroll = true;
        this.container.scrollLeft = playheadPx - 50;
        setTimeout(() => { this.isProgrammaticScroll = false; }, 60);
      } else if (playheadPx < scrollLeft) {
        this.isProgrammaticScroll = true;
        this.container.scrollLeft = Math.max(0, playheadPx - visibleW + 50);
        setTimeout(() => { this.isProgrammaticScroll = false; }, 60);
      }
    }

    this.updateEdgeIndicators();
  },

  getTimeFromPointerEvent(e) {
    const lane = document.getElementById('tlRuler') || this.container?.querySelector('.track');
    if (!lane) return 0;
    const rect = lane.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const total = Math.max(0, state.project.duration || 0);
    return pct * total;
  },

  /**
   * Split segment at current playhead position
   */
  splitAtPlayhead() {
    const playhead = state.timeline.playhead;
    const total = Math.max(0, state.project.duration || 0);

    // Find segment that spans across current playhead
    let target = state.rows.find(r => r.s + 0.15 < playhead && playhead < r.e - 0.15);
    let splitTime = playhead;

    if (!target) {
      // Fallback: split current selected segment at midpoint
      target = state.getCur();
      if (!target) {
        ui.showToast(i18n.t('noClipToSplit') || 'No subtitle clip at playhead to split');
        return;
      }
      splitTime = (target.s + target.e) / 2;
    }

    state.snapshot();

    // Divide text at nearest space or punctuation, or midpoint
    const text = target.t;
    let splitIdx = Math.floor(text.length / 2);
    const spaceIdx = text.indexOf(' ', Math.floor(text.length * 0.35));
    if (spaceIdx > 0 && spaceIdx < text.length * 0.75) {
      splitIdx = spaceIdx;
    }

    const textPart1 = text.slice(0, splitIdx).trim();
    const textPart2 = text.slice(splitIdx).trim();

    const originalEnd = target.e;
    target.e = Math.round(splitTime * 100) / 100;
    target.t = textPart1 || target.t;
    target.ok = false;

    const newRow = {
      ...target,
      id: ++state.nextId,
      s: Math.round(splitTime * 100) / 100,
      e: originalEnd,
      t: textPart2 || i18n.t('newTextPlaceholder'),
      ok: false,
      ck: false
    };

    const targetIdx = state.rows.indexOf(target);
    state.rows.splice(targetIdx + 1, 0, newRow);
    state.selectedId = newRow.id;

    state.emit('change', { source: 'split' });
    ui.showToast(`✂ ${ui.formatTime(splitTime)}`);
  },

  /**
   * Fix overlapping subtitles across all segments
   */
  fixOverlaps() {
    if (!state.rows || state.rows.length < 2) {
      ui.showToast(i18n.t('noOverlapsFound') || '✓ គ្មានចំណុចជាន់គ្នាទេ (No subtitle overlaps found)');
      return;
    }
    const overlaps = detectOverlaps(state.rows);
    if (!overlaps.length) {
      ui.showToast(i18n.t('noOverlapsFound') || '✓ គ្មានចំណុចជាន់គ្នាទេ (No subtitle overlaps found)');
      return;
    }

    state.snapshot();
    const count = overlaps.length;
    resolveOverlaps(state.rows);
    state.emit('change', { source: 'fixOverlaps' });
    ui.showToast(i18n.t('overlapsResolved', { count }) || `✓ បានដោះស្រាយ ${count} ចំណុចអក្សរជាន់គ្នា!`);
  },

  updateOverlapButtonState() {
    if (!this.fixOverlapsBtn) return;
    const overlaps = detectOverlaps(state.rows || []);
    const count = overlaps.length;
    if (this.fixOverlapsBadge) {
      if (count > 0) {
        this.fixOverlapsBadge.textContent = String(count);
        this.fixOverlapsBadge.hidden = false;
      } else {
        this.fixOverlapsBadge.hidden = true;
      }
    }
    if (count > 0) {
      this.fixOverlapsBtn.classList.add('has-overlaps');
      this.fixOverlapsBtn.title = `${i18n.t('fixOverlapsTip') || 'Fix Overlapping Subtitles'} (${count})`;
    } else {
      this.fixOverlapsBtn.classList.remove('has-overlaps');
      this.fixOverlapsBtn.title = i18n.t('noOverlapsFound') || '✓ គ្មានចំណុចជាន់គ្នាទេ';
    }
  },

  attachEventListeners() {
    if (!this.container) return;

    // Split button
    if (this.splitBtn) {
      this.splitBtn.addEventListener('click', () => this.splitAtPlayhead());
    }

    // Fix overlaps button
    if (this.fixOverlapsBtn) {
      this.fixOverlapsBtn.addEventListener('click', () => this.fixOverlaps());
    }

    // Pointerdown for dragging clips, resizing handles, or scrubbing playhead
    this.container.addEventListener('pointerdown', e => {
      const handle = e.target.dataset.handle;
      const clip = e.target.closest('.clip');

      // 1. Resizing clip edges (left or right)
      if (handle && clip && clip.dataset.track === 'T1') {
        e.stopPropagation();
        e.preventDefault();
        const id = Number(clip.dataset.id);
        const segment = state.rows.find(r => r.id === id);
        if (!segment) return;

        this.dragMode = handle === 'left' ? 'resize-left' : 'resize-right';
        this.activeClipId = id;
        this.dragStartX = e.clientX;
        this.initialStart = segment.s;
        this.initialEnd = segment.e;

        state.select(id);
        this.startClipDragListeners();
        return;
      }

      // 2. Dragging/moving clip body on T1 track
      if (clip && clip.dataset.track === 'T1') {
        const id = Number(clip.dataset.id);
        const segment = state.rows.find(r => r.id === id);
        if (!segment) return;

        this.dragMode = 'move';
        this.activeClipId = id;
        this.dragStartX = e.clientX;
        this.initialStart = segment.s;
        this.initialEnd = segment.e;
        this.hasMoved = false;

        state.select(id);
        this.startClipDragListeners();
        return;
      }

      // 2b. Clicking on A1 dub clip: select it and seek to start
      if (clip && clip.dataset.track === 'A1' && clip.dataset.id) {
        const id = Number(clip.dataset.id);
        const segment = state.rows.find(r => r.id === id);
        if (segment) {
          state.select(id);
          state.setPlayhead(segment.s);
          return;
        }
      }

      // 3. Playhead scrub/drag on tracks or ruler
      if (e.target.closest('.track') || e.target.closest('.tl-ruler')) {
        this.isDraggingPlayhead = true;
        const seekTime = this.getTimeFromPointerEvent(e);
        state.setPlayhead(seekTime);

        const onPointerMove = (moveEvt) => {
          if (!this.isDraggingPlayhead) return;
          const time = this.getTimeFromPointerEvent(moveEvt);
          state.setPlayhead(time);
        };

        const onPointerUp = () => {
          this.isDraggingPlayhead = false;
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }
    });

    // Ctrl+wheel zooms; plain wheel scrolls (native horizontal scroll via Shift+wheel is fine)
    this.container.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return; // let plain wheel pass through (native scroll)
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
      const current = state.timeline.pxPerSec || this.getMinPxPerSec();
      this.applyZoom(current * factor, e.clientX);
    }, { passive: false });

    // Zoom slider (now represents 0–100% of the pxPerSec range)
    if (this.zoomSlider) {
      this.zoomSlider.min = '0';
      this.zoomSlider.max = '100';
      this.zoomSlider.value = '0';
      this.zoomSlider.addEventListener('input', () => {
        const minPPS = this.getMinPxPerSec();
        const maxPPS = 200;
        const pct = Number(this.zoomSlider.value) / 100;
        const newPPS = minPPS + pct * (maxPPS - minPPS);
        this.applyZoom(newPPS);
      });
    }

    if (this.zoomInBtn && this.zoomSlider) {
      this.zoomInBtn.addEventListener('click', () => {
        this.zoomSlider.stepUp(10);
        this.zoomSlider.dispatchEvent(new Event('input'));
      });
    }

    if (this.zoomOutBtn && this.zoomSlider) {
      this.zoomOutBtn.addEventListener('click', () => {
        this.zoomSlider.stepDown(10);
        this.zoomSlider.dispatchEvent(new Event('input'));
      });
    }

    // Follow Playhead button click
    if (this.followBtn) {
      this.followBtn.addEventListener('click', () => {
        if (state.timeline.followPaused) {
          state.timeline.followPaused = false;
        } else {
          state.timeline.followPlayhead = !state.timeline.followPlayhead;
          state.timeline.followPaused = false;
        }
        this.updateFollowBtnState();
        if (state.timeline.followPlayhead) {
          this.scrollToPlayhead();
        }
      });
    }

    // Edge indicators click
    if (this.edgeLeft) {
      this.edgeLeft.addEventListener('click', () => this.scrollToPlayhead());
    }
    if (this.edgeRight) {
      this.edgeRight.addEventListener('click', () => this.scrollToPlayhead());
    }

    // Home key shortcut: Go to playhead
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Home' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        this.scrollToPlayhead();
      }
    });

    // Detect manual scrolling on container -> pause follow playhead & update overview window
    this.container.addEventListener('scroll', () => {
      if (!this.isProgrammaticScroll) {
        if (state.timeline.followPlayhead && !state.timeline.followPaused) {
          state.timeline.followPaused = true;
          this.updateFollowBtnState();
        }
      }
      this.updateEdgeIndicators();
      this.updateOverviewWindow();
    });

    // Sliders (Speed, Vol, Pitch) - reactive per-selection or global
    document.querySelectorAll('.sliders input').forEach(input => {
      input.addEventListener('input', () => {
        const out = input.nextElementSibling;
        if (!out) return;
        const val = +input.value;
        const isSpeed = input.min === '0.5' && input.step === '0.1';
        out.textContent = val.toFixed(input.step < 1 ? 1 : 0) + (isSpeed ? 'x' : '');

        // If Speed slider in timeline bar changed, apply to active target segments
        if (isSpeed) {
          const targets = state.getTargets();
          if (targets.length) {
            targets.forEach(r => { r.sp = val; });
            state.emit('change', { source: 'timelineSpeed' });
          }
        }
      });
    });

    // Toggle buttons
    const setupToggle = (btn, stateKey, labelKey) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const nextVal = !state.timeline[stateKey];
        state.timeline[stateKey] = nextVal;
        btn.classList.toggle('on', nextVal);
        if (labelKey) {
          btn.textContent = i18n.t(labelKey, { state: nextVal ? 'ON' : 'OFF' });
        }
        state.markDirty();
      });
    };

    setupToggle(this.syncBtn, 'syncEnd', 'syncEnd');

    if (this.duckBtn) {
      this.duckBtn.addEventListener('click', () => {
        if (!state.timeline.ducking) {
          state.timeline.ducking = true;
          state.timeline.duckingPreset = 'balanced';
        } else if (state.timeline.duckingPreset === 'balanced') {
          state.timeline.duckingPreset = 'deep';
        } else if (state.timeline.duckingPreset === 'deep') {
          state.timeline.duckingPreset = 'gentle';
        } else {
          state.timeline.ducking = false;
        }
        this.updateDuckBtnState();
        state.markDirty();
      });
    }

    if (this.crowdBtn) {
      this.crowdBtn.addEventListener('click', () => {
        state.timeline.crowd = !state.timeline.crowd;
        this.updateCrowdBtnState();
        state.markDirty();
        ui.showToast(state.timeline.crowd ? 'Crowd Ambience: ON' : 'Crowd Ambience: OFF');
      });
    }

    // Upgraded Reverb Button & Settings Popover
    if (this.reverbBtn) {
      const revPresets = ['hall', 'room', 'plate', 'cathedral'];
      this.reverbBtn.addEventListener('click', () => {
        if (!state.timeline.reverb) {
          state.timeline.reverb = true;
          state.timeline.reverbPreset = state.timeline.reverbPreset || 'hall';
        } else {
          const curIdx = revPresets.indexOf(state.timeline.reverbPreset || 'hall');
          if (curIdx < revPresets.length - 1) {
            state.timeline.reverbPreset = revPresets[curIdx + 1];
          } else {
            state.timeline.reverb = false;
          }
        }
        this.updateReverbBtnState();
        state.markDirty();
      });

      // Contextmenu on reverb button opens popover
      this.reverbBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pop = document.getElementById('reverbPopover');
        if (pop) pop.hidden = !pop.hidden;
      });
    }

    const revGearBtn = document.getElementById('reverbSettingsBtn');
    const revPopover = document.getElementById('reverbPopover');
    const revCloseBtn = document.getElementById('reverbPopoverCloseBtn');

    if (revGearBtn && revPopover) {
      revGearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        revPopover.hidden = !revPopover.hidden;
      });
    }

    if (revCloseBtn && revPopover) {
      revCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        revPopover.hidden = true;
      });
    }

    // Presets Grid in Popover
    document.querySelectorAll('.btn-reverb-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.dataset.preset;
        state.timeline.reverb = true;
        state.timeline.reverbPreset = preset;
        if (preset === 'room') {
          state.timeline.reverbDecay = 25;
          state.timeline.reverbMix = 30;
        } else if (preset === 'hall') {
          state.timeline.reverbDecay = 60;
          state.timeline.reverbMix = 40;
        } else if (preset === 'cathedral') {
          state.timeline.reverbDecay = 120;
          state.timeline.reverbMix = 55;
        } else if (preset === 'plate') {
          state.timeline.reverbDecay = 45;
          state.timeline.reverbMix = 35;
        }
        this.updateReverbBtnState();
        state.markDirty();
        if (typeof ui !== 'undefined' && ui.showToast) {
          ui.showToast(`Applied Reverb Preset: ${preset.toUpperCase()}`, 1500);
        }
      });
    });

    // Mix Slider
    const revMixSlider = document.getElementById('reverbMixSlider');
    if (revMixSlider) {
      revMixSlider.addEventListener('input', () => {
        state.timeline.reverb = true;
        state.timeline.reverbMix = parseInt(revMixSlider.value, 10);
        this.updateReverbBtnState();
        state.markDirty();
      });
    }

    // Decay Slider
    const revDecaySlider = document.getElementById('reverbDecaySlider');
    if (revDecaySlider) {
      revDecaySlider.addEventListener('input', () => {
        state.timeline.reverb = true;
        state.timeline.reverbDecay = parseInt(revDecaySlider.value, 10);
        this.updateReverbBtnState();
        state.markDirty();
      });
    }

    // Click outside to dismiss Reverb Popover
    window.addEventListener('click', (e) => {
      if (revPopover && !revPopover.hidden) {
        if (!e.target.closest('.reverb-control-wrapper')) {
          revPopover.hidden = true;
        }
      }
    });

    // Auto-Fit button cycling
    if (this.autofitBtn) {
      const afLevels = ['Off', 'Low', 'Med', 'High'];
      this.autofitBtn.addEventListener('click', () => {
        state.timeline.autofitIndex = (state.timeline.autofitIndex + 1) % 4;
        const mode = afLevels[state.timeline.autofitIndex];
        this.autofitBtn.textContent = i18n.t('autoFit', { mode });
        this.autofitBtn.classList.toggle('on', state.timeline.autofitIndex > 0);
        state.markDirty();
      });
    }
  },

  updateFollowBtnState() {
    if (!this.followBtn || !this.followTxt) return;
    const isPaused = state.timeline.followPaused;
    const isFollowing = state.timeline.followPlayhead;

    this.followBtn.classList.toggle('on', isFollowing && !isPaused);
    if (isFollowing) {
      if (isPaused) {
        this.followTxt.textContent = i18n.t('followPaused');
        this.followBtn.style.opacity = '0.75';
      } else {
        this.followTxt.textContent = i18n.t('followPlayhead', { state: 'ON' });
        this.followBtn.style.opacity = '1';
      }
    } else {
      this.followTxt.textContent = i18n.t('followPlayhead', { state: 'OFF' });
      this.followBtn.style.opacity = '0.6';
    }
  },

  updateEdgeIndicators() {
    if (!this.container || !this.edgeLeft || !this.edgeRight) return;
    const total = Math.max(0, state.project.duration || 0);
    const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (this.container.clientWidth / total) : 20);
    const playheadPx = state.timeline.playhead * pxPerSec;
    const scrollLeft = this.container.scrollLeft;
    const labelW = 138;
    const visibleW = this.container.clientWidth - labelW;
    const playheadTime = state.timeline.playhead;

    if (playheadPx < scrollLeft - 5) {
      this.edgeLeft.hidden = false;
      this.edgeLeft.textContent = `◀ ${ui.formatTime(playheadTime)}`;
    } else {
      this.edgeLeft.hidden = true;
    }

    if (playheadPx > scrollLeft + visibleW + 5) {
      this.edgeRight.hidden = false;
      this.edgeRight.textContent = `${ui.formatTime(playheadTime)} ▶`;
    } else {
      this.edgeRight.hidden = true;
    }
  },

  scrollToPlayhead() {
    if (!this.container) return;
    const total = Math.max(0, state.project.duration || 0);
    const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (this.container.clientWidth / total) : 20);
    const playheadPx = state.timeline.playhead * pxPerSec;
    const labelW = 138;
    const visibleW = this.container.clientWidth - labelW;
    const target = Math.max(0, playheadPx - visibleW / 2);

    this.isProgrammaticScroll = true;
    this.container.scrollTo({ left: target, behavior: 'smooth' });
    setTimeout(() => {
      this.isProgrammaticScroll = false;
      this.updateEdgeIndicators();
    }, 300);
  },

  scrollSelectedClipIntoView() {
    if (!this.container || !state.selectedId) return;
    const seg = state.rows.find(r => r.id === state.selectedId);
    if (!seg) return;

    const total = Math.max(0, state.project.duration || 0);
    const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (this.container.clientWidth / total) : 20);
    const clipStartPx = seg.s * pxPerSec;
    const clipEndPx = seg.e * pxPerSec;
    const scrollLeft = this.container.scrollLeft;
    const labelW = 138;
    const visibleW = this.container.clientWidth - labelW;

    if (clipStartPx < scrollLeft || clipEndPx > scrollLeft + visibleW) {
      const target = Math.max(0, clipStartPx - visibleW / 4);
      this.isProgrammaticScroll = true;
      this.container.scrollTo({ left: target, behavior: 'smooth' });
      setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.updateEdgeIndicators();
      }, 250);
    }
  },

  startClipDragListeners() {
    const total = Math.max(0, state.project.duration || 0);
    const ruler = document.getElementById('tlRuler') || this.container?.querySelector('.track');
    const trackWidth = ruler ? ruler.getBoundingClientRect().width : 1000;

    // Determine collision boundary limits from neighboring clips to prevent overlapping
    const otherRows = (state.rows || [])
      .filter(r => r.id !== this.activeClipId)
      .sort((a, b) => a.s - b.s);
    const prevSeg = otherRows.filter(r => r.s < this.initialStart).pop();
    const nextSeg = otherRows.find(r => r.s >= this.initialStart);

    const minAllowed = prevSeg ? prevSeg.e : 0;
    const maxAllowed = nextSeg ? nextSeg.s : total;

    const onPointerMove = (e) => {
      if (!this.dragMode || !this.activeClipId) return;
      const segment = state.rows.find(r => r.id === this.activeClipId);
      if (!segment) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaSec = (deltaX / trackWidth) * total;
      if (Math.abs(deltaX) > 3) this.hasMoved = true;

      const playhead = state.timeline.playhead;

      if (this.dragMode === 'resize-left') {
        let newStart = Math.max(minAllowed, Math.min(this.initialEnd - 0.2, this.initialStart + deltaSec));
        // Snapping within 0.25s of playhead if within boundary
        if (Math.abs(newStart - playhead) < 0.25 && playhead >= minAllowed && playhead <= this.initialEnd - 0.2) {
          newStart = playhead;
        }
        segment.s = Math.round(newStart * 100) / 100;
        this.renderClipsOnly();
      } else if (this.dragMode === 'resize-right') {
        let newEnd = Math.max(this.initialStart + 0.2, Math.min(maxAllowed, this.initialEnd + deltaSec));
        if (Math.abs(newEnd - playhead) < 0.25 && playhead >= this.initialStart + 0.2 && playhead <= maxAllowed) {
          newEnd = playhead;
        }
        segment.e = Math.round(newEnd * 100) / 100;
        this.renderClipsOnly();
      } else if (this.dragMode === 'move') {
        const dur = this.initialEnd - this.initialStart;
        const maxMoveStart = Math.max(minAllowed, maxAllowed - dur);
        let newStart = Math.max(minAllowed, Math.min(maxMoveStart, this.initialStart + deltaSec));
        if (Math.abs(newStart - playhead) < 0.25 && playhead >= minAllowed && playhead <= maxMoveStart) {
          newStart = playhead;
        }
        segment.s = Math.round(newStart * 100) / 100;
        segment.e = Math.round((newStart + dur) * 100) / 100;
        this.renderClipsOnly();
      }
    };

    const onPointerUp = () => {
      if (this.hasMoved) {
        state.rows.sort((a, b) => a.s - b.s);
        resolveOverlaps(state.rows);
        state.snapshot();
        state.emit('change', { source: 'clipDrag' });
      } else if (this.activeClipId) {
        // Simple click without move seeks to clip start
        const seg = state.rows.find(r => r.id === this.activeClipId);
        if (seg) state.setPlayhead(seg.s);
      }

      this.dragMode = null;
      this.activeClipId = null;
      this.hasMoved = false;

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  },

  initSliders() {
    const speedSlider = document.getElementById('tlSpeed');
    const volSlider = document.getElementById('tlVol');
    const pitchSlider = document.getElementById('tlPitch');
    const zoomSlider = document.getElementById('zoom');
    const speedVal = document.getElementById('tlSpeedVal');
    const volVal = document.getElementById('tlVolVal');
    const pitchVal = document.getElementById('tlPitchVal');

    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        const val = parseFloat(speedSlider.value);
        if (speedVal) speedVal.textContent = val.toFixed(1) + 'x';
        const targets = state.getTargets();
        if (targets.length) {
          targets.forEach(r => { r.sp = val; });
          state.emit('change', { source: 'timelineSpeed' });
        }
      });
      speedSlider.addEventListener('dblclick', () => {
        speedSlider.value = '1';
        if (speedVal) speedVal.textContent = '1.0x';
        speedSlider.dispatchEvent(new Event('input'));
      });
    }

    if (volSlider) {
      volSlider.addEventListener('input', () => {
        const val = parseFloat(volSlider.value);
        if (volVal) volVal.textContent = Math.round(val * 100) + '%';
        state.timeline.vol = val;
        // Live gain applied to preview audio
        state.emit('timelineVolumeChange', val);
        const targets = state.getTargets();
        if (targets.length) {
          targets.forEach(r => { r.vol = val; });
          state.emit('change', { source: 'timelineVolume' });
        }
      });
      volSlider.addEventListener('dblclick', () => {
        volSlider.value = '1';
        if (volVal) volVal.textContent = '100%';
        volSlider.dispatchEvent(new Event('input'));
      });
    }

    if (pitchSlider) {
      pitchSlider.addEventListener('input', () => {
        const val = parseInt(pitchSlider.value, 10) || 0;
        if (pitchVal) pitchVal.textContent = val > 0 ? `+${val}` : `${val}`;
        state.timeline.pitch = val;
        const note = `Pitch: ${val > 0 ? '+' : ''}${val} semitones (Applied on export / អនុវត្តពេល Export)`;
        pitchSlider.title = note;
        if (pitchVal) pitchVal.title = note;
        const pitchNoteEl = document.getElementById('tlPitchNote');
        if (pitchNoteEl) pitchNoteEl.title = note;
        const targets = state.getTargets();
        if (targets.length) {
          targets.forEach(r => { r.pitch = val; });
          state.emit('change', { source: 'timelinePitch' });
        }
      });
      pitchSlider.addEventListener('dblclick', () => {
        pitchSlider.value = '0';
        if (pitchVal) pitchVal.textContent = '0';
        pitchSlider.dispatchEvent(new Event('input'));
      });
    }

    if (zoomSlider) {
      zoomSlider.addEventListener('dblclick', () => {
        this.resetZoomToFit();
      });
    }

    this.syncSlidersToSelection();
  },

  syncSlidersToSelection() {
    const speedSlider = document.getElementById('tlSpeed');
    const volSlider = document.getElementById('tlVol');
    const pitchSlider = document.getElementById('tlPitch');
    const speedVal = document.getElementById('tlSpeedVal');
    const volVal = document.getElementById('tlVolVal');
    const pitchVal = document.getElementById('tlPitchVal');

    const cur = state.getCur();
    if (cur) {
      const sp = typeof cur.sp === 'number' ? cur.sp : 1.0;
      const vol = typeof cur.vol === 'number' ? cur.vol : (state.timeline.vol ?? 1.0);
      const pitch = typeof cur.pitch === 'number' ? cur.pitch : (state.timeline.pitch ?? 0);

      if (speedSlider) speedSlider.value = String(sp);
      if (speedVal) speedVal.textContent = sp.toFixed(1) + 'x';

      if (volSlider) volSlider.value = String(vol);
      if (volVal) volVal.textContent = Math.round(vol * 100) + '%';

      if (pitchSlider) pitchSlider.value = String(pitch);
      if (pitchVal) pitchVal.textContent = pitch > 0 ? `+${pitch}` : `${pitch}`;
    } else {
      const sp = 1.0;
      const vol = state.timeline.vol ?? 1.0;
      const pitch = state.timeline.pitch ?? 0;

      if (speedSlider) speedSlider.value = String(sp);
      if (speedVal) speedVal.textContent = '1.0x';

      if (volSlider) volSlider.value = String(vol);
      if (volVal) volVal.textContent = Math.round(vol * 100) + '%';

      if (pitchSlider) pitchSlider.value = String(pitch);
      if (pitchVal) pitchVal.textContent = pitch > 0 ? `+${pitch}` : `${pitch}`;
    }
  },

  initResizer() {
    const resizer = document.getElementById('stageResizer');
    if (!resizer) return;

    const savedH = localStorage.getItem('timelineHeight');
    if (savedH) {
      document.documentElement.style.setProperty('--timeline-h', `${savedH}px`);
    }

    let isDragging = false;
    let startY = 0;
    let startH = 0;

    resizer.addEventListener('pointerdown', (e) => {
      isDragging = true;
      resizer.classList.add('dragging');
      startY = e.clientY;
      const timelinePanel = document.getElementById('timelinePanel');
      startH = timelinePanel ? timelinePanel.getBoundingClientRect().height : 330;
      resizer.setPointerCapture(e.pointerId);
    });

    resizer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY;
      const newH = Math.max(240, Math.min(550, startH + deltaY));
      document.documentElement.style.setProperty('--timeline-h', `${newH}px`);
    });

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('dragging');
      const timelinePanel = document.getElementById('timelinePanel');
      if (timelinePanel) {
        const finalH = Math.round(timelinePanel.getBoundingClientRect().height);
        localStorage.setItem('timelineHeight', finalH);
      }
    };

    resizer.addEventListener('pointerup', stopDrag);
    resizer.addEventListener('pointercancel', stopDrag);
  },

  initShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      // Shift+Z: Toggle Zoom to Fit
      if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        this.resetZoomToFit();
        ui.showToast(i18n.t('zoomFit') || 'Fit to Window (Shift+Z)');
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this.zoomToSelectedClip();
      } else if (((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        this.splitAtPlayhead();
      }
    });
  },

  getMinPxPerSec() {
    const total = Math.max(0, state.project.duration || 0);
    const containerW = this.container ? (this.container.clientWidth - 138) : 800;
    return total > 0 ? Math.max(1, containerW / total) : 10;
  },

  applyZoom(newPxPerSec, pivotClientX) {
    const total = Math.max(0, state.project.duration || 0);
    const minPPS = this.getMinPxPerSec();
    const maxPPS = 200;
    newPxPerSec = Math.max(minPPS, Math.min(maxPPS, newPxPerSec));

    if (!this.container) return;

    const rect = this.container.getBoundingClientRect();
    const labelW = 138;
    const visibleW = rect.width - labelW;
    const scrollLeft = this.container.scrollLeft;

    let pivotX;
    if (pivotClientX !== undefined) {
      pivotX = Math.max(0, pivotClientX - (rect.left + labelW));
    } else {
      const currentPPS = state.timeline.pxPerSec || minPPS;
      const playheadPx = state.timeline.playhead * currentPPS;
      if (playheadPx >= scrollLeft && playheadPx <= scrollLeft + visibleW) {
        pivotX = playheadPx - scrollLeft;
      } else {
        pivotX = visibleW / 2;
      }
    }

    const timeAtPivot = (scrollLeft + pivotX) / (state.timeline.pxPerSec || newPxPerSec);

    state.timeline.pxPerSec = newPxPerSec;
    state.timeline.zoom = newPxPerSec;

    if (this.zoomSlider) {
      const pct = ((newPxPerSec - minPPS) / (maxPPS - minPPS)) * 100;
      this.zoomSlider.value = Math.round(pct);
    }

    const newTrackW = Math.round(total * newPxPerSec);
    this.container.style.gridTemplateColumns = `var(--label-col-w, 138px) ${Math.max(newTrackW, visibleW)}px`;

    const zoomVal = document.getElementById('zoomVal');
    if (zoomVal) {
      zoomVal.textContent = `${Math.round(newPxPerSec)} px/s`;
    }

    this.updateOverviewWindow();

    requestAnimationFrame(() => {
      if (!this.container) return;
      const newScrollLeft = timeAtPivot * newPxPerSec - pivotX;
      this.isProgrammaticScroll = true;
      this.container.scrollLeft = Math.max(0, newScrollLeft);
      setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.updateEdgeIndicators();
        this.updateOverviewWindow();
      }, 50);
    });
  },

  resetZoomToFit() {
    const minPPS = this.getMinPxPerSec();
    this.applyZoom(minPPS);
    this.render();
  },

  drawOverviewWaveform() {
    if (!this.overviewCanvas || !this.overviewBar) return;
    const canvas = this.overviewCanvas;
    const rect = this.overviewBar.getBoundingClientRect();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const w = Math.round(rect.width || 800);
    const h = Math.round(rect.height || 32);

    if (w <= 0 || h <= 0) return;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const peaks = (state.origPeaks?.length) ? state.origPeaks : ((state.dubPeaks?.length) ? state.dubPeaks : (state.bgmPeaks || []));
    const total = Math.max(0, state.project.duration || 0);
    const midY = h / 2;

    // Center zero line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    if (Array.isArray(peaks) && peaks.length > 0) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#a78bfa');
      grad.addColorStop(0.5, '#c084fc');
      grad.addColorStop(1, '#a78bfa');

      ctx.fillStyle = grad;
      const step = w / peaks.length;

      for (let i = 0; i < peaks.length; i++) {
        const val = peaks[i] || 0;
        const amp = Math.max(1, val * (h / 2) * 0.88);
        const x = i * step;
        const barW = Math.max(1, step - 0.5);
        ctx.fillRect(x, midY - amp, barW, amp * 2);
      }
    }

    // Subtitle Segment dialogue markers
    if (total > 0 && Array.isArray(state.rows)) {
      ctx.fillStyle = '#5eead4';
      for (const seg of state.rows) {
        if (typeof seg.s === 'number' && typeof seg.e === 'number') {
          const segX = (seg.s / total) * w;
          const segW = Math.max(2, ((seg.e - seg.s) / total) * w);
          ctx.fillRect(segX, h - 3, segW, 3);
        }
      }
    }
  },

  updateOverviewWindow() {
    if (!this.overviewWindow || !this.container) return;
    const total = Math.max(0, state.project.duration || 0);
    if (total <= 0) {
      this.overviewWindow.style.left = '0%';
      this.overviewWindow.style.width = '100%';
      return;
    }

    const labelW = 138;
    const visibleW = Math.max(1, this.container.clientWidth - labelW);
    const pxPerSec = state.timeline.pxPerSec || (visibleW / total);
    const trackW = Math.max(visibleW, total * pxPerSec);

    const scrollLeft = this.container.scrollLeft;
    const leftPct = Math.max(0, Math.min(100, (scrollLeft / trackW) * 100));
    const widthPct = Math.max(2, Math.min(100 - leftPct, (visibleW / trackW) * 100));

    this.overviewWindow.style.left = `${leftPct.toFixed(2)}%`;
    this.overviewWindow.style.width = `${widthPct.toFixed(2)}%`;
  },

  updateOverviewPlayhead() {
    if (!this.overviewPlayhead) return;
    const total = Math.max(0, state.project.duration || 0);
    const pct = total > 0 ? (state.timeline.playhead / total) * 100 : 0;
    this.overviewPlayhead.style.left = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
  },

  initOverviewBar() {
    if (!this.overviewBar) return;

    // Hover time badge
    this.overviewBar.addEventListener('pointermove', (e) => {
      if (this.isDraggingOverviewWindow || this.isDraggingOverviewHandle) return;
      const rect = this.overviewBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const total = Math.max(0, state.project.duration || 0);
      const time = pct * total;

      if (this.overviewBadge && total > 0) {
        this.overviewBadge.hidden = false;
        this.overviewBadge.textContent = ui.formatTime(time);
        this.overviewBadge.style.left = `${(pct * 100).toFixed(1)}%`;
      }
    });

    this.overviewBar.addEventListener('pointerleave', () => {
      if (!this.isDraggingPlayhead && this.overviewBadge) {
        this.overviewBadge.hidden = true;
      }
    });

    // Scrubbing on overview bar
    this.overviewBar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tl-overview-window-handle') || e.target === this.overviewWindow) return;

      e.preventDefault();
      const rect = this.overviewBar.getBoundingClientRect();
      const total = Math.max(0, state.project.duration || 0);
      if (total <= 0) return;

      const seekTo = (clientX) => {
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const time = pct * total;
        state.setPlayhead(time);
        if (this.overviewBadge) {
          this.overviewBadge.hidden = false;
          this.overviewBadge.textContent = ui.formatTime(time);
          this.overviewBadge.style.left = `${(pct * 100).toFixed(1)}%`;
        }
      };

      seekTo(e.clientX);
      this.isDraggingPlayhead = true;

      const onPointerMove = (moveEvt) => {
        if (!this.isDraggingPlayhead) return;
        seekTo(moveEvt.clientX);
      };

      const onPointerUp = () => {
        this.isDraggingPlayhead = false;
        if (this.overviewBadge) this.overviewBadge.hidden = true;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    // Dragging Window to Pan Timeline
    if (this.overviewWindow) {
      this.overviewWindow.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tl-overview-window-handle')) return;
        e.preventDefault();
        e.stopPropagation();

        this.isDraggingOverviewWindow = true;
        this.overviewWindow.classList.add('dragging');
        const startX = e.clientX;
        const initialScroll = this.container ? this.container.scrollLeft : 0;
        const barRect = this.overviewBar.getBoundingClientRect();
        const total = Math.max(0, state.project.duration || 0);
        const labelW = 138;
        const visibleW = this.container ? (this.container.clientWidth - labelW) : 800;
        const pxPerSec = state.timeline.pxPerSec || (total > 0 ? visibleW / total : 20);
        const trackW = Math.max(visibleW, total * pxPerSec);

        const onPointerMove = (moveEvt) => {
          if (!this.isDraggingOverviewWindow || !this.container) return;
          const deltaX = moveEvt.clientX - startX;
          const deltaScroll = (deltaX / barRect.width) * trackW;
          this.isProgrammaticScroll = true;
          this.container.scrollLeft = Math.max(0, Math.min(trackW - visibleW, initialScroll + deltaScroll));
          this.updateOverviewWindow();
          this.updateEdgeIndicators();
        };

        const onPointerUp = () => {
          this.isDraggingOverviewWindow = false;
          this.overviewWindow.classList.remove('dragging');
          setTimeout(() => { this.isProgrammaticScroll = false; }, 50);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
    }

    // Dragging handles to adjust zoom
    const attachHandleZoom = (handleEl, isLeft) => {
      if (!handleEl) return;
      handleEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.isDraggingOverviewHandle = isLeft ? 'left' : 'right';
        const startX = e.clientX;
        const barRect = this.overviewBar.getBoundingClientRect();
        const currentPPS = state.timeline.pxPerSec || 20;

        const onPointerMove = (moveEvt) => {
          if (!this.isDraggingOverviewHandle) return;
          const deltaX = moveEvt.clientX - startX;
          const deltaPct = (deltaX / barRect.width);
          const scale = isLeft ? (1 - deltaPct * 2) : (1 + deltaPct * 2);
          const newPPS = Math.max(1, Math.min(200, currentPPS * scale));
          this.applyZoom(newPPS);
        };

        const onPointerUp = () => {
          this.isDraggingOverviewHandle = null;
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
    };

    attachHandleZoom(this.overviewHandleL, true);
    attachHandleZoom(this.overviewHandleR, false);

    // Zoom Fit button
    if (this.zoomFitBtn) {
      this.zoomFitBtn.addEventListener('click', () => {
        this.resetZoomToFit();
        ui.showToast(i18n.t('zoomFit') || 'Fit to Window (Shift+Z)');
      });
    }

    // Resize observer or window resize
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.drawOverviewWaveform();
        this.updateOverviewWindow();
      });
    }
  },

  zoomToSelectedClip() {
    if (!state.selectedId) return;
    const seg = state.rows.find(r => r.id === state.selectedId);
    if (!seg) return;
    const duration = Math.max(0.4, seg.e - seg.s);
    const containerW = this.container?.clientWidth || 800;
    const labelW = 138;
    const visibleW = Math.max(300, containerW - labelW);
    // Target: clip takes ~40% of visible container width
    const targetPxPerSec = Math.round((visibleW * 0.4) / duration);
    const total = Math.max(0, state.project.duration || 0);
    const minPPS = total > 0 ? Math.max(1, visibleW / total) : 10;
    const maxPPS = 200;
    const clampedPPS = Math.max(minPPS, Math.min(maxPPS, targetPxPerSec));

    state.timeline.pxPerSec = clampedPPS;
    if (this.zoomSlider) {
      const pct = ((clampedPPS - minPPS) / (maxPPS - minPPS)) * 100;
      this.zoomSlider.value = Math.round(pct);
    }
    const zoomVal = document.getElementById('zoomVal');
    if (zoomVal) zoomVal.textContent = `${Math.round(clampedPPS)} px/s`;

    this.render();

    setTimeout(() => {
      const clipCenterPx = ((seg.s + seg.e) / 2) * clampedPPS;
      this.isProgrammaticScroll = true;
      this.container.scrollLeft = Math.max(0, clipCenterPx - visibleW / 2);
      setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.updateEdgeIndicators();
      }, 50);
      ui.showToast(`Zoomed to clip #${seg.id} (${clampedPPS} px/s)`);
    }, 40);
  },

  renderClipsOnly() {
    const total = Math.max(0, state.project.duration || 0);
    const t1Track = this.container?.querySelector('.track[data-track="T1"]');
    if (!t1Track) return;

    const pxPerSec = state.timeline.pxPerSec || (total > 0 ? (this.container.clientWidth / total) : 20);
    const minWidthPx = total > 0 ? Math.round(total * pxPerSec) : (this.container.clientWidth || 800);

    const updateClipEl = (r, clipEl) => {
      if (!clipEl) return;
      const leftPct = (r.s / total) * 100;
      const widthPct = Math.max(0.4, ((r.e - r.s) / total) * 100);
      const clipW = ((r.e - r.s) / total) * (minWidthPx || 900);
      const isNarrow = clipW < 28;

      clipEl.style.left = `${leftPct}%`;
      clipEl.style.width = `${widthPct}%`;
      clipEl.classList.toggle('narrow-clip', isNarrow);

      const durationSec = (r.e - r.s).toFixed(2);
      const fullTooltip = `${r.t} [${ui.formatTime(r.s)} - ${ui.formatTime(r.e)} (${durationSec}s)]`;
      clipEl.title = fullTooltip;
      clipEl.setAttribute('aria-label', fullTooltip);
    };

    if (this.activeClipId) {
      const r = state.rows.find(row => row.id === this.activeClipId);
      if (r) {
        const clipEl = t1Track.querySelector(`.clip[data-id="${r.id}"]`);
        updateClipEl(r, clipEl);
      }
      return;
    }

    state.rows.forEach(r => {
      const clipEl = t1Track.querySelector(`.clip[data-id="${r.id}"]`);
      updateClipEl(r, clipEl);
    });
  }
};
