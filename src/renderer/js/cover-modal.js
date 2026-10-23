/**
 * Cover Studio PRO (Poster 3D & Inpainting) Modal Controller
 */

import { ipcClient } from './ipc-client.js';
import { showToast } from './ui.js';

let isInitialized = false;
let modalEl = null;
let currentPoster = null;
let cleanedPoster = null;
let currentLayer = null;
let activeView = 'original'; // 'original' | 'cleaned'
let analysisData = null;
let selectedTitle = '';
let templatesData = { groups: [], templates: [] };
let selectedTemplateId = 'khmer-angkor-stone';

// Image rendering cache & drag state
let cachedBaseImg = null;
let cachedBasePath = null;
let cachedLayerImg = null;
let cachedLayerPath = null;
let isDragging = false;
let dragStartY = 0;
let dragStartLayerY = 0;

export function initCoverModal() {
  if (isInitialized) return;
  isInitialized = true;

  modalEl = document.getElementById('coverModal');
  if (!modalEl) return;

  // Bind Open Button
  const openBtn = document.getElementById('coverStudioBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () => openCoverStudio());
  }

  // Bind Close Buttons & Modal Backdrop Click
  const closeBtn = document.getElementById('closeCoverModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeCoverStudio());
  }
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeCoverStudio();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('hidden')) {
      closeCoverStudio();
    }
  });

  // Bind Select / Drop Poster
  const selectPosterBtn = document.getElementById('coverSelectBtn');
  if (selectPosterBtn) {
    selectPosterBtn.addEventListener('click', handleSelectPoster);
  }

  // Bind Dropzone
  const dropzone = document.getElementById('coverDropzone');
  if (dropzone) {
    dropzone.addEventListener('click', handleSelectPoster);
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file?.path) {
          await loadPosterFile(file.path);
        }
      }
    });
  }

  // Bind Vision Analysis
  const analyseBtn = document.getElementById('coverAnalyseBtn');
  if (analyseBtn) {
    analyseBtn.addEventListener('click', handleAnalysePoster);
  }

  // Bind Erase Text
  const eraseBtn = document.getElementById('coverEraseBtn');
  if (eraseBtn) {
    eraseBtn.addEventListener('click', handleEraseText);
  }

  // Bind Generate 3D
  const gen3dBtn = document.getElementById('coverGen3dBtn');
  if (gen3dBtn) {
    gen3dBtn.addEventListener('click', handleGenerate3D);
  }

  // Bind Position & Scaling Sliders and Presets
  const posYSlider = document.getElementById('coverPosYSlider');
  posYSlider?.addEventListener('input', (e) => {
    if (currentLayer) {
      const canvas = document.getElementById('coverPreviewCanvas');
      const baseHeight = canvas?.height || 1080;
      currentLayer.y = Math.round((parseInt(e.target.value, 10) / 100) * baseHeight);
      redrawPreview();
    }
  });

  const scaleSlider = document.getElementById('coverScaleSlider');
  const scaleVal = document.getElementById('coverScaleVal');
  scaleSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (scaleVal) scaleVal.textContent = val + '%';
    if (currentLayer) {
      currentLayer.scale = val / 100;
      redrawPreview();
    }
  });

  const updatePosFromPercent = (pct) => {
    if (posYSlider) posYSlider.value = String(pct);
    if (currentLayer) {
      const canvas = document.getElementById('coverPreviewCanvas');
      const baseHeight = canvas?.height || 1080;
      currentLayer.y = Math.round((pct / 100) * baseHeight);
      redrawPreview();
    }
  };

  document.getElementById('coverPosTopBtn')?.addEventListener('click', () => updatePosFromPercent(15));
  document.getElementById('coverPosCenterBtn')?.addEventListener('click', () => updatePosFromPercent(45));
  document.getElementById('coverPosBottomBtn')?.addEventListener('click', () => updatePosFromPercent(65));

  // Bind Canvas Direct Mouse Dragging
  const canvas = document.getElementById('coverPreviewCanvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!currentLayer) return;
      isDragging = true;
      dragStartY = e.clientY;
      const baseHeight = canvas.height || 1080;
      dragStartLayerY = typeof currentLayer.y === 'number' ? currentLayer.y : Math.round(baseHeight * 0.65);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDragging || !currentLayer) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.height <= 0) return;
      const scaleY = canvas.height / rect.height;
      const deltaY = (e.clientY - dragStartY) * scaleY;
      const newY = Math.max(0, Math.min(canvas.height * 0.9, dragStartLayerY + deltaY));
      currentLayer.y = Math.round(newY);
      if (posYSlider && canvas.height > 0) {
        posYSlider.value = String(Math.round((newY / canvas.height) * 100));
      }
      redrawPreview();
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        canvas.style.cursor = currentLayer ? 'grab' : 'default';
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
  }

  // Bind Export
  const exportBtn = document.getElementById('coverExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportCover);
  }

  // Bind View Toggle
  const viewOrigBtn = document.getElementById('coverViewOrigBtn');
  const viewCleanBtn = document.getElementById('coverViewCleanBtn');
  if (viewOrigBtn && viewCleanBtn) {
    viewOrigBtn.addEventListener('click', () => setView('original'));
    viewCleanBtn.addEventListener('click', () => setView('cleaned'));
  }

  // Templates will be loaded lazily on openCoverStudio
}

async function loadTemplates() {
  try {
    const res = await ipcClient.cover.getTemplates();
    if (res?.templates) {
      templatesData = res;
      renderTemplateCategories();
      renderTemplateGrid();
    }
  } catch (err) {
    console.warn('[cover-modal] Failed to load templates:', err);
  }
}

function renderTemplateCategories() {
  const catContainer = document.getElementById('coverTemplateCategories');
  if (!catContainer) return;
  catContainer.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.className = 'cat-chip active';
  allChip.textContent = 'ទាំងអស់ (All)';
  allChip.onclick = () => {
    catContainer.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    allChip.classList.add('active');
    renderTemplateGrid();
  };
  catContainer.appendChild(allChip);

  for (const group of templatesData.groups) {
    const chip = document.createElement('button');
    chip.className = 'cat-chip';
    chip.textContent = group.name;
    chip.onclick = () => {
      catContainer.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderTemplateGrid(group.id);
    };
    catContainer.appendChild(chip);
  }
}

function renderTemplateGrid(groupId = null) {
  const grid = document.getElementById('coverTemplateGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const list = groupId
    ? templatesData.templates.filter(t => t.group === groupId)
    : templatesData.templates;

  for (const tpl of list) {
    const card = document.createElement('div');
    card.className = `tpl-card ${tpl.id === selectedTemplateId ? 'selected' : ''}`;
    card.onclick = () => {
      selectedTemplateId = tpl.id;
      grid.querySelectorAll('.tpl-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const hintEl = document.getElementById('coverSelectedTplHint');
      if (hintEl) hintEl.textContent = `${tpl.name}: ${tpl.hint || ''}`;
    };

    const swatch = document.createElement('div');
    swatch.className = 'tpl-swatch';
    if (tpl.swatch) swatch.style.background = tpl.swatch;

    const name = document.createElement('div');
    name.className = 'tpl-name';
    name.textContent = tpl.name;

    card.appendChild(swatch);
    card.appendChild(name);
    grid.appendChild(card);
  }
}

export function openCoverStudio() {
  if (!modalEl) modalEl = document.getElementById('coverModal');
  if (modalEl) {
    modalEl.classList.remove('hidden');
    if (!templatesData || !templatesData.templates || templatesData.templates.length === 0) {
      loadTemplates();
    }
  } else {
    showToast('🎨 Cover Studio (Poster 3D) — Coming Soon (មុខងារនេះនឹងមកដល់ឆាប់ៗនេះ!)', 2500);
  }
}

export function closeCoverStudio() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
}

async function handleSelectPoster() {
  try {
    const res = await ipcClient.cover.select();
    if (res?.ok && res.source) {
      currentPoster = res.source;
      cleanedPoster = null;
      currentLayer = null;
      activeView = 'original';
      updatePosterMeta();
      redrawPreview();
      showToast('បានផ្ទុករូបភាពផ្ទាំងគំនូរជោគជ័យ', 'success');
    }
  } catch (err) {
    showToast('បរាជ័យក្នុងការបើករូបភាព: ' + err.message, 'error');
  }
}

async function loadPosterFile(filePath) {
  try {
    const res = await ipcClient.cover.importPath(filePath);
    if (res?.ok && res.source) {
      currentPoster = res.source;
      cleanedPoster = null;
      currentLayer = null;
      activeView = 'original';
      updatePosterMeta();
      redrawPreview();
      showToast('បានផ្ទុករូបភាពផ្ទាំងគំនូរជោគជ័យ', 'success');
    } else {
      showToast(res?.error || 'Could not load poster', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updatePosterMeta() {
  const metaEl = document.getElementById('coverPosterMeta');
  if (!metaEl) return;
  if (!currentPoster) {
    metaEl.textContent = 'មិនទាន់មានរូបភាព';
    return;
  }
  metaEl.textContent = `${currentPoster.name} (${currentPoster.width}x${currentPoster.height})`;
}

async function handleAnalysePoster() {
  if (!currentPoster?.path) {
    showToast('សូមជ្រើសរើសរូបភាពផ្ទាំងគំនូរសិន', 'warning');
    return;
  }

  const btn = document.getElementById('coverAnalyseBtn');
  const spinner = document.getElementById('coverAnalyseSpinner');
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const res = await ipcClient.cover.analyse(currentPoster.path);
    if (res?.ok && res.analysis) {
      analysisData = res.analysis;
      renderAnalysisResults(analysisData);
      showToast('ការវិភាគ Gemini Vision ជោគជ័យ!', 'success');
    } else {
      showToast(res?.error || 'Analysis failed', 'error');
    }
  } catch (err) {
    showToast('ការវិភាគបរាជ័យ: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

function renderAnalysisResults(analysis) {
  const container = document.getElementById('coverAnalysisContainer');
  if (!container) return;
  container.classList.remove('hidden');

  const metaText = document.getElementById('coverAnalysisMeta');
  if (metaText) {
    metaText.innerHTML = `<b>ចំណងជើងដើម:</b> ${analysis.originalTitle || 'N/A'} (${analysis.originalLanguage || ''}) | <b>ប្រភេទ:</b> ${analysis.genre || ''}`;
  }

  const titlesList = document.getElementById('coverSuggestedTitles');
  if (!titlesList) return;
  titlesList.innerHTML = '';

  const stylesMap = {
    direct: { label: '🎯 ចំៗ (Direct)', color: '#38bdf8' },
    localized: { label: '🇰🇭 ធម្មជាតិ (Localized)', color: '#4ade80' },
    dramatic: { label: '🎭 មនោសញ្ចេតនា (Dramatic)', color: '#f472b6' },
    action: { label: '⚡ កក្រើក (Action)', color: '#fb923c' },
    viral: { label: '🔥 ទាក់ទាញ (Viral)', color: '#a78bfa' }
  };

  const rawTitles = analysis.khmerTitles || analysis.titles || [];
  const titles = Array.isArray(rawTitles) ? rawTitles.map(t => {
    if (typeof t === 'string') return { text: t, style: 'localized' };
    return { text: t.text || t.title || '', style: t.style || 'localized', rationale: t.rationale || '' };
  }).filter(t => t.text) : [];

  if (titles.length === 0) {
    titlesList.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:6px;">មិនមានចំណងជើងខ្មែរត្រូវបានរកឃើញទេ សូមសាកល្បងម្ដងទៀត ឬវាយបញ្ចូលដោយដៃ។</div>';
    return;
  }

  for (const item of titles) {
    const pill = document.createElement('div');
    pill.className = 'title-pill';
    const tag = stylesMap[item.style] || { label: item.style, color: '#fff' };
    pill.innerHTML = `<span class="pill-tag" style="color: ${tag.color}">${tag.label}</span> <span class="pill-text">${item.text}</span>`;
    pill.onclick = () => {
      document.querySelectorAll('.title-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedTitle = item.text;
      const titleInput = document.getElementById('coverTitleInput');
      if (titleInput) titleInput.value = item.text;
    };
    titlesList.appendChild(pill);
  }

  // Auto-select first title
  if (titles[0]?.text) {
    selectedTitle = titles[0].text;
    const titleInput = document.getElementById('coverTitleInput');
    if (titleInput) titleInput.value = titles[0].text;
    titlesList.children[0]?.classList.add('active');
  }
}

async function handleEraseText() {
  if (!currentPoster?.path) {
    showToast('សូមជ្រើសរើសរូបភាពផ្ទាំងគំនូរសិន', 'warning');
    return;
  }

  const btn = document.getElementById('coverEraseBtn');
  const spinner = document.getElementById('coverEraseSpinner');
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const textRegions = analysisData?.textRegions || [];
    const res = await ipcClient.cover.erase(currentPoster.path, textRegions);
    if (res?.ok && res.source) {
      cleanedPoster = res.source;
      activeView = 'cleaned';
      setView('cleaned');
      redrawPreview();
      showToast('បានលុបអក្សរចាស់ជោគជ័យ (Inpainting Cleaned)!', 'success');
    } else {
      showToast(res?.error || 'Erase text failed', 'error');
    }
  } catch (err) {
    showToast('ការលុបអក្សរបរាជ័យ: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function handleGenerate3D() {
  const titleInput = document.getElementById('coverTitleInput');
  const title = titleInput?.value?.trim() || selectedTitle;
  if (!title) {
    showToast('សូមបញ្ចូល ឬជ្រើសរើសចំណងជើងជាភាសាខ្មែរសិន', 'warning');
    return;
  }

  const fontSelect = document.getElementById('coverFontSelect');
  const fontFamily = fontSelect?.value || 'Koulen';

  const keyColorSelect = document.getElementById('coverKeyColorSelect');
  const keyColor = keyColorSelect?.value || 'magenta';

  const posterPath = cleanedPoster?.path || currentPoster?.path;

  const btn = document.getElementById('coverGen3dBtn');
  const spinner = document.getElementById('coverGen3dSpinner');
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const res = await ipcClient.cover.generate3D({
      imagePath: posterPath,
      title,
      templateId: selectedTemplateId,
      fontFamily,
      keyColor
    });

    if (res?.ok && res.layer) {
      currentLayer = res.layer;
      const canvas = document.getElementById('coverPreviewCanvas');
      const baseHeight = canvas?.height || 1080;
      const posYSlider = document.getElementById('coverPosYSlider');
      const scaleSlider = document.getElementById('coverScaleSlider');
      const scaleVal = document.getElementById('coverScaleVal');
      const pct = posYSlider ? parseInt(posYSlider.value, 10) : 65;
      currentLayer.y = Math.round((pct / 100) * baseHeight);
      currentLayer.scale = scaleSlider ? parseInt(scaleSlider.value, 10) / 100 : 1.0;
      currentLayer.x = null;
      if (scaleVal && scaleSlider) scaleVal.textContent = scaleSlider.value + '%';
      redrawPreview();
      showToast('បានបង្កើតចំណងជើង 3D ជោគជ័យ!', 'success');
    } else {
      showToast(res?.error || '3D generation failed', 'error');
    }
  } catch (err) {
    showToast('ការបង្កើត 3D បរាជ័យ: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

function setView(view) {
  activeView = view;
  const viewOrigBtn = document.getElementById('coverViewOrigBtn');
  const viewCleanBtn = document.getElementById('coverViewCleanBtn');
  if (view === 'cleaned') {
    viewOrigBtn?.classList.remove('active');
    viewCleanBtn?.classList.add('active');
  } else {
    viewOrigBtn?.classList.add('active');
    viewCleanBtn?.classList.remove('active');
  }
  redrawPreview();
}

function redrawPreview() {
  const canvas = document.getElementById('coverPreviewCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const baseSource = (activeView === 'cleaned' && cleanedPoster) ? cleanedPoster : currentPoster;
  if (!baseSource) {
    canvas.width = 640;
    canvas.height = 360;
    canvas.style.cursor = 'default';
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('សូមជ្រើសរើស ឬទម្លាក់រូបភាពផ្ទាំងគំនូរនៅទីនេះ', canvas.width / 2, canvas.height / 2);
    return;
  }

  const renderToCanvas = () => {
    if (!cachedBaseImg || !cachedBaseImg.width) return;
    canvas.width = cachedBaseImg.width;
    canvas.height = cachedBaseImg.height;
    ctx.drawImage(cachedBaseImg, 0, 0, canvas.width, canvas.height);

    if (cachedLayerImg && currentLayer) {
      const scale = typeof currentLayer.scale === 'number' ? currentLayer.scale : 1.0;
      const lw = Math.round(canvas.width * scale);
      const lh = Math.round(lw * (cachedLayerImg.height / cachedLayerImg.width));
      const lx = typeof currentLayer.x === 'number' ? currentLayer.x : Math.round((canvas.width - lw) / 2);
      const ly = typeof currentLayer.y === 'number' ? currentLayer.y : Math.round(canvas.height * 0.65);
      ctx.drawImage(cachedLayerImg, lx, ly, lw, lh);
      canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  };

  const normalizedBasePath = baseSource.path.replace(/\\/g, '/');
  if (cachedBasePath !== normalizedBasePath || !cachedBaseImg) {
    cachedBasePath = normalizedBasePath;
    cachedBaseImg = new globalThis.Image();
    cachedBaseImg.onload = () => {
      checkAndLoadLayer(renderToCanvas);
    };
    cachedBaseImg.onerror = () => {
      canvas.width = 640;
      canvas.height = 360;
      ctx.fillStyle = '#1e1014';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f87171';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('បរាជ័យក្នុងការបើករូបភាពផ្ទាំងគំនូរ', canvas.width / 2, canvas.height / 2);
    };
    cachedBaseImg.src = 'file:///' + normalizedBasePath;
  } else {
    checkAndLoadLayer(renderToCanvas);
  }
}

function checkAndLoadLayer(doneCallback) {
  if (currentLayer?.path) {
    const normalizedLayerPath = currentLayer.path.replace(/\\/g, '/');
    if (cachedLayerPath !== normalizedLayerPath || !cachedLayerImg) {
      cachedLayerPath = normalizedLayerPath;
      cachedLayerImg = new globalThis.Image();
      cachedLayerImg.onload = () => doneCallback();
      cachedLayerImg.src = 'file:///' + normalizedLayerPath;
    } else {
      doneCallback();
    }
  } else {
    cachedLayerImg = null;
    cachedLayerPath = null;
    doneCallback();
  }
}

async function handleExportCover() {
  const baseSource = (activeView === 'cleaned' && cleanedPoster) ? cleanedPoster : currentPoster;
  if (!baseSource?.path) {
    showToast('សូមជ្រើសរើសផ្ទាំងគំនូរសិន', 'warning');
    return;
  }

  const layers = [];
  if (currentLayer?.path) {
    layers.push({
      path: currentLayer.path,
      x: typeof currentLayer.x === 'number' ? currentLayer.x : null,
      y: typeof currentLayer.y === 'number' ? currentLayer.y : null,
      scale: typeof currentLayer.scale === 'number' ? currentLayer.scale : 1.0
    });
  }

  try {
    const res = await ipcClient.cover.export({
      imagePath: baseSource.path,
      layers,
      suggestedName: (selectedTitle || 'Khmer_Cover') + ' - Poster'
    });

    if (res?.ok && res.filePath) {
      showToast('បាននាំចេញផ្ទាំងរូបភាពជោគជ័យ: ' + res.filePath, 'success');
    }
  } catch (err) {
    showToast('ការនាំចេញបរាជ័យ: ' + err.message, 'error');
  }
}
