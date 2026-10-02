const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const ffmpegService = require('./ffmpeg');
const { migrateProject } = require('./project-migration');
const logger = require('../utils/logger');

class ProjectService {
  constructor() {
    this.userDataDir = null;
  }

  getUserDataDir() {
    if (!this.userDataDir) {
      this.userDataDir = app.getPath('userData');
    }
    return this.userDataDir;
  }

  getRecentProjectsFilePath() {
    return path.join(this.getUserDataDir(), 'recent-projects.json');
  }

  getRecentProjects(onlyExisting = true) {
    try {
      const file = this.getRecentProjectsFilePath();
      if (fs.existsSync(file)) {
        let list = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(list)) list = [];

        // One-time cleanup: detect and discard persisted demo project
        const demoPattern = new RegExp(['E', '02|', '\\u1797\\u17b6\\u1782\\u1791\\u17b8\\u17e2|', 'Story', '\\s+Dubbing'].join(''), 'i');
        const hasDemo = list.some(p =>
          p.isDemo === true ||
          demoPattern.test(`${p.name || ''} ${p.projectDir || ''}`)
        );
        if (hasDemo) {
          list = list.filter(p =>
            p.isDemo !== true &&
            !demoPattern.test(`${p.name || ''} ${p.projectDir || ''}`)
          );
          try {
            fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
            logger.info('Cleaned demo project from recent projects list.');
          } catch (_) {}
        }

        // Check real existence on disk for each entry
        const enriched = list.map(p => {
          const dirExists = Boolean(p.projectDir && fs.existsSync(p.projectDir));
          const jsonExists = Boolean(p.projectJsonPath && fs.existsSync(p.projectJsonPath));
          return {
            ...p,
            exists: dirExists && jsonExists
          };
        });

        if (onlyExisting) {
          return enriched.filter(p => p.exists);
        }
        return enriched;
      }
    } catch (err) {
      logger.error('Failed to read recent projects', err);
    }
    return [];
  }

  removeRecentProject(projectDir) {
    try {
      const file = this.getRecentProjectsFilePath();
      if (!fs.existsSync(file)) return [];
      let list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) list = [];

      const norm = p => (p || '').replace(/\\/g, '/').toLowerCase();
      const target = norm(projectDir);
      list = list.filter(p => norm(p.projectDir) !== target && norm(p.projectJsonPath) !== target);

      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
      return this.getRecentProjects(true);
    } catch (err) {
      logger.error('Failed to remove recent project entry', err);
      return [];
    }
  }

  saveRecentProject(info) {
    try {
      let list = this.getRecentProjects();
      list = list.filter(p => p.projectDir !== info.projectDir);
      list.unshift({
        name: info.name,
        projectDir: info.projectDir,
        projectJsonPath: info.projectJsonPath,
        videoPath: info.videoPath,
        updatedAt: new Date().toISOString()
      });
      if (list.length > 10) list = list.slice(0, 10);

      fs.writeFileSync(this.getRecentProjectsFilePath(), JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      logger.error('Failed to save recent project entry', err);
    }
  }

  /**
   * Helper to sanitize folder name for cross-platform filesystem safety
   */
  sanitizeFolderName(name) {
    return (name || 'project')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/[. ]+$/, '')
      .trim() || 'project';
  }

  /**
   * Helper to check if a directory is writable
   */
  isDirectoryWritable(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') return false;
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.accessSync(dirPath, fs.constants.W_OK);
      const testFile = path.join(dirPath, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Create a new project workspace from a video file
   */
  async createProjectFromVideo(videoFilePath, customProjectDir = null) {
    logger.info(`Creating project from video: ${videoFilePath}`);
    if (!fs.existsSync(videoFilePath)) {
      throw new Error(`Video file does not exist: ${videoFilePath}`);
    }

    const videoName = path.basename(videoFilePath, path.extname(videoFilePath));
    let projectDir = customProjectDir;
    if (!projectDir) {
      let defaultFolder = '';
      try {
        const settingsService = require('./settings');
        defaultFolder = settingsService.get()?.general?.defaultProjectFolder || '';
      } catch (_) {}

      let parentDir;
      if (defaultFolder && this.isDirectoryWritable(defaultFolder)) {
        parentDir = defaultFolder;
      } else {
        parentDir = path.dirname(videoFilePath);
      }

      const safeName = this.sanitizeFolderName(videoName);

      let candidateDir = path.join(parentDir, `${safeName}_project`);
      if (fs.existsSync(candidateDir)) {
        let suffix = 1;
        while (fs.existsSync(path.join(parentDir, `${safeName}_project_${suffix}`))) {
          suffix++;
        }
        candidateDir = path.join(parentDir, `${safeName}_project_${suffix}`);
      }
      projectDir = candidateDir;
    }

    // Create project directories
    const mediaDir = path.join(projectDir, 'media');
    const thumbDir = path.join(mediaDir, 'thumbnails');
    const ttsCacheDir = path.join(projectDir, 'tts-cache');
    const exportsDir = path.join(projectDir, 'exports');

    fs.mkdirSync(mediaDir, { recursive: true });
    fs.mkdirSync(thumbDir, { recursive: true });
    fs.mkdirSync(ttsCacheDir, { recursive: true });
    fs.mkdirSync(exportsDir, { recursive: true });

    // 1. Probe video with ffprobe
    const meta = await ffmpegService.probeMedia(videoFilePath);
    logger.info('Video metadata probed successfully', { duration: meta.duration, video: meta.video });

    // 2. Extract audio tracks
    const origAudioPath = path.join(mediaDir, 'orig.wav');
    const orig16kPath = path.join(mediaDir, 'audio_16k.wav');
    const peaksPath = path.join(mediaDir, 'orig_peaks.json');

    if (meta.hasAudio) {
      logger.info('Extracting original stereo audio and 16k mono audio...');
      await ffmpegService.extractAudio(videoFilePath, origAudioPath);
      await ffmpegService.extractAudio16kMono(videoFilePath, orig16kPath);
    }

    // 3. Generate waveform peaks
    logger.info('Generating waveform peaks...');
    const peaks = await ffmpegService.generateWaveformPeaks(
      meta.hasAudio ? origAudioPath : videoFilePath,
      600
    );
    fs.writeFileSync(peaksPath, JSON.stringify(peaks), 'utf8');

    // 4. Generate video thumbnails filmstrip
    let thumbnails = [];
    if (meta.hasVideo) {
      logger.info('Generating video thumbnails filmstrip...');
      thumbnails = await ffmpegService.generateThumbnails(videoFilePath, thumbDir, 12, 160);
    }

    // 5. Build initial project.json
    const projectData = {
      schemaVersion: 1,
      id: `proj_${Date.now()}`,
      name: videoName,
      videoFilePath,
      duration: meta.duration,
      meta,
      media: {
        origAudio: path.relative(projectDir, origAudioPath),
        orig16k: path.relative(projectDir, orig16kPath),
        peaks: path.relative(projectDir, peaksPath),
        thumbnails: thumbnails.map(t => ({
          time: t.time,
          relPath: path.relative(projectDir, t.path)
        }))
      },
      subtitles: [],
      cast: [],
      settings: {
        targetLanguage: 'Khmer',
        asrEngine: 'faster-whisper',
        whisperModel: 'small',
        whisperDevice: 'auto'
      },
      timeline: {
        zoom: 100,
        autofit: 'Med',
        crowd: false,
        syncEnd: true,
        ducking: true,
        muted: true
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const projectJsonPath = path.join(projectDir, 'project.json');
    fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2), 'utf8');

    this.saveRecentProject({
      name: videoName,
      projectDir,
      projectJsonPath,
      videoPath: videoFilePath
    });

    logger.info(`Project created successfully at: ${projectDir}`);

    return {
      projectDir,
      projectJsonPath,
      project: projectData,
      peaks,
      thumbnails
    };
  }

  /**
   * Save project state to project.json atomically with .bak backup
   */
  async saveProject(projectJsonPath, data) {
    try {
      const projectDir = path.dirname(projectJsonPath);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      data.updatedAt = new Date().toISOString();
      const content = JSON.stringify(data, null, 2);
      const tempPath = `${projectJsonPath}.tmp`;
      const bakPath = `${projectJsonPath}.bak`;

      // 1. Write to temp file
      fs.writeFileSync(tempPath, content, 'utf8');

      // 2. Backup existing project.json if present
      if (fs.existsSync(projectJsonPath)) {
        try {
          fs.copyFileSync(projectJsonPath, bakPath);
        } catch (copyErr) {
          logger.warn(`Failed to create project backup: ${copyErr.message}`);
        }
      }

      // 3. Atomically rename temp -> projectJsonPath
      fs.renameSync(tempPath, projectJsonPath);

      this.saveRecentProject({
        name: data.name || path.basename(projectDir),
        projectDir,
        projectJsonPath,
        videoPath: data.videoFilePath
      });

      logger.info(`Project saved: ${projectJsonPath}`);
      return { success: true, savedAt: data.updatedAt };
    } catch (err) {
      logger.error('Failed to save project', err);
      throw err;
    }
  }

  /**
   * Autosave project backup atomically with .bak
   */
  async autosaveProject(projectJsonPath, data) {
    try {
      const projectDir = path.dirname(projectJsonPath);
      const autosavePath = path.join(projectDir, 'project.autosave.json');
      const tempPath = `${autosavePath}.tmp`;
      const bakPath = `${autosavePath}.bak`;

      data.autosavedAt = new Date().toISOString();
      const content = JSON.stringify(data, null, 2);

      fs.writeFileSync(tempPath, content, 'utf8');
      if (fs.existsSync(autosavePath)) {
        try {
          fs.copyFileSync(autosavePath, bakPath);
        } catch (_) {}
      }
      fs.renameSync(tempPath, autosavePath);

      return { success: true, autosavedAt: data.autosavedAt };
    } catch (err) {
      logger.warn('Failed to autosave project', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Load existing project with .bak and autosave recovery
   */
  async loadProject(projectJsonPath) {
    logger.info(`Loading project from: ${projectJsonPath}`);
    const projectDir = path.dirname(projectJsonPath);
    let content = null;

    if (fs.existsSync(projectJsonPath)) {
      try {
        content = fs.readFileSync(projectJsonPath, 'utf8');
      } catch (readErr) {
        logger.warn(`Failed to read project.json: ${readErr.message}`);
      }
    }

    if (!content) {
      const bakPath = `${projectJsonPath}.bak`;
      const autosavePath = path.join(projectDir, 'project.autosave.json');
      if (fs.existsSync(bakPath)) {
        logger.info('Recovering project from .bak file');
        content = fs.readFileSync(bakPath, 'utf8');
      } else if (fs.existsSync(autosavePath)) {
        logger.info('Recovering project from autosave file');
        content = fs.readFileSync(autosavePath, 'utf8');
      } else {
        throw new Error(`Project file not found: ${projectJsonPath}`);
      }
    }

    let project;
    try {
      project = JSON.parse(content);
    } catch (parseErr) {
      const bakPath = `${projectJsonPath}.bak`;
      if (fs.existsSync(bakPath)) {
        logger.info('JSON parse failed on project.json, recovering from .bak');
        project = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
      } else {
        throw parseErr;
      }
    }

    // Schema migration check and normalization
    const migrationResult = migrateProject(project);
    project = migrationResult.project;
    if (migrationResult.migrated) {
      logger.info(`Migrated project schema from v${migrationResult.fromVersion} to v${migrationResult.toVersion}`);
    }

    // Load peaks if available
    let peaks = [];
    if (project.media?.peaks) {
      const fullPeaksPath = path.join(projectDir, project.media.peaks);
      if (fs.existsSync(fullPeaksPath)) {
        peaks = JSON.parse(fs.readFileSync(fullPeaksPath, 'utf8'));
      }
    }

    // Load thumbnail paths
    let thumbnails = [];
    if (project.media?.thumbnails) {
      thumbnails = project.media.thumbnails.map(t => ({
        time: t.time,
        fullPath: path.join(projectDir, t.relPath)
      }));
    }

    this.saveRecentProject({
      name: project.name || path.basename(projectDir),
      projectDir,
      projectJsonPath,
      videoPath: project.videoFilePath
    });

    return {
      projectDir,
      projectJsonPath,
      project,
      peaks,
      thumbnails
    };
  }
}

const projectService = new ProjectService();
module.exports = projectService;
