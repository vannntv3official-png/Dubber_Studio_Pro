/**
 * Player Module: HTML5 Video Preview, Caption Overlay, Play/Pause/Stop, Volume & Scrubbing
 */

import { state, getProjectDuration } from './state.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';
import { LucideIcons } from './icons.js';
import { vuMeter } from './vu-meter.js';

export const player = {
  container: null,
  videoEl: null,
  get video() {
    return this.videoEl;
  },
  playBtn: null,
  stopBtn: null,
  captionEl: null,
  curTimeEl: null,
  totalTimeEl: null,
  progressFill: null,
  progressTrack: null,
  seekTooltip: null,
  volumeSlider: null,
  muteBtn: null,
  bgmAudio: null,
  a1Audio: null,
  dubClipAudio: null,
  currentPlayingDubRowId: null,
  fallbackTimer: null,
  hasRealVideo: false,
  isScrubbing: false,
  _lastCaptionId: null,

  init() {
    this.container = document.getElementById('previewContainer');
    this.videoEl = document.getElementById('videoEl');
    this.playBtn = document.getElementById('play');
    this.stopBtn = document.getElementById('stop');
    this.captionEl = document.getElementById('cap');
    this.curTimeEl = document.getElementById('curTime');
    this.totalTimeEl = document.getElementById('totalTime');
    this.progressFill = document.getElementById('progressFill');
    this.progressTrack = document.getElementById('progressTrack');
    this.seekTooltip = document.getElementById('seekTooltip');
    this.volumeSlider = document.getElementById('volSlider');
    this.muteBtn = document.getElementById('mute');

    if (this.playBtn) this.playBtn.innerHTML = LucideIcons.play;
    if (this.stopBtn) this.stopBtn.innerHTML = LucideIcons.square;

    if (typeof Audio !== 'undefined') {
      try {
        this.bgmAudio = new Audio();
        this.bgmAudio.preload = 'auto';
        this.a1Audio = new Audio();
        this.a1Audio.preload = 'auto';
        this.dubClipAudio = new Audio();
        this.dubClipAudio.preload = 'auto';
      } catch (_) {}
    }

    this.attachEventListeners();
    vuMeter.init();
    this.applySubtitlePreset();

    state.on('change', () => {
      this.syncAudioTracks();
      this.updateCaption();
      this.updateControlsState();
    });
    state.on('selectionChange', () => this.updateCaption());
    state.on('projectLoaded', () => {
      this.onProjectLoaded();
      this.applySubtitlePreset();
      this.syncAudioTracks();
      this.updateControlsState();
    });
    state.on('subtitlePresetChange', (preset) => this.applySubtitlePreset(preset));
    state.on('subtitleScaleChange', (scale) => this.applySubtitleSize(scale));
    state.on('bilingualSubtitlesChange', () => this.updateCaption());
    state.on('subtitleVisibilityChange', () => this.updateCaption());
    state.on('languageChange', () => this.updateControlsState());
    state.on('playheadChange', ({ time, isSourceVideo }) => {
      this.syncPlayhead(time, isSourceVideo);
    });
    state.on('timelineVolumeChange', () => {
      this.updateEffectiveVolume();
    });
    state.on('timelineMuteChange', () => {
      this.updateEffectiveVolume();
    });
    state.on('muteChange', (isMuted) => {
      this.syncMute(isMuted);
    });

    window.addEventListener('resize', () => {
      this.fitPreviewContainer();
    });
    document.addEventListener('fullscreenchange', () => {
      this.fitPreviewContainer();
    });

    this.syncAudioTracks();
    this.syncMute();
    this.updateControlsState();
    this.updateCaption();
    this.updateTimeDisplay(state.timeline.playhead || 0);
  },

  updateControlsState() {
    const hasVideo = Boolean(this.hasRealVideo || (state.project && state.project.videoFilePath && getProjectDuration() > 0));
    const emptyTip = i18n.t('loadVideoFirst') || 'Load a video first';

    if (this.playBtn) {
      this.playBtn.disabled = !hasVideo;
      this.playBtn.title = hasVideo ? (i18n.t('playPause') || 'Play/Pause (Space)') : emptyTip;
      if (!hasVideo) {
        this.playBtn.setAttribute('aria-disabled', 'true');
      } else {
        this.playBtn.removeAttribute('aria-disabled');
      }
    }

    if (this.progressTrack) {
      if (!hasVideo) {
        this.progressTrack.classList.add('disabled');
        this.progressTrack.setAttribute('aria-disabled', 'true');
        this.progressTrack.title = emptyTip;
      } else {
        this.progressTrack.classList.remove('disabled');
        this.progressTrack.removeAttribute('aria-disabled');
        this.progressTrack.title = '';
      }
    }

    if (this.stopBtn) {
      this.stopBtn.disabled = !hasVideo;
      this.stopBtn.title = hasVideo ? (i18n.t('stop') || 'Stop') : emptyTip;
    }
  },

  onProjectLoaded() {
    if (state.project.videoFilePath) {
      this.loadVideo(state.project.videoFilePath);
    } else {
      this.unloadVideo();
      this.updateTimeDisplay(0);
    }
  },

  unloadVideo() {
    if (!this.videoEl) return;
    this.stopPlayback();
    this.unloadBgmAudio();
    this.unloadA1Audio();
    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    if (this.container) {
      this.container.classList.remove('has-video');
      this.container.style.width = '';
      this.container.style.height = '';
      this.container.style.aspectRatio = '';
      this.container.style.margin = '';
    }
    this.hasRealVideo = false;
    this.updateTimeDisplay(0);
  },

  fitPreviewContainer() {
    if (!this.container || !this.videoEl) return;
    if (!this.hasRealVideo || !this.videoEl.videoWidth || !this.videoEl.videoHeight) {
      if (this.container && !this.hasRealVideo) {
        this.container.style.width = '';
        this.container.style.height = '';
        this.container.style.aspectRatio = '';
        this.container.style.margin = '';
      }
      return;
    }

    if (document.fullscreenElement === this.container) {
      this.container.style.width = '';
      this.container.style.height = '';
      this.container.style.aspectRatio = '';
      this.container.style.margin = '';
      return;
    }

    const parent = this.container.parentElement;
    const availW = parent ? Math.max(160, parent.clientWidth - 28) : 292;
    const maxW = availW;

    const vh = window.innerHeight || 800;
    const maxH = Math.max(200, Math.min(vh - 280, 560));

    const vw = this.videoEl.videoWidth;
    const vhVideo = this.videoEl.videoHeight;
    const videoRatio = vw / vhVideo;

    let targetW = maxW;
    let targetH = targetW / videoRatio;

    if (targetH > maxH) {
      targetH = maxH;
      targetW = targetH * videoRatio;
    }

    targetW = Math.round(targetW);
    targetH = Math.round(targetH);

    this.container.style.width = `${targetW}px`;
    this.container.style.height = `${targetH}px`;
    this.container.style.aspectRatio = `${vw} / ${vhVideo}`;
    this.container.style.margin = '0 auto';
  },

  loadVideo(filePath) {
    if (!this.videoEl) return;
    this.unloadVideo();
    try {
      // Format file path for Chromium file:// URL
      let normalized = filePath.replace(/\\/g, '/');
      if (!normalized.startsWith('file://')) {
        normalized = 'file:///' + normalized.replace(/^([a-zA-Z]):/, '$1:');
      }
      this.videoEl.src = normalized;
      this.container?.classList.add('has-video');
      this.hasRealVideo = true;
      this.videoEl.load();
      this.syncMute();

      this.videoEl.onloadedmetadata = () => {
        this.syncMute();
        if (this.videoEl.duration && !isNaN(this.videoEl.duration)) {
          state.project.duration = this.videoEl.duration;
          this.updateTimeDisplay(state.timeline.playhead);
        }

        this.fitPreviewContainer();
      };
      this.videoEl.onloadeddata = () => {
        this.fitPreviewContainer();
      };

      console.log('Video loaded in preview player:', normalized);
    } catch (err) {
      console.error('Failed to load video in player:', err);
    }
  },

  updateCaption() {
    if (!this.captionEl) return;
    // Subtitle Caption is in Coming Soon status - keep overlay hidden from video preview
    this.captionEl.style.display = 'none';
    return;

    const curTime = state.timeline.playhead || 0;
    const isBilingual = Boolean(state.project.bilingualSubtitles);

    const escapeCaptionHtml = (str) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const renderText = (seg) => {
      const primary = seg.t || '';
      const secondary = isBilingual && (seg.sourceText || seg.origText) ? (seg.sourceText || seg.origText) : '';
      if (secondary) {
        this.captionEl.innerHTML = `<span class="sub-primary-line">${escapeCaptionHtml(primary)}</span><span class="sub-secondary-line">${escapeCaptionHtml(secondary)}</span>`;
      } else {
        this.captionEl.textContent = primary;
      }
    };

    // Find if a segment is currently speaking at this exact playhead time
    const activeSegment = state.rows.find(r => r.s <= curTime && curTime <= r.e);

    if (activeSegment) {
      this.captionEl.style.display = '';
      renderText(activeSegment);
      this.captionEl.style.opacity = '1';

      if (this._lastCaptionId !== activeSegment.id) {
        this._lastCaptionId = activeSegment.id;
        this.captionEl.classList.remove('sub-pop-anim');
        void this.captionEl.offsetWidth; // trigger reflow for smooth re-entry pop
        this.captionEl.classList.add('sub-pop-anim');
      }
    } else if (state.timeline.isPlaying) {
      // During active playback with no speech, fade out caption box
      this.captionEl.style.opacity = '0';
      this._lastCaptionId = null;
    } else {
      // When paused, show selected segment text
      const selected = state.getCur();
      if (selected && (selected.t || selected.sourceText)) {
        this.captionEl.style.display = '';
        renderText(selected);
        this.captionEl.style.opacity = '1';
        this._lastCaptionId = selected.id;
      } else if (state.rows.length > 0) {
        this.captionEl.style.display = '';
        this.captionEl.textContent = i18n.t('subtitlePreview') || 'Subtitle Preview';
        this.captionEl.style.opacity = '0.5';
        this._lastCaptionId = null;
      } else {
        this.captionEl.style.display = 'none';
        this._lastCaptionId = null;
      }
    }
  },

  applySubtitlePreset(preset = null) {
    if (!this.captionEl) return;
    const activePreset = preset || state.project.subtitlePreset || 'tiktok-yellow';
    this.captionEl.classList.remove(
      'sub-preset-tiktok',
      'sub-preset-neon',
      'sub-preset-cinema',
      'sub-preset-fire',
      'sub-preset-anime',
      'sub-preset-cyberpunk',
      'sub-preset-glass',
      'sub-preset-classic'
    );
    if (activePreset === 'tiktok-yellow') this.captionEl.classList.add('sub-preset-tiktok');
    else if (activePreset === 'neon-cyan') this.captionEl.classList.add('sub-preset-neon');
    else if (activePreset === 'cinema-white') this.captionEl.classList.add('sub-preset-cinema');
    else if (activePreset === 'fire-punch') this.captionEl.classList.add('sub-preset-fire');
    else if (activePreset === 'anime-gold') this.captionEl.classList.add('sub-preset-anime');
    else if (activePreset === 'cyberpunk-magenta') this.captionEl.classList.add('sub-preset-cyberpunk');
    else if (activePreset === 'minimal-glass') this.captionEl.classList.add('sub-preset-glass');
    else if (activePreset === 'classic-cc') this.captionEl.classList.add('sub-preset-classic');

    this.applySubtitleSize();
  },

  applySubtitleSize(scale = null) {
    if (!this.captionEl) return;
    const rawVal = scale !== null ? scale : (state.project.subtitleScalePct || state.project.subtitleScale || 100);
    let pct = 100;
    if (typeof rawVal === 'number') {
      pct = Math.max(50, Math.min(250, rawVal));
    } else if (rawVal === 'sm') pct = 80;
    else if (rawVal === 'md') pct = 100;
    else if (rawVal === 'lg') pct = 125;
    else if (rawVal === 'xl') pct = 150;
    else {
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed) && parsed > 0) pct = Math.max(50, Math.min(250, parsed));
    }

    const basePx = 13.5;
    const pxSize = Math.max(8, Math.min(36, basePx * (pct / 100)));
    this.captionEl.style.fontSize = `${pxSize.toFixed(1)}px`;
    const py = Math.max(3, Math.min(14, 6 * (pct / 100)));
    const px = Math.max(6, Math.min(24, 12 * (pct / 100)));
    this.captionEl.style.padding = `${py.toFixed(1)}px ${px.toFixed(1)}px`;
  },

  syncPlayhead(time, isSourceVideo = false) {
    this.updateTimeDisplay(time);
    const isPaused = !this.isPlaying;
    if (!isSourceVideo && this.hasRealVideo && this.videoEl) {
      if (isPaused || Math.abs(this.videoEl.currentTime - time) > 0.3) {
        this.videoEl.currentTime = time;
      }
    }
    if (!isSourceVideo) {
      if (this.bgmAudio && this.bgmAudio.src) {
        if (isPaused || Math.abs(this.bgmAudio.currentTime - time) > 0.3) {
          this.bgmAudio.currentTime = time;
        }
      }
      if (this.a1Audio && this.a1Audio.src) {
        if (isPaused || Math.abs(this.a1Audio.currentTime - time) > 0.3) {
          this.a1Audio.currentTime = time;
        }
      }
    }
  },

  updateTimeDisplay(time = 0) {
    const total = Math.max(0, state.project.duration || 0);
    if (this.curTimeEl) this.curTimeEl.textContent = ui.formatTime(time || 0);
    if (this.totalTimeEl) this.totalTimeEl.textContent = ui.formatTime(total);

    if (this.progressFill) {
      const pct = total > 0 ? Math.max(0, Math.min(100, (time / total) * 100)) : 0;
      this.progressFill.style.width = `${pct}%`;
    }

    this.updateCaption();
  },

  async togglePlay() {
    if (!this.hasRealVideo && getProjectDuration() <= 0) {
      return;
    }
    if (this.hasRealVideo && this.videoEl) {
      if (this.videoEl.paused) {
        try {
          this.syncMute();
          await this.videoEl.play();
        } catch (_) {}
      } else {
        this.videoEl.pause();
      }
    } else {
      // Fallback timer simulation for demo without loaded video
      state.timeline.isPlaying = !state.timeline.isPlaying;
      if (this.playBtn) {
        this.playBtn.textContent = state.timeline.isPlaying ? '❚❚' : '▶';
      }
      if (state.timeline.isPlaying) {
        state.timeline.followPaused = false;
        state.emit('followChange');
        this.startFallbackLoop();
      } else {
        this.stopFallbackLoop();
      }
    }
  },

  stopPlayback() {
    if (this.hasRealVideo && this.videoEl) {
      this.videoEl.pause();
      this.videoEl.currentTime = 0;
    } else {
      state.timeline.isPlaying = false;
      if (this.playBtn) this.playBtn.innerHTML = LucideIcons.play;
      this.stopFallbackLoop();
    }
    this.stopAudioTracks();
    vuMeter.stop();
    state.setPlayhead(0);
  },

  startFallbackLoop() {
    this.stopFallbackLoop();
    vuMeter.start();
    const intervalMs = 50;
    const stepSec = intervalMs / 1000;

    this.fallbackTimer = setInterval(() => {
      const total = getProjectDuration();
      if (total <= 0) {
        this.stopPlayback();
        return;
      }
      let next = state.timeline.playhead + stepSec;
      if (next >= total) {
        this.stopPlayback();
      } else {
        state.setPlayhead(next);
      }
    }, intervalMs);
  },

  stopFallbackLoop() {
    vuMeter.stop();
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  },

  attachEventListeners() {
    // Real HTML5 Video element events
    if (this.videoEl) {
      this.videoEl.addEventListener('play', () => {
        state.timeline.isPlaying = true;
        state.timeline.followPaused = false;
        state.emit('followChange');
        if (this.playBtn) this.playBtn.innerHTML = LucideIcons.pause;
        this.startAudioTracksPlayback();
        vuMeter.start();
      });

      this.videoEl.addEventListener('pause', () => {
        state.timeline.isPlaying = false;
        if (this.playBtn) this.playBtn.innerHTML = LucideIcons.play;
        this.pauseAudioTracks();
        vuMeter.stop();
      });

      this.videoEl.addEventListener('timeupdate', () => {
        const cur = this.videoEl.currentTime;
        state.setPlayhead(cur, true);
        this.alignAudioTracks(cur);
      });

      this.videoEl.addEventListener('ended', () => {
        this.stopPlayback();
      });

      this.videoEl.addEventListener('click', () => {
        this.togglePlay();
      });
    }

    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => this.togglePlay());
    }

    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopPlayback());
    }

    // Scrubber seek helper
    const seekToPosition = (clientX) => {
      if (!this.progressTrack) return;
      const total = getProjectDuration();
      if (total <= 0) return;
      const rect = this.progressTrack.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const seekTime = pct * total;
      state.setPlayhead(seekTime);
      if (this.hasRealVideo && this.videoEl) {
        this.videoEl.currentTime = seekTime;
      }
      if (this.bgmAudio && this.bgmAudio.src) {
        this.bgmAudio.currentTime = seekTime;
      }
      if (this.a1Audio && this.a1Audio.src) {
        this.a1Audio.currentTime = seekTime;
      }
    };

    // Scrubber click seek and dragging
    if (this.progressTrack) {
      this.progressTrack.addEventListener('mousedown', e => {
        if (e.button !== 0 || getProjectDuration() <= 0) return;
        this.isScrubbing = true;
        seekToPosition(e.clientX);
      });

      window.addEventListener('mousemove', e => {
        if (this.isScrubbing) {
          seekToPosition(e.clientX);
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.isScrubbing) {
          this.isScrubbing = false;
        }
      });

      // Hover tooltip
      this.progressTrack.addEventListener('mousemove', e => {
        if (!this.seekTooltip) return;
        const total = getProjectDuration();
        if (total <= 0) {
          this.seekTooltip.hidden = true;
          return;
        }
        const rect = this.progressTrack.getBoundingClientRect();
        const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const pct = hoverX / rect.width;
        const hoverTime = pct * total;

        this.seekTooltip.textContent = ui.formatTime(hoverTime);
        this.seekTooltip.style.left = `${hoverX}px`;
        this.seekTooltip.hidden = false;
      });

      this.progressTrack.addEventListener('mouseleave', () => {
        if (this.seekTooltip && !this.isScrubbing) {
          this.seekTooltip.hidden = true;
        }
      });

      // Keyboard arrow keys accessibility on seek bar
      this.progressTrack.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const total = getProjectDuration();
          if (total <= 0) return;
          const step = e.shiftKey ? 5 : 1;
          const current = state.timeline.playhead;
          const next = e.key === 'ArrowLeft' ? Math.max(0, current - step) : Math.min(total, current + step);
          state.setPlayhead(next);
          if (this.hasRealVideo && this.videoEl) {
            this.videoEl.currentTime = next;
          }
          if (this.bgmAudio && this.bgmAudio.src) {
            this.bgmAudio.currentTime = next;
          }
          if (this.a1Audio && this.a1Audio.src) {
            this.a1Audio.currentTime = next;
          }
        }
      });
    }

    // Volume slider & percentage label
    if (this.volumeSlider) {
      const volPercentLabel = document.getElementById('volPercentLabel');
      if (volPercentLabel) {
        volPercentLabel.textContent = `${this.volumeSlider.value}%`;
      }
      this.volumeSlider.addEventListener('input', () => {
        if (volPercentLabel) {
          volPercentLabel.textContent = `${this.volumeSlider.value}%`;
        }
        this.updateEffectiveVolume();
      });
      this.volumeSlider.addEventListener('dblclick', () => {
        this.volumeSlider.value = '100';
        if (volPercentLabel) volPercentLabel.textContent = '100%';
        this.updateEffectiveVolume();
      });
    }

    const playerVolIcon = document.getElementById('playerVolIcon');
    if (playerVolIcon && this.volumeSlider) {
      playerVolIcon.addEventListener('click', () => {
        if (+this.volumeSlider.value > 0) {
          this.volumeSlider.dataset.prevVal = this.volumeSlider.value;
          this.volumeSlider.value = '0';
        } else {
          this.volumeSlider.value = this.volumeSlider.dataset.prevVal || '60';
        }
        const volPercentLabel = document.getElementById('volPercentLabel');
        if (volPercentLabel) volPercentLabel.textContent = `${this.volumeSlider.value}%`;
        this.updateEffectiveVolume();
      });
    }
  },

  startAudioTracksPlayback() {
    this.updateEffectiveVolume();
    const curTime = (this.videoEl && !isNaN(this.videoEl.currentTime)) ? this.videoEl.currentTime : (state.timeline.playhead || 0);
    if (this.bgmAudio && this.bgmAudio.src) {
      if (Math.abs(this.bgmAudio.currentTime - curTime) > 0.15) {
        this.bgmAudio.currentTime = curTime;
      }
      this.bgmAudio.play().catch(() => {});
    }
    if (this.a1Audio && this.a1Audio.src) {
      if (Math.abs(this.a1Audio.currentTime - curTime) > 0.15) {
        this.a1Audio.currentTime = curTime;
      }
      this.a1Audio.play().catch(() => {});
    } else {
      this.syncDubClipPlayback(curTime);
    }
  },

  pauseAudioTracks() {
    if (this.bgmAudio) this.bgmAudio.pause();
    if (this.a1Audio) this.a1Audio.pause();
    if (this.dubClipAudio) this.dubClipAudio.pause();
  },

  stopAudioTracks() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
    if (this.a1Audio) {
      this.a1Audio.pause();
      this.a1Audio.currentTime = 0;
    }
    if (this.dubClipAudio) {
      this.dubClipAudio.pause();
      this.dubClipAudio.currentTime = 0;
      this.currentPlayingDubRowId = null;
    }
  },

  alignAudioTracks(curTime) {
    if (this.bgmAudio && this.bgmAudio.src && !this.bgmAudio.paused) {
      if (Math.abs(this.bgmAudio.currentTime - curTime) > 0.5) {
        this.bgmAudio.currentTime = curTime;
      }
    }
    if (this.a1Audio && this.a1Audio.src && !this.a1Audio.paused) {
      if (Math.abs(this.a1Audio.currentTime - curTime) > 0.5) {
        this.a1Audio.currentTime = curTime;
      }
    } else {
      this.syncDubClipPlayback(curTime);
    }
  },

  syncAudioTracks() {
    this.syncBgmTrack();
    this.syncA1Track();
    this.updateEffectiveVolume();
  },

  syncBgmTrack() {
    if (!this.bgmAudio) return;
    const bgmPath = state.project?.bgmPath;
    if (bgmPath) {
      let normalized = bgmPath.replace(/\\/g, '/');
      if (!normalized.startsWith('file://')) {
        normalized = 'file:///' + normalized.replace(/^([a-zA-Z]):/, '$1:');
      }
      if (this.bgmAudio.src !== normalized) {
        this.bgmAudio.src = normalized;
        this.bgmAudio.load();
        const curTime = (this.videoEl && !isNaN(this.videoEl.currentTime)) ? this.videoEl.currentTime : (state.timeline.playhead || 0);
        this.bgmAudio.currentTime = curTime;
      }
    } else {
      this.unloadBgmAudio();
    }
  },

  syncA1Track() {
    if (!this.a1Audio) return;
    const a1Path = state.project?.a1Path;
    if (a1Path) {
      let normalized = a1Path.replace(/\\/g, '/');
      if (!normalized.startsWith('file://')) {
        normalized = 'file:///' + normalized.replace(/^([a-zA-Z]):/, '$1:');
      }
      if (this.a1Audio.src !== normalized) {
        this.a1Audio.src = normalized;
        this.a1Audio.load();
        const curTime = (this.videoEl && !isNaN(this.videoEl.currentTime)) ? this.videoEl.currentTime : (state.timeline.playhead || 0);
        this.a1Audio.currentTime = curTime;
      }
    } else {
      this.unloadA1Audio();
    }
  },

  unloadBgmAudio() {
    if (!this.bgmAudio) return;
    this.bgmAudio.pause();
    this.bgmAudio.removeAttribute('src');
    try { this.bgmAudio.load(); } catch (_) {}
  },

  unloadA1Audio() {
    if (!this.a1Audio) return;
    this.a1Audio.pause();
    this.a1Audio.removeAttribute('src');
    try { this.a1Audio.load(); } catch (_) {}
  },

  syncDubClipPlayback(curTime) {
    if (!this.dubClipAudio) return;
    const isPlaying = Boolean(
      (this.videoEl && !this.videoEl.paused) ||
      state.timeline.isPlaying
    );

    if (!isPlaying) {
      if (!this.dubClipAudio.paused) {
        this.dubClipAudio.pause();
      }
      return;
    }

    // Find if a segment is currently speaking at this exact playhead time
    let activeDubRow = null;
    const len = state.rows.length;
    for (let i = 0; i < len; i++) {
      const r = state.rows[i];
      if (!r.ok || !r.audioPath) continue;
      const start = (typeof r.clipStart === 'number' && r.clipStart >= 0) ? r.clipStart : (Number(r.s) || 0);
      if (start > curTime + 2) {
        // Subtitles are chronologically ordered: stop scan early once past playhead
        break;
      }
      const dur = (typeof r.audioDuration === 'number' && r.audioDuration > 0)
        ? r.audioDuration
        : Math.max(0.2, (Number(r.e) || 0) - start);
      const end = (typeof r.clipEnd === 'number' && r.clipEnd > start) ? r.clipEnd : (start + dur);
      if (curTime >= start && curTime < end) {
        activeDubRow = r;
        break;
      }
    }

    if (activeDubRow) {
      const start = (typeof activeDubRow.clipStart === 'number' && activeDubRow.clipStart >= 0)
        ? activeDubRow.clipStart
        : (Number(activeDubRow.s) || 0);
      const offset = Math.max(0, curTime - start);

      let normalized = activeDubRow.audioPath.replace(/\\/g, '/');
      if (!normalized.startsWith('file://')) {
        normalized = 'file:///' + normalized.replace(/^([a-zA-Z]):/, '$1:');
      }

      if (this.currentPlayingDubRowId !== activeDubRow.id || this.dubClipAudio.src !== normalized) {
        this.currentPlayingDubRowId = activeDubRow.id;
        this.dubClipAudio.src = normalized;
        this.dubClipAudio.currentTime = offset;
        this.updateEffectiveVolume();
        this.dubClipAudio.play().catch(() => {});
      } else {
        if (this.isScrubbing || Math.abs(this.dubClipAudio.currentTime - offset) > 0.8) {
          this.dubClipAudio.currentTime = offset;
        }
        if (this.dubClipAudio.paused) {
          this.dubClipAudio.play().catch(() => {});
        }
      }

      // Live Ducking Preview
      if (state.timeline?.ducking !== false) {
        this.applyLiveDucking(true);
      }
    } else {
      if (!this.dubClipAudio.paused) {
        this.dubClipAudio.pause();
      }
      this.currentPlayingDubRowId = null;
      if (state.timeline?.ducking !== false) {
        this.applyLiveDucking(false);
      }
    }
  },

  applyLiveDucking(isDucking) {
    if (this.isCurrentlyDucking === isDucking) return;
    this.isCurrentlyDucking = isDucking;

    const duckBadge = document.getElementById('duckActiveBadge');
    if (duckBadge) {
      duckBadge.hidden = !isDucking;
    }

    const sliderVal = this.volumeSlider ? (+this.volumeSlider.value / 100) : 1;
    const timelineGain = (state.timeline && typeof state.timeline.vol === 'number') ? state.timeline.vol : 1;
    const masterVolume = Math.max(0, Math.min(1, sliderVal * timelineGain));

    const preset = (state.timeline?.duckingPreset || 'balanced').toLowerCase();
    const depthMultiplier = preset === 'gentle' ? 0.45 : (preset === 'deep' ? 0.12 : 0.25);
    const attackMs = preset === 'deep' ? 25 : (preset === 'gentle' ? 50 : 35);
    const releaseMs = preset === 'gentle' ? 600 : (preset === 'deep' ? 350 : 450);

    const rampDuration = isDucking ? attackMs : releaseMs;

    if (this.videoEl && !state.timeline?.muted) {
      const targetVidVol = isDucking ? (masterVolume * 0.15) : masterVolume;
      this.rampAudioVolume(this.videoEl, targetVidVol, rampDuration);
    }
    if (this.bgmAudio && !state.timeline?.bgmMuted) {
      const targetBgmVol = isDucking ? (masterVolume * depthMultiplier) : (masterVolume * 0.8);
      this.rampAudioVolume(this.bgmAudio, targetBgmVol, rampDuration);
    }
  },

  rampAudioVolume(audioEl, targetVol, durationMs) {
    if (!audioEl) return;
    const reqFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => clearTimeout(id);

    if (audioEl._rampTimer) {
      cancelFrame(audioEl._rampTimer);
      audioEl._rampTimer = null;
    }

    const startVol = audioEl.volume;
    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / Math.max(1, durationMs));
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const current = startVol + (targetVol - startVol) * eased;
      audioEl.volume = Math.max(0, Math.min(1, current));

      if (progress < 1) {
        audioEl._rampTimer = reqFrame(step);
      } else {
        audioEl.volume = targetVol;
        audioEl._rampTimer = null;
      }
    };

    audioEl._rampTimer = reqFrame(step);
  },

  syncMute(isMuted = Boolean(state.timeline?.muted)) {
    if (this.videoEl) {
      this.videoEl.muted = Boolean(isMuted);
    }
    this.updateEffectiveVolume();
  },

  updateEffectiveVolume() {
    const sliderVal = this.volumeSlider ? (+this.volumeSlider.value / 100) : 1;
    const timelineGain = (state.timeline && typeof state.timeline.vol === 'number') ? state.timeline.vol : 1;
    const masterVolume = Math.max(0, Math.min(1, sliderVal * timelineGain));

    // 1. Original Video Audio (Silenced completely when muted)
    if (this.videoEl) {
      const isOrigMuted = Boolean(state.timeline && state.timeline.muted);
      this.videoEl.muted = isOrigMuted;
      this.videoEl.volume = isOrigMuted ? 0 : masterVolume;
    }

    // 2. Isolated BGM Track
    if (this.bgmAudio) {
      const isBgmMuted = Boolean(state.timeline && state.timeline.bgmMuted);
      this.bgmAudio.muted = isBgmMuted;
      this.bgmAudio.volume = isBgmMuted ? 0 : Math.max(0, Math.min(1, masterVolume * 0.8));
    }

    // 3. Dub Audio Track (A1 & Segment Dub Audio)
    const isA1Muted = Boolean(state.timeline && state.timeline.a1Muted);
    const dubVolume = isA1Muted ? 0 : masterVolume;

    if (this.a1Audio) {
      this.a1Audio.muted = isA1Muted;
      this.a1Audio.volume = dubVolume;
    }
    if (this.dubClipAudio) {
      this.dubClipAudio.muted = isA1Muted;
      this.dubClipAudio.volume = dubVolume;
    }
  }
};
