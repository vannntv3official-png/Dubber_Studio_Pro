const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const projectService = require('../services/project');
const logger = require('../utils/logger');

function registerProjectIpc(mainWindow) {
  ipcMain.handle('project:open-dialog', async (_event, type = 'all') => {
    try {
      const filters = [];
      if (type === 'image') {
        filters.push(
          { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'] },
          { name: 'All Files', extensions: ['*'] }
        );
      } else if (type === 'video') {
        filters.push({ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] });
      } else if (type === 'project') {
        filters.push({ name: 'Project Files', extensions: ['json'] });
      } else {
        filters.push(
          { name: 'Supported Media & Projects', extensions: ['mp4', 'mov', 'mkv', 'webm', 'json', 'wav', 'mp3'] },
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm'] },
          { name: 'Project Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        );
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open File',
        properties: ['openFile'],
        filters
      });
      return result;
    } catch (err) {
      logger.error('Failed to show open dialog', err);
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('project:save-dialog', async (_event, defaultName = 'project.json') => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Project',
        defaultPath: defaultName,
        filters: [{ name: 'Project File (*.json)', extensions: ['json'] }]
      });
      return result;
    } catch (err) {
      logger.error('Failed to show save dialog', err);
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('project:create-from-video', async (_event, videoPath, customDir = null) => {
    try {
      return await projectService.createProjectFromVideo(videoPath, customDir);
    } catch (err) {
      logger.error('IPC project:create-from-video error', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('project:save', async (_event, projectJsonPath, data) => {
    try {
      return await projectService.saveProject(projectJsonPath, data);
    } catch (err) {
      logger.error('IPC project:save error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:autosave', async (_event, projectJsonPath, data) => {
    try {
      return await projectService.autosaveProject(projectJsonPath, data);
    } catch (err) {
      logger.error('IPC project:autosave error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:load', async (_event, projectJsonPath) => {
    try {
      return await projectService.loadProject(projectJsonPath);
    } catch (err) {
      logger.error('IPC project:load error', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('project:get-recent', async (_event, onlyExisting = true) => {
    return projectService.getRecentProjects(onlyExisting);
  });

  ipcMain.handle('project:remove-recent', async (_event, projectDir) => {
    return projectService.removeRecentProject(projectDir);
  });

  ipcMain.handle('file:read-text', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (err) {
      logger.error('Failed to read file', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:write-text', async (_event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (err) {
      logger.error('Failed to write file', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:export-dialog', async (_event, defaultName = 'subtitles.srt', ext = 'srt') => {
    try {
      const filters = [
        { name: 'SubRip Subtitles (*.srt)', extensions: ['srt'] },
        { name: 'WebVTT Subtitles (*.vtt)', extensions: ['vtt'] },
        { name: 'Plain Text Script (*.txt)', extensions: ['txt'] }
      ];

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Subtitles',
        defaultPath: defaultName,
        filters
      });
      return result;
    } catch (err) {
      logger.error('Failed to show export dialog', err);
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('project:get-sample-path', async () => {
    const candidatePaths = [
      path.join(__dirname, '../../../test-assets/sample_10s_project/project.json'),
      path.join(__dirname, '../../test-assets/sample_10s_project/project.json'),
      path.join(process.resourcesPath || '', 'test-assets/sample_10s_project/project.json'),
      path.join(process.cwd(), 'test-assets/sample_10s_project/project.json')
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  });
}

module.exports = { registerProjectIpc };
