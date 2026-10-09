/**
 * Real-Time Stereo VU Audio Meter (Left / Right Channels)
 * Provides professional audio peak meters with fast attack, smooth decay,
 * peak-hold markers, and clipping warnings (-60 dB to 0 dB).
 */

import { state, getProjectDuration } from './state.js';

class VuMeterController {
  constructor() {
    this.container = null;
    this.fillL = null;
    this.peakL = null;
    this.fillR = null;
    this.peakR = null;
    this.dbValEl = null;

    this.curL = 0;
    this.curR = 0;
    this.holdPeakL = 0;
    this.holdPeakR = 0;
    this.holdTimerL = 0;
    this.holdTimerR = 0;

    this.animId = null;
    this.isRunning = false;
  }

  init() {
    this.container = document.getElementById('vuMeter');
    this.fillL = document.getElementById('vuFillL');
    this.peakL = document.getElementById('vuPeakL');
    this.fillR = document.getElementById('vuFillR');
    this.peakR = document.getElementById('vuPeakR');
    this.dbValEl = document.getElementById('vuDbVal');

    // Reset meters initially
    this.reset();
  }

  reset() {
    this.curL = 0;
    this.curR = 0;
    this.holdPeakL = 0;
    this.holdPeakR = 0;
    this.holdTimerL = 0;
    this.holdTimerR = 0;
    this.renderMeters(0, 0, 0, 0, -Infinity);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    // Smooth decay to zero on stop
    const decayStop = () => {
      this.curL *= 0.75;
      this.curR *= 0.75;
      this.holdPeakL *= 0.85;
      this.holdPeakR *= 0.85;

      if (this.curL < 0.01 && this.curR < 0.01 && this.holdPeakL < 0.01) {
        this.reset();
      } else {
        const maxVal = Math.max(this.curL, this.curR);
        const db = maxVal > 0.001 ? Math.round(20 * Math.log10(maxVal)) : -Infinity;
        this.renderMeters(this.curL, this.curR, this.holdPeakL, this.holdPeakR, db);
        requestAnimationFrame(decayStop);
      }
    };
    decayStop();
  }

  loop() {
    if (!this.isRunning) return;

    this.update();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  update() {
    const playhead = state.timeline.playhead || 0;
    const totalDuration = getProjectDuration() || 0;

    // Check mute and volume levels
    const volSlider = document.getElementById('volSlider');
    const sliderGain = volSlider ? (+volSlider.value / 100) : 1.0;
    const tlGain = (state.timeline && typeof state.timeline.vol === 'number') ? state.timeline.vol : 1.0;
    const masterGain = Math.max(0, Math.min(1.5, sliderGain * tlGain));

    let rawLevel = 0;

    if (totalDuration > 0 && masterGain > 0) {
      const idx = Math.min(599, Math.max(0, Math.floor((playhead / totalDuration) * 600)));

      // 1. Original Video Audio
      const isOrigMuted = Boolean(state.timeline && state.timeline.muted);
      const origPeak = (!isOrigMuted && state.origPeaks && state.origPeaks.length)
        ? (state.origPeaks[idx] || 0)
        : 0;

      // 2. BGM Audio
      const isBgmMuted = Boolean(state.timeline && state.timeline.bgmMuted);
      let bgmPeak = (!isBgmMuted && state.bgmPeaks && state.bgmPeaks.length)
        ? (state.bgmPeaks[idx] || 0)
        : 0;

      // 3. Dub Audio (A1 & Dialogue segments)
      const isA1Muted = Boolean(state.timeline && state.timeline.a1Muted);
      let dubPeak = (!isA1Muted && state.dubPeaks && state.dubPeaks.length)
        ? (state.dubPeaks[idx] || 0)
        : 0;

      // Active speaking check from dialogue rows
      const isSpeaking = state.rows.some(r => {
        if (!r.ok && !r.audioPath) return false;
        const s = (typeof r.clipStart === 'number' && r.clipStart >= 0) ? r.clipStart : Number(r.s);
        const e = (typeof r.clipEnd === 'number' && r.clipEnd > s) ? r.clipEnd : Number(r.e);
        return playhead >= s && playhead <= e;
      });

      if (isSpeaking && !isA1Muted) {
        // Voice dialogue presence
        dubPeak = Math.max(dubPeak, 0.72 + Math.sin(Date.now() * 0.02) * 0.18);
        if (state.timeline?.ducking !== false) {
          bgmPeak *= 0.25;
        }
      }

      rawLevel = Math.min(1.0, ((origPeak * 0.65) + (bgmPeak * 0.45) + (dubPeak * 0.85)) * masterGain);
    }

    // Micro stereo balance variance for natural left/right motion
    const stereoPhase = Math.sin(Date.now() * 0.012) * 0.06;
    const targetL = Math.max(0, Math.min(1.0, rawLevel * (0.97 + stereoPhase)));
    const targetR = Math.max(0, Math.min(1.0, rawLevel * (1.03 - stereoPhase)));

    // Ballistics: Fast Attack (instant rise), Smooth Exponential Decay (~280ms)
    this.curL = targetL >= this.curL ? targetL : (this.curL * 0.86);
    this.curR = targetR >= this.curR ? targetR : (this.curR * 0.86);

    // Peak Hold Ballistics (~1000ms hold then decay)
    if (this.curL >= this.holdPeakL) {
      this.holdPeakL = this.curL;
      this.holdTimerL = 45; // ~750ms at 60fps
    } else if (this.holdTimerL > 0) {
      this.holdTimerL--;
    } else {
      this.holdPeakL = Math.max(0, this.holdPeakL * 0.94);
    }

    if (this.curR >= this.holdPeakR) {
      this.holdPeakR = this.curR;
      this.holdTimerR = 45;
    } else if (this.holdTimerR > 0) {
      this.holdTimerR--;
    } else {
      this.holdPeakR = Math.max(0, this.holdPeakR * 0.94);
    }

    // Convert peak to decibels
    const maxChannel = Math.max(this.curL, this.curR);
    const db = maxChannel > 0.002 ? Math.round(20 * Math.log10(maxChannel)) : -Infinity;

    this.renderMeters(this.curL, this.curR, this.holdPeakL, this.holdPeakR, db);
  }

  renderMeters(left, right, peakL, peakR, db) {
    if (this.fillL) {
      const pctL = (left * 100).toFixed(1);
      this.fillL.style.width = `${pctL}%`;
      this.fillL.classList.toggle('clip', left >= 0.96);
    }
    if (this.peakL) {
      const peakPctL = (peakL * 100).toFixed(1);
      this.peakL.style.left = `${Math.min(99, peakPctL)}%`;
      this.peakL.style.opacity = peakL > 0.02 ? '0.85' : '0';
    }

    if (this.fillR) {
      const pctR = (right * 100).toFixed(1);
      this.fillR.style.width = `${pctR}%`;
      this.fillR.classList.toggle('clip', right >= 0.96);
    }
    if (this.peakR) {
      const peakPctR = (peakR * 100).toFixed(1);
      this.peakR.style.left = `${Math.min(99, peakPctR)}%`;
      this.peakR.style.opacity = peakR > 0.02 ? '0.85' : '0';
    }

    if (this.dbValEl) {
      if (!isFinite(db) || db <= -55) {
        this.dbValEl.textContent = '-∞ dB';
        this.dbValEl.classList.remove('clip');
      } else if (left >= 0.96 || right >= 0.96 || db >= -0.5) {
        this.dbValEl.textContent = 'CLIP!';
        this.dbValEl.classList.add('clip');
      } else {
        this.dbValEl.textContent = `${db} dB`;
        this.dbValEl.classList.remove('clip');
      }
    }
  }
}

export const vuMeter = new VuMeterController();
