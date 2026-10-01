/**
 * Settings Section: About
 * Displays application identity, version, open source licensing,
 * and updater status tooltip.
 */

export const sectionAbout = {
  id: 'secAbout',

  init() {
    const updateBtn = document.getElementById('setAboutCheckUpdatesBtn');
    if (updateBtn) {
      updateBtn.hidden = true;
      updateBtn.style.display = 'none';
      updateBtn.title = 'You are running the latest version (v1.0.0)';
    }
  },

  load() {
    // Static presentation
  },

  getData() {
    return {};
  }
};
