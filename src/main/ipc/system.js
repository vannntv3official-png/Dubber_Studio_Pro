const { ipcMain, app } = require('electron');
const os = require('os');
const logger = require('../utils/logger');

function registerSystemIpc() {
  ipcMain.handle('system:get-info', async () => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    };
  });

  ipcMain.handle('system:get-memory', async () => {
    try {
      const procMem = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercentage = Math.round((usedMem / totalMem) * 100);

      // Sum all process working set sizes (Main, Renderer, GPU, Utility)
      const metrics = app.getAppMetrics ? app.getAppMetrics() : [];
      let totalAppWorkingSetKb = 0;
      let totalAppPrivateKb = 0;
      for (const m of metrics) {
        if (m.memory) {
          totalAppWorkingSetKb += m.memory.workingSetSize || 0;
          totalAppPrivateKb += m.memory.privateBytes || 0;
        }
      }

      // If metrics unavailable (e.g. test environment), fallback to process.memoryUsage().rss
      const appWorkingSetMb = totalAppWorkingSetKb > 0
        ? Math.round(totalAppWorkingSetKb / 1024)
        : Math.round(procMem.rss / (1024 * 1024));

      const totalSystemGb = (totalMem / (1024 * 1024 * 1024)).toFixed(1);
      const usedSystemGb = (usedMem / (1024 * 1024 * 1024)).toFixed(1);

      let status = 'Good';
      if (memPercentage > 80) status = 'High';
      else if (memPercentage > 50) status = 'Moderate';

      return {
        appMemoryMb: appWorkingSetMb,
        appPrivateMb: Math.round(totalAppPrivateKb / 1024),
        processRssBytes: procMem.rss,
        processHeapUsedBytes: procMem.heapUsed,
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        totalSystemGb,
        usedSystemGb,
        percentage: memPercentage,
        status: status
      };
    } catch (err) {
      logger.error('Failed to get memory stats', err);
      return { appMemoryMb: 120, percentage: 50, status: 'Moderate' };
    }
  });

  ipcMain.handle('system:open-logs', async () => {
    return logger.openLogsFolder();
  });
}

module.exports = { registerSystemIpc };
