// ── APP.JS ──
// Central state, playback, coordination between modules

const App = (() => {

  // ── SHARED STATE ──
  const state = {
    img:            null,
    sprW:           0,
    sprH:           0,
    cols:           4,
    rows:           4,
    totalF:         0,
    offx:           0,
    offy:           0,
    padx:           0,
    pady:           0,
    curFrame:       0,
    playing:        false,
    looping:        true,
    fps:            12,
    zoom:           3,
    bgMode:         'checker',
    bgColor:        '#ffffff',
    gifScale:       2,
    anims:          [],
    activeAnim:     -1,
    compareAnim:    -1,
    compareMode:    false,
    frameOffsets:   {},
    frameDurations: {},
    customSize:     false,
    customW:        0,
    customH:        0,
    stripMode:      'frames',
    panOffset:      { x: 0, y: 0 },

    // Frame getters (set after init)
    getFrames:            null,
    getCurrentFrameIndex: null,
    getCompareFrameIndex: null,
  };

  // Undo stack
  const undoStack = [];
  const MAX_UNDO  = 30;

  let playTimer = null;

  // ── INIT ──
  function init() {
    // Wire state getters
    state.getFrames = () => Animations.getFrames();
    state.getCurrentFrameIndex = () => {
      const f = Animations.getFrames();
      return f[state.curFrame] ?? 0;
    };
    state.getCompareFrameIndex = () => {
      const f = Animations.getFrames(state.compareAnim);
      return f[Math.min(state.curFrame, f.length - 1)] ?? 0;
    };

    // Init modules
    Renderer.init(state);
    Animations.init(state);
    Export.init(state);
    Placement.init(state);
    Rulers.init(state);
    Assets.init(state);

    // Init UI values
    document.getElementById('fpsv').textContent  = state.fps + ' fps';
    document.getElementById('zvl').textContent   = state.zoom + '×';
    document.getElementById('gscalev').textContent = state.gifScale + '×';

    // Wheel zoom removed
    // Drag & drop
    const wrap = document.getElementById('canvas-wrap');
    wrap.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drag-over'); });
    wrap.addEventListener('dragleave', () => document.body.classList.remove('drag-over'));
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      document.body.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadFileObject(file);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); nextFrame(); }
      if (e.code === 'ArrowLeft')  { e.preventDefault(); prevFrame(); }
      if (e.code === 'Escape')     { closeFullscreen(); closeModal(); }
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { Rulers.toggle(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); updateGrid(); }
    });

    // Modal enter key
    document.getElementById('mname').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAnim(); });

    // Update undo button state
    updateUndoBtn();
  }

  // ── UNDO ──
  function pushUndo(desc) {
    undoStack.push({
      desc,
      snapshot: JSON.stringify({
        cols: document.getElementById('cols').value,
        rows: document.getElementById('rows').value,
        offx: document.getElementById('offx').value,
        offy: document.getElementById('offy').value,
        padx: document.getElementById('padx').value,
        pady: document.getElementById('pady').value,
        customSize: state.customSize,
        customW:    state.customW,
        customH:    state.customH,
        frameOffsets:  state.frameOffsets,
        anims:         state.anims,
        activeAnim:    state.activeAnim
      })
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoBtn();
  }

  function undo() {
    if (!undoStack.length) return;
    const { desc, snapshot } = undoStack.pop();
    const s = JSON.parse(snapshot);
    document.getElementById('cols').value = s.cols;
    document.getElementById('rows').value = s.rows;
    document.getElementById('offx').value = s.offx;
    document.getElementById('offy').value = s.offy;
    document.getElementById('padx').value = s.padx;
    document.getElementById('pady').value = s.pady;
    state.customSize   = s.customSize;
    state.customW      = s.customW;
    state.customH      = s.customH;
    state.frameOffsets = JSON.parse(JSON.stringify(s.frameOffsets));
    state.anims        = JSON.parse(JSON.stringify(s.anims));
    state.activeAnim   = s.activeAnim;
    updateGridInternal();
    Animations.syncEditor();
    Animations.renderList();
    // Show undo bar
    const bar = document.getElementById('undo-bar');
    bar.classList.add('show');
    document.getElementById('undo-desc').textContent = desc + ' annulé';
    clearTimeout(App._undoT);
    App._undoT = setTimeout(() => bar.classList.remove('show'), 2500);
    updateUndoBtn();
  }

  function updateUndoBtn() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
  }

  // ── LOAD IMAGE ──
  function loadFileObject(file) {
    const reader = new FileReader();
    reader.onload = e => loadImage(e.target.result, file.name);
    reader.readAsDataURL(file);
  }

  function loadImage(dataUrl, name) {
    const img = new Image();
    img.onload = () => {
      state.img          = img;
      state.frameOffsets = {};
      state.frameDurations = {};
      document.getElementById('tfile').textContent = name;
      document.getElementById('dropzone').classList.add('hidden');
      // Enable export buttons
      ['btn-gif', 'btn-frames', 'btn-json', 'expbtn', 'expframes', 'expjson'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      });
      document.getElementById('detect-badge').style.display = 'inline';
      document.getElementById('btn-sheet').disabled = false;
      document.getElementById('smsg').textContent  = 'Chargé : ' + name;
      document.getElementById('smsg').className    = 's-ok';
      updateGridInternal();
      toast('Sprite sheet chargée !', 'ok');
    };
    img.src = dataUrl;
  }

  // ── GRID ──
  function updateGridInternal() {
    if (!state.img) return;
    state.cols = parseInt(document.getElementById('cols').value) || 1;
    state.rows = parseInt(document.getElementById('rows').value) || 1;
    state.offx = parseInt(document.getElementById('offx').value) || 0;
    state.offy = parseInt(document.getElementById('offy').value) || 0;
    state.padx = parseInt(document.getElementById('padx').value) || 0;
    state.pady = parseInt(document.getElementById('pady').value) || 0;

    state.sprW = Math.max(1, Math.floor((state.img.naturalWidth  - state.offx - (state.cols - 1) * state.padx) / state.cols));
    state.sprH = Math.max(1, Math.floor((state.img.naturalHeight - state.offy - (state.rows - 1) * state.pady) / state.rows));

    if (state.customSize && state.customW > 0) state.sprW = state.customW;
    if (state.customSize && state.customH > 0) state.sprH = state.customH;

    state.totalF   = state.cols * state.rows;
    state.curFrame = Math.min(state.curFrame, Math.max(0, state.totalF - 1));

    document.getElementById('fw').value = state.sprW;
    document.getElementById('fh').value = state.sprH;

    Renderer.positionCanvases();
    Animations.buildStrip();
    Renderer.render();
    updateInfo();
    Animations.renderList();
    Animations.syncEditor();
    Animations.updateCompareSelect();
    Animations.updateCounter();
  }

  // ── UPDATE INFO ──
  function updateInfo() {
    if (!state.img) return;
    document.getElementById('isize').textContent  = `${state.img.naturalWidth}×${state.img.naturalHeight}`;
    document.getElementById('iframe').textContent = `${state.sprW}×${state.sprH}`;
    document.getElementById('itotal').textContent = state.totalF;
    document.getElementById('ianim').textContent  = Animations.getFrames().length + ' frames';
    const cnt = Object.keys(state.frameOffsets).filter(k => {
      const o = state.frameOffsets[k];
      return o && (o.x || o.y || o.w || o.h);
    }).length;
    document.getElementById('ioffsets').textContent = cnt || 'aucun';
    document.getElementById('ioffsets').style.color = cnt ? 'var(--orange)' : 'var(--text)';
  }

  // ── FRAME OFFSET EDITOR ──
  function updateFoEditor() {
    const fi = state.getCurrentFrameIndex();
    document.getElementById('fo-frame').textContent = '#' + fi;
    const fo = state.frameOffsets[fi] || {};
    document.getElementById('fo-x').value = fo.x || 0;
    document.getElementById('fo-y').value = fo.y || 0;
    document.getElementById('fo-w').value = fo.w || '';
    document.getElementById('fo-h').value = fo.h || '';
    const hasOff = fo.x || fo.y || fo.w || fo.h;
    document.getElementById('fo-indicator').textContent = hasOff ? '⚠ Offset actif sur cette frame' : '';
    const cnt = Object.keys(state.frameOffsets).filter(k => {
      const o = state.frameOffsets[k];
      return o && (o.x || o.y || o.w || o.h);
    }).length;
    document.getElementById('fo-badge').textContent = cnt ? cnt + ' modifiées' : '';
  }

  // ── PLAYBACK ──
  function tick() {
    const frames = Animations.getFrames();
    if (!frames.length) return;
    const fi  = frames[state.curFrame];
    const dur = state.frameDurations[fi] || (1000 / state.fps);
    state.curFrame = (state.curFrame + 1) % frames.length;
    if (!state.looping && state.curFrame === 0) {
      stopPlay();
      state.curFrame = frames.length - 1;
    }
    Renderer.render();
    Animations.updateCounter();
    Animations.highlightStrip();
    updateFoEditor();
    if (state.playing) playTimer = setTimeout(tick, dur);
  }

  function startPlay() {
    state.playing = true;
    document.getElementById('playbtn').textContent = '⏸';
    clearTimeout(playTimer);
    playTimer = setTimeout(tick, 1000 / state.fps);
  }

  function stopPlay() {
    state.playing = false;
    document.getElementById('playbtn').textContent = '▶';
    clearTimeout(playTimer);
  }

  // ── TOAST ──
  function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = '', 2200);
  }

  // ── AUTO-DETECT ──
  function autoDetect() {
    if (!state.img) { toast('Charge un sprite sheet d\'abord', 'err'); return; }
    pushUndo('auto-détection');
    const cv  = document.getElementById('detect-canvas');
    cv.width  = state.img.naturalWidth;
    cv.height = state.img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(state.img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width, H = cv.height;
    let minY = H, maxY = 0, minX = W, maxX = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 10) {
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
      }
    }
    if (minY >= maxY || minX >= maxX) { toast('Impossible d\'auto-détecter', 'err'); return; }
    document.getElementById('offx').value = minX;
    document.getElementById('offy').value = minY;
    updateGridInternal();
    toast(`Détecté : offset ${minX},${minY}`, 'ok');
  }

  // ── PUBLIC API ──
  return {
    // Init
    init,
    pushUndo,
    undo,
    toast,
    updateInfo,
    updateFoEditor,
    state,

    // Image loading
    openImage() { document.getElementById('file-input').click(); },
    handleFileInput(e) {
      const file = e.target.files[0];
      if (file) loadFileObject(file);
      e.target.value = '';
    },

    // Grid
    updateGrid:       updateGridInternal,
    updateZoom() {
      state.zoom = parseFloat(document.getElementById('zoom').value);
      document.getElementById('zvl').textContent = state.zoom + '×';
      if (state.img) { Renderer.positionCanvases(); Renderer.renderGrid(); }
    },
    updateBg() {
      state.bgMode  = document.getElementById('bg-mode').value;
      state.bgColor = document.getElementById('bgc').value;
      const bg  = document.getElementById('cbg');
      const bgB = document.getElementById('cbg-b');
      if (bg)  Renderer.applyBg(bg);
      if (bgB) Renderer.applyBg(bgB);
    },
    drawGrid:   () => Renderer.renderGrid(),
    updateOnion:() => Renderer.renderOnion(),

    // Custom size
    toggleCustomSize() {
      state.customSize = document.getElementById('custom-size').checked;
      document.getElementById('fw').disabled = !state.customSize;
      document.getElementById('fh').disabled = !state.customSize;
      if (!state.customSize) { state.customW = 0; state.customH = 0; }
      updateGridInternal();
    },
    updateCustomSize() {
      state.customW = parseInt(document.getElementById('fw').value) || 0;
      state.customH = parseInt(document.getElementById('fh').value) || 0;
      updateGridInternal();
    },

    // Playback
    setFps() {
      state.fps = parseInt(document.getElementById('fps').value);
      document.getElementById('fpsv').textContent = state.fps + ' fps';
      if (state.playing) { clearTimeout(playTimer); playTimer = setTimeout(tick, 1000 / state.fps); }
    },
    setGifScale() {
      state.gifScale = parseFloat(document.getElementById('gscale').value);
      document.getElementById('gscalev').textContent = state.gifScale + '×';
    },
    togglePlay() { state.playing ? stopPlay() : startPlay(); },
    toggleLoop() {
      state.looping = !state.looping;
      const btn = document.getElementById('lbtn');
      btn.classList.toggle('on', state.looping);
      btn.textContent = state.looping ? '⟳ LOOP' : '→ ONCE';
    },
    prevFrame() {
      const f = Animations.getFrames();
      if (!f.length) return;
      state.curFrame = (state.curFrame - 1 + f.length) % f.length;
      Renderer.render(); Animations.updateCounter(); Animations.highlightStrip(); updateFoEditor();
      if (typeof Assets !== 'undefined') { Assets.renderLayerList(); Assets.syncPropsPanel(); }
    },
    nextFrame() {
      const f = Animations.getFrames();
      if (!f.length) return;
      state.curFrame = (state.curFrame + 1) % f.length;
      Renderer.render(); Animations.updateCounter(); Animations.highlightStrip(); updateFoEditor();
      if (typeof Assets !== 'undefined') { Assets.renderLayerList(); Assets.syncPropsPanel(); }
    },

    // Frame offsets
    setFrameOffset(axis) {
      const fi = state.getCurrentFrameIndex();
      if (!state.frameOffsets[fi]) state.frameOffsets[fi] = {};
      const val = parseInt(document.getElementById('fo-' + axis).value) || 0;
      state.frameOffsets[fi][axis] = val;
      if (!state.frameOffsets[fi].x && !state.frameOffsets[fi].y &&
          !state.frameOffsets[fi].w && !state.frameOffsets[fi].h) {
        delete state.frameOffsets[fi];
      }
      Animations.buildStrip(); Renderer.render(); updateInfo(); updateFoEditor();
    },
    resetFrameOffset() {
      const fi = state.getCurrentFrameIndex();
      delete state.frameOffsets[fi];
      Animations.buildStrip(); Renderer.render(); updateFoEditor(); updateInfo();
      toast('Offset réinitialisé');
    },
    resetAllOffsets() {
      pushUndo('reset all offsets');
      state.frameOffsets = {};
      Animations.buildStrip(); Renderer.render(); updateFoEditor(); updateInfo();
      toast('Tous les offsets réinitialisés');
    },

    // Animations
    addAnim() {
      document.getElementById('mname').value  = 'anim_' + (state.anims.length + 1);
      document.getElementById('mstart').value = 0;
      document.getElementById('mend').value   = Math.max(0, state.totalF - 1);
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('mname').focus();
    },
    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
    confirmAnim() {
      const name  = document.getElementById('mname').value.trim() || ('anim_' + (state.anims.length + 1));
      const start = parseInt(document.getElementById('mstart').value) || 0;
      const end   = parseInt(document.getElementById('mend').value)   || 0;
      pushUndo('nouvelle animation');
      state.anims.push({ name, start: Math.min(start, end), end: Math.max(start, end), rev: false, pp: false });
      state.activeAnim = state.anims.length - 1;
      state.curFrame   = 0;
      App.closeModal();
      Animations.syncEditor();
      Animations.renderList();
      Animations.buildStrip();
      Animations.updateCompareSelect();
      Renderer.render();
      updateInfo();
    },
    renameAnim() {
      if (state.activeAnim < 0) return;
      state.anims[state.activeAnim].name = document.getElementById('aname').value;
      Animations.renderList();
    },
    updateRange() {
      if (state.activeAnim < 0) return;
      pushUndo('modif range');
      const a    = state.anims[state.activeAnim];
      a.start    = parseInt(document.getElementById('astart').value) || 0;
      a.end      = parseInt(document.getElementById('aend').value)   || 0;
      a.rev      = document.getElementById('arev').checked;
      a.pp       = document.getElementById('appc').checked;
      state.curFrame = 0;
      Animations.buildStrip(); Renderer.render(); updateInfo(); Animations.renderList();
    },

    // Compare
    toggleCompare() {
      state.compareMode = !state.compareMode;
      const btn   = document.getElementById('cmparebtn');
      btn.classList.toggle('on', state.compareMode);
      const wrap  = document.getElementById('canvas-wrap');
      const slotA = document.getElementById('slot-a');
      const slotB = document.getElementById('slot-b');
      const labelA = document.getElementById('label-a');
      if (state.compareMode) {
        wrap.style.display = 'grid';
        wrap.style.gridTemplateColumns = '1fr 1fr';
        slotA.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-right:1px solid var(--border)';
        slotB.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden';
        labelA.style.display = 'block';
        document.getElementById('compare-sec').style.display = 'block';
      } else {
        wrap.style.display = '';
        slotA.style.cssText = 'position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden';
        slotB.style.display = 'none';
        labelA.style.display = 'none';
        document.getElementById('compare-sec').style.display = 'none';
      }
      Renderer.render();
    },
    updateCompare() {
      state.compareAnim = parseInt(document.getElementById('compare-anim').value);
      Renderer.render();
    },

    // Strip mode
    switchStrip(mode) {
      state.stripMode = mode;
      document.getElementById('strip').style.display    = mode === 'frames'   ? 'flex' : 'none';
      document.getElementById('timeline').style.display = mode === 'timeline' ? 'flex' : 'none';
      document.querySelectorAll('.strip-tab').forEach((el, i) =>
        el.classList.toggle('active', (i === 0 && mode === 'frames') || (i === 1 && mode === 'timeline')));
    },

    // Auto detect
    autoDetect,

    // Fullscreen
    toggleFullscreen() {
      const ov = document.getElementById('fs-overlay');
      if (ov.classList.contains('show')) { App.closeFullscreen(); return; }
      if (!state.img) { toast('Charge un sprite sheet', 'err'); return; }
      ov.classList.add('show');
      Renderer.renderFullscreen();
    },
    closeFullscreen() {
      document.getElementById('fs-overlay').classList.remove('show');
    },

    // Project
    saveProject: () => Export.saveProject(),
    loadProject() { document.getElementById('project-input').click(); },
    handleProjectInput(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          Export.applyProject(data);
        } catch (err) {
          toast('Fichier projet invalide', 'err');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },

    // Assets
    handleAssetInput(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => Assets.addLayer(ev.target.result, file.name.replace(/\.[^\.]+$/, ''));
      reader.readAsDataURL(file);
      e.target.value = '';
    },

    // Exports
    exportGif:    () => Export.exportGif(),
    exportFrames: () => Export.exportFrames(),
    exportJSON:   () => Export.exportJSON(),
  };

})();

// ── BOOT ──
document.addEventListener('DOMContentLoaded', () => { App.init(); window.state = App.state; });
