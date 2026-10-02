/**
 * Player Module: HTML5 Video Preview, Caption Overlay, Play/Pause/Stop, Volume & Scrubbing
 */

import { state, getProjectDuration } from './state.js';
import { ui } from './ui.js';
import { i18n } from './i18n.js';
import { LucideIcons } from './icons.js';

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
  fallbackTimer: null,
  hasRealVideo: false,
  isScrubbing: false,

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
      } catch (_) {}
    }

    this.attachEventListeners();

    state.on('change', () => {
      this.syncAudioTracks();
      this.updateCaption();
      this.updateControlsState();
    });
    state.on('selectionChange', () => this.updateCaption());
    state.on('projectLoaded', () => {
      this.onProjectLoaded();
      this.syncAudioTracks();
      this.updateControlsState();
    });
    state.on('languageChange', () => this.updateControlsState());
    state.on('playheadChange', ({ time, isSourceVideo }) => {
      this.updateTimeDisplay(time);
      if (!isSourceVideo && this.hasRealVideo && this.videoEl) {
        if (Math.abs(this.videoEl.currentTime - time) > 0.3) {
          this.videoEl.currentTime = time;
        }
      }
      if (!isSourceVideo) {
        if (this.bgmAudio && this.bgmAudio.src) {
          if (Math.abs(this.bgmAudio.currentTime - time) > 0.3) {
            this.bgmAudio.currentTime = time;
          }
        }
        if (this.a1Audio && this.a1Audio.src) {
          if (Math.abs(this.a1Audio.currentTime - time) > 0.3) {
            this.a1Audio.currentTime = time;
          }
        }
      }
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
    this.container?.classList.remove('has-video');
    this.hasRealVideo = false;
    this.updateTimeDisplay(0);
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
      };

      console.log('Video loaded in preview player:', normalized);
    } catch (err) {
      console.error('Failed to load video in player:', err);
    }
  },

  updateCaption() {
    if (!this.captionEl) return;
    const curTime = state.timeline.playhead;

    // Find if a segment is currently speaking at this exact playhead time
    const activeSegment = state.rows.find(r => r.s <= curTime && curTime <= r.e);

    if (activeSegment) {
      this.captionEl.style.display = '';
      this.captionEl.textContent = activeSegment.t;
      this.captionEl.style.opacity = '1';
    } else if (state.timeline.isPlaying) {
      // During active playback with no speech, fade out caption box
      this.captionEl.style.opacity = '0';
    } else {
      // When paused, show selected segment text
      const selected = state.getCur();
      if (selected && selected.t) {
        this.captionEl.style.display = '';
        this.captionEl.textContent = selected.t;
        this.captionEl.style.opacity = '1';
      } else if (state.rows.length > 0) {
        this.captionEl.style.display = '';
        this.captionEl.textContent = i18n.t('subtitlePreview') || 'Subtitle Preview';
        this.captionEl.style.opacity = '0.5';
      } else {
        this.captionEl.style.display = 'none';
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
    state.setPlayhead(0);
  },

  startFallbackLoop() {
    this.stopFallbackLoop();
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
      });

      this.videoEl.addEventListener('pause', () => {
        state.timeline.isPlaying = false;
        if (this.playBtn) this.playBtn.innerHTML = LucideIcons.play;
        this.pauseAudioTracks();
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

    // Volume slider
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', () => {
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
    }
  },

  pauseAudioTracks() {
    if (this.bgmAudio) this.bgmAudio.pause();
    if (this.a1Audio) this.a1Audio.pause();
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
  },

  alignAudioTracks(curTime) {
    if (this.bgmAudio && this.bgmAudio.src && !this.bgmAudio.paused) {
      if (Math.abs(this.bgmAudio.currentTime - curTime) > 0.25) {
        this.bgmAudio.currentTime = curTime;
      }
    }
    if (this.a1Audio && this.a1Audio.src && !this.a1Audio.paused) {
      if (Math.abs(this.a1Audio.currentTime - curTime) > 0.25) {
        this.a1Audio.currentTime = curTime;
      }
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

    // 3. Dub Audio Track (A1)
    if (this.a1Audio) {
      const isA1Muted = Boolean(state.timeline && state.timeline.a1Muted);
      this.a1Audio.muted = isA1Muted;
      this.a1Audio.volume = isA1Muted ? 0 : masterVolume;
    }
  }
};
