/**
 * Shared IPC Contracts & Data Definitions
 * Used by Electron main process, IPC handlers, preload, and test suites.
 */

/**
 * Creates a normalized separation IPC response.
 * Guarantees both `bgmPath` and `accompanimentPath` (alias) are populated
 * so neither renderer nor backend break on property naming conventions.
 *
 * @param {Object} params
 * @param {boolean} params.success
 * @param {string|null} [params.vocalsPath] - Path to separated vocal audio
 * @param {string|null} [params.bgmPath] - Path to separated background accompaniment
 * @param {string|null} [params.accompanimentPath] - Backward-compatible alias
 * @param {string|null} [params.error] - Failure description
 * @returns {{ success: boolean, vocalsPath: string|null, bgmPath: string|null, accompanimentPath: string|null, error: string|null }}
 */
function formatSeparationResponse({
  success = false,
  vocalsPath = null,
  bgmPath = null,
  accompanimentPath = null,
  error = null
} = {}) {
  const resolvedBgm = bgmPath || accompanimentPath || null;
  return {
    success: Boolean(success),
    vocalsPath: vocalsPath || null,
    bgmPath: resolvedBgm,
    accompanimentPath: resolvedBgm,
    error: error ? String(error) : null
  };
}

module.exports = {
  formatSeparationResponse
};
