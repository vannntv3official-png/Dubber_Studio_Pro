/**
 * Audio Mixer Engine
 * Handles multi-track audio assembly, adelay timeline positioning,
 * amix track combining, BGM ducking (sidechaincompress),
 * original audio attenuation/muting, and global DSP effects (Volume, Pitch, Reverb, Crowd).
 */

const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../ffmpeg');
const logger = require('../../utils/logger');

const DUCKING_PROFILES = {
  gentle: { threshold: 0.12, ratio: 3.0, attack: 45, release: 600, depthDb: -7, liveDepth: 0.45, label: 'Gentle (-7dB)' },
  balanced: { threshold: 0.08, ratio: 4.0, attack: 40, release: 450, depthDb: -12, liveDepth: 0.25, label: 'Balanced (-12dB)' },
  deep: { threshold: 0.05, ratio: 7.0, attack: 25, release: 350, depthDb: -18, liveDepth: 0.12, label: 'Voice Focus (-18dB)' }
};

class AudioMixer {
  constructor() {
    this.ffmpegPath = ffmpegService.ffmpegPath;
    this.DUCKING_PROFILES = DUCKING_PROFILES;
    this.activeProcesses = new Set();
  }

  cancel() {
    for (const proc of this.activeProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch (_) {}
    }
    this.activeProcesses.clear();
  }

  /**
   * Builds the assembled dubbing vocal track from all individual segment audio clips.
   * Uses FFmpeg adelay to place each clip at its exact start timestamp, then amix to merge.
   *
   * @param {Array<object>} segments - Subtitle rows with { audioPath, s, clipStart, ok }
   * @param {string} outputPath - Target WAV/AAC file
   * @param {number} [totalDuration=10] - Total timeline duration in seconds
   * @returns {Promise<string>} outputPath
   */
  async buildDubTrack(segments, outputPath, totalDuration = 10, projectDir = null) {
    const activeClips = (segments || []).map(s => {
      if (!s || !s.ok || !s.audioPath) return null;
      let p = s.audioPath;
      if (!fs.existsSync(p) && projectDir) {
        const resolved = path.resolve(projectDir, p);
        if (fs.existsSync(resolved)) p = resolved;
      }
      if (!fs.existsSync(p)) return null;
      return { ...s, audioPath: p };
    }).filter(Boolean);

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    if (activeClips.length === 0) {
      // Generate silent audio matching totalDuration
      logger.info('No active dub clips found; generating silent audio track');
      const dur = Math.max(1, Number(totalDuration) || 10);
      const args = [
        '-y',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', dur.toFixed(2),
        '-c:a', 'pcm_s16le',
        outputPath
      ];
      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      return new Promise((resolve, reject) => {
        execFile(this.ffmpegPath, finalArgs, err => {
          if (err) return reject(err);
          resolve(outputPath);
        });
      });
    }

    // Windows Command Line Length Guard:
    // When activeClips > 40, partition into sub-mixes to prevent exceeding Windows 8k/32k cmd limits
    const BATCH_SIZE = 40;
    if (activeClips.length > BATCH_SIZE) {
      logger.info(`Large project detected (${activeClips.length} clips): partitioning into chunks of ${BATCH_SIZE} for safe Windows command execution...`);
      const tempSubTracks = [];
      const numBatches = Math.ceil(activeClips.length / BATCH_SIZE);

      try {
        for (let b = 0; b < numBatches; b++) {
          const batchClips = activeClips.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
          const subTrackPath = path.join(outDir, `_temp_subdub_${b}_${Date.now()}.wav`);
          tempSubTracks.push(subTrackPath);
          await this._renderDubBatch(batchClips, subTrackPath, totalDuration);
        }

        // Merge all sub-tracks into final outputPath
        await this._mergeSubTracks(tempSubTracks, outputPath, totalDuration);
        return outputPath;
      } finally {
        for (const st of tempSubTracks) {
          if (fs.existsSync(st)) {
            try { fs.unlinkSync(st); } catch (_) {}
          }
        }
      }
    }

    return this._renderDubBatch(activeClips, outputPath, totalDuration);
  }

  _renderDubBatch(activeClips, outputPath, totalDuration) {
    return new Promise((resolve, reject) => {
      const args = ['-y'];
      activeClips.forEach(c => {
        args.push('-i', c.audioPath);
      });

      // Build filter graph
      const filterParts = [];
      const mixInputs = [];

      const dur = Math.max(0.1, Number(totalDuration) || 10);
      activeClips.forEach((c, i) => {
        const rawStart = (typeof c.clipStart === 'number' && c.clipStart >= 0)
          ? c.clipStart
          : (Number(c.s) || 0);
        const startSec = Math.max(0, rawStart);
        const delayMs = Math.round(startSec * 1000);
        filterParts.push(`[${i}:a]afade=t=in:ss=0:d=0.005,adelay=${delayMs}|${delayMs}[d${i}]`);
        mixInputs.push(`[d${i}]`);
      });

      if (activeClips.length === 1) {
        filterParts.push(`${mixInputs[0]}aresample=44100,apad=whole_dur=${dur.toFixed(3)}[aout]`);
      } else {
        filterParts.push(`${mixInputs.join('')}amix=inputs=${activeClips.length}:duration=longest:dropout_transition=0:normalize=0,aresample=44100,apad=whole_dur=${dur.toFixed(3)}[aout]`);
      }

      args.push(
        '-filter_complex', filterParts.join(';'),
        '-map', '[aout]',
        '-t', dur.toFixed(3),
        '-c:a', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        outputPath
      );

      logger.info(`Assembling dub batch with ${activeClips.length} clips into: ${outputPath}`);
      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      const childProc = execFile(this.ffmpegPath, finalArgs, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
        this.activeProcesses.delete(childProc);
        if (err) {
          logger.error('Failed to assemble dub batch', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
      if (childProc) this.activeProcesses.add(childProc);
    });
  }

  _mergeSubTracks(subTrackPaths, outputPath, totalDuration) {
    return new Promise((resolve, reject) => {
      if (subTrackPaths.length === 1) {
        try {
          fs.copyFileSync(subTrackPaths[0], outputPath);
          return resolve(outputPath);
        } catch (copyErr) {
          return reject(copyErr);
        }
      }

      const args = ['-y'];
      subTrackPaths.forEach(p => {
        args.push('-i', p);
      });

      const dur = Math.max(0.1, Number(totalDuration) || 10);
      const inputs = subTrackPaths.map((_, i) => `[${i}:a]`).join('');
      const filterComplex = `${inputs}amix=inputs=${subTrackPaths.length}:duration=longest:dropout_transition=0:normalize=0,aresample=44100,apad=whole_dur=${dur.toFixed(3)}[aout]`;

      args.push(
        '-filter_complex', filterComplex,
        '-map', '[aout]',
        '-t', dur.toFixed(3),
        '-c:a', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        outputPath
      );

      logger.info(`Merging ${subTrackPaths.length} dub sub-tracks into: ${outputPath}`);
      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      const childProc = execFile(this.ffmpegPath, finalArgs, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
        this.activeProcesses.delete(childProc);
        if (err) {
          logger.error('Failed to merge sub-tracks', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
      if (childProc) this.activeProcesses.add(childProc);
    });
  }

  /**
   * Mixes Dub dialogue, Original audio, and BGM with Ducking and DSP effects into final master audio.
   *
   * @param {object} params
   * @param {string} params.dubAudioPath - Assembled dub vocals WAV
   * @param {string} [params.originalAudioPath=null] - Extracted original audio WAV
   * @param {string} [params.bgmAudioPath=null] - BGM track
   * @param {string} params.outputPath - Output mixed audio file
   * @param {object} [params.options={}] - Mix options
   * @param {boolean} [params.options.muteOriginal=true] - Mute original dialogue
   * @param {number} [params.options.origAttenuation=0.1] - Volume if not muted
   * @param {boolean} [params.options.ducking=true] - Enable sidechain ducking
   * @param {number} [params.options.volume=1.0] - Master volume
   * @param {number} [params.options.pitch=0] - Master pitch shift in semitones (-12 to +12)
   * @param {boolean} [params.options.reverb=false] - Master reverb
   * @param {boolean} [params.options.crowd=false] - Crowd ambience
   * @param {number} [params.totalDuration=10] - Duration limit in seconds
   * @returns {Promise<string>} outputPath
   */
  buildFinalMasterAudio({
    dubAudioPath,
    originalAudioPath = null,
    bgmAudioPath = null,
    outputPath,
    options = {},
    totalDuration = 10
  }) {
    return new Promise((resolve, reject) => {
      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const durLimit = Math.max(0.1, Number(totalDuration) || 10);
      const args = ['-y'];
      let inputCount = 0;

      // Input 0: Dub Track (required)
      const hasDub = dubAudioPath && fs.existsSync(dubAudioPath);
      if (hasDub) {
        args.push('-i', dubAudioPath);
      } else {
        // Fallback silence matching totalDuration
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', durLimit.toFixed(3));
      }
      const dubIdx = inputCount++;

      // Input 1: Original Audio (optional)
      const hasOrig = Boolean(originalAudioPath && fs.existsSync(originalAudioPath) && !options.muteOriginal);
      let origIdx = -1;
      if (hasOrig) {
        args.push('-i', originalAudioPath);
        origIdx = inputCount++;
      }

      // Input 2: BGM Track (optional)
      const hasBgm = Boolean(bgmAudioPath && fs.existsSync(bgmAudioPath));
      let bgmIdx = -1;
      if (hasBgm) {
        // Loop BGM if shorter than video
        args.push('-stream_loop', '-1', '-i', bgmAudioPath);
        bgmIdx = inputCount++;
      }

      // Build Filter Complex
      const filterParts = [];
      const masterMixInputs = [];

      // 1. Process Dub Vocals
      const duckingEnabled = Boolean(hasBgm && hasDub && (options.ducking !== false));
      const dubVol = Math.max(0.1, Math.min(3.0, Number(options.dubVolume) || Number(options.volume) || 1.0));
      const dubVolFilter = Math.abs(dubVol - 1.0) > 0.05 ? `,volume=${dubVol.toFixed(2)}` : '';

      if (duckingEnabled) {
        filterParts.push(`[${dubIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo${dubVolFilter},asplit=2[dub_clean][dub_trigger]`);
      } else {
        filterParts.push(`[${dubIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo${dubVolFilter}[dub_clean]`);
      }
      masterMixInputs.push('[dub_clean]');

      // 2. Process BGM Track (with sidechain ducking under dub speech)
      if (hasBgm) {
        const bgmVol = Math.max(0.01, Math.min(2.0, Number(options.bgmVolume) || 0.35));
        if (duckingEnabled) {
          const presetKey = (options.duckingPreset || 'balanced').toLowerCase();
          const profile = DUCKING_PROFILES[presetKey] || DUCKING_PROFILES.balanced;
          const duckThreshold = typeof options.duckingThreshold === 'number' ? options.duckingThreshold : profile.threshold;
          const duckRatio = typeof options.duckingRatio === 'number' ? options.duckingRatio : profile.ratio;
          const duckAttack = typeof options.duckingAttack === 'number' ? options.duckingAttack : profile.attack;
          const duckRelease = typeof options.duckingRelease === 'number' ? options.duckingRelease : profile.release;

          // sidechaincompress: lowers BGM volume when dub speech is present with envelope shaping
          filterParts.push(
            `[${bgmIdx}:a]volume=${bgmVol.toFixed(2)},aformat=sample_rates=44100:channel_layouts=stereo[bgm_level]`,
            `[bgm_level][dub_trigger]sidechaincompress=threshold=${duckThreshold}:ratio=${duckRatio}:attack=${duckAttack}:release=${duckRelease}[ducked_bgm]`
          );
          masterMixInputs.push('[ducked_bgm]');
        } else {
          filterParts.push(`[${bgmIdx}:a]volume=${bgmVol.toFixed(2)},aformat=sample_rates=44100:channel_layouts=stereo[bgm_out]`);
          masterMixInputs.push('[bgm_out]');
        }
      }

      // 3. Process Original Audio (attenuated or full)
      if (hasOrig) {
        const att = Math.max(0.01, Math.min(1.0, options.origAttenuation || 0.15));
        filterParts.push(`[${origIdx}:a]volume=${att.toFixed(2)},aformat=sample_rates=44100:channel_layouts=stereo[orig_att]`);
        masterMixInputs.push('[orig_att]');
      }

      // 4. Mix all active streams
      if (masterMixInputs.length === 1) {
        filterParts.push(`${masterMixInputs[0]}aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${durLimit.toFixed(3)}[mixed]`);
      } else {
        filterParts.push(
          `${masterMixInputs.join('')}amix=inputs=${masterMixInputs.length}:duration=first:dropout_transition=0:normalize=0,apad=whole_dur=${durLimit.toFixed(3)}[mixed]`
        );
      }

      // 5. Apply Global DSP Effects (Volume, Pitch, Reverb, Crowd)
      let currentOutput = '[mixed]';

      // Global Volume
      const vol = Math.max(0.1, Math.min(3.0, Number(options.volume) || 1.0));
      if (Math.abs(vol - 1.0) > 0.05) {
        filterParts.push(`${currentOutput}volume=${vol.toFixed(2)}[v_vol]`);
        currentOutput = '[v_vol]';
      }

      // Global Reverb (Enhanced with Acoustic Presets & Parameter Controls)
      if (options.reverb) {
        const preset = options.reverbPreset || 'hall';
        const mix = Math.max(0.05, Math.min(0.80, (Number(options.reverbMix) || 35) / 100));
        const decay = Math.max(15, Math.min(180, Number(options.reverbDecay) || 60));

        let echoFilter;
        if (preset === 'room') {
          // Warm intimate room: short delay, gentle reflection
          echoFilter = `aecho=0.88:0.75:${decay}:0.28`;
        } else if (preset === 'cathedral') {
          // Vast atmospheric space: multi-tap rich cathedral reflections
          const d1 = decay;
          const d2 = Math.round(decay * 1.5);
          echoFilter = `aecho=0.8:0.85:${d1}|${d2}:${mix.toFixed(2)}|${(mix * 0.7).toFixed(2)}`;
        } else if (preset === 'plate') {
          // Crisp bright metallic vocal plate reverb: fast reflection, bright feedback
          const d1 = Math.max(20, Math.round(decay * 0.7));
          const d2 = Math.max(35, Math.round(decay * 1.2));
          echoFilter = `aecho=0.82:0.9:${d1}|${d2}:${mix.toFixed(2)}|${(mix * 0.55).toFixed(2)}`;
        } else {
          // Concert Hall (default): spacious natural decay
          echoFilter = `aecho=0.8:0.85:${decay}:${mix.toFixed(2)}`;
        }

        filterParts.push(`${currentOutput}${echoFilter}[v_rev]`);
        currentOutput = '[v_rev]';
      }

      // Global Pitch shift (semitones -12 to +12) with tempo compensation to maintain sync
      const pitchSemitones = Number(options.pitch) || 0;
      if (pitchSemitones !== 0) {
        const factor = Math.pow(2, pitchSemitones / 12);
        const newRate = Math.round(44100 * factor);
        const tempoCompensation = Math.max(0.5, Math.min(2.0, 1 / factor)).toFixed(4);
        filterParts.push(`${currentOutput}asetrate=${newRate},atempo=${tempoCompensation},aresample=44100[v_pitch]`);
        currentOutput = '[v_pitch]';
      }

      // Crowd ambience layer (subtle ambient presence)
      if (options.crowd) {
        filterParts.push(`${currentOutput}chorus=0.5:0.9:50|60:0.4|0.32:0.25|0.4:2|1.2[v_crowd]`);
        currentOutput = '[v_crowd]';
      }

      args.push(
        '-filter_complex', filterParts.join(';'),
        '-map', currentOutput,
        '-t', durLimit.toFixed(3),
        '-c:a', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        outputPath
      );

      logger.info(`Rendering final master audio mix with ${masterMixInputs.length} tracks to: ${outputPath}`);
      const finalArgs = ffmpegService.buildFfmpegArgs(args);
      const childProc = execFile(this.ffmpegPath, finalArgs, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
        this.activeProcesses.delete(childProc);
        if (err) {
          logger.error('Master audio mix failed', { error: err.message, stderr });
          return reject(err);
        }
        resolve(outputPath);
      });
      if (childProc) this.activeProcesses.add(childProc);
    });
  }
}

const audioMixer = new AudioMixer();
module.exports = audioMixer;
