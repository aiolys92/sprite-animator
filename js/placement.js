// ── PLACEMENT.JS ──
// Free placement tool: drag preview + drag source frame in spritesheet
// Controls: mouse drag, numeric fields, magnetic snap

const Placement = (() => {

  let state = null;
  function init(appState) { state = appState; }

  // ── PREVIEW PAN STATE ──
  // panOffset: visual offset of the preview canvas inside the slot (pixels, screen space)
  // frameSourceOffset: per-frame source drag offset in the spritesheet (pixels, image space)

  // ── TOOL MODES ──
  // 'pan'    : drag the preview display around
  // 'source' : drag the source crop window in the spritesheet
  // 'none'   : no placement tool active
  let activeToolMode = 'none';
  let snapEnabled    = false;
  let snapSize       = 8; // px in image space

  // ── PAN (preview display) ──
  let panDrag = null; // { startX, startY, origOffX, origOffY }

  function startPanDrag(e) {
    if (activeToolMode !== 'pan') return;
    panDrag = {
      startX:   e.clientX,
      startY:   e.clientY,
      origOffX: state.panOffset.x,
      origOffY: state.panOffset.y
    };
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup',   onPanUp);
    e.preventDefault();
  }

  function onPanMove(e) {
    if (!panDrag) return;
    const dx = e.clientX - panDrag.startX;
    const dy = e.clientY - panDrag.startY;
    state.panOffset.x = panDrag.origOffX + dx;
    state.panOffset.y = panDrag.origOffY + dy;
    updatePanFields();
    Renderer.positionCanvases();
    Renderer.render();
  }

  function onPanUp() {
    panDrag = null;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup',   onPanUp);
  }

  function resetPan() {
    state.panOffset = { x: 0, y: 0 };
    updatePanFields();
    Renderer.positionCanvases();
    Renderer.render();
  }

  function updatePanFields() {
    const fx = document.getElementById('pan-x');
    const fy = document.getElementById('pan-y');
    if (fx) fx.value = Math.round(state.panOffset.x);
    if (fy) fy.value = Math.round(state.panOffset.y);
  }

  function applyPanFields() {
    state.panOffset.x = parseInt(document.getElementById('pan-x').value) || 0;
    state.panOffset.y = parseInt(document.getElementById('pan-y').value) || 0;
    Renderer.positionCanvases();
    Renderer.render();
  }

  // ── SOURCE DRAG (move crop window in spritesheet) ──
  let sourceDrag = null;

  function startSourceDrag(e) {
    if (activeToolMode !== 'source') return;
    const fi = state.getCurrentFrameIndex();
    const fo = state.frameOffsets[fi] || {};
    sourceDrag = {
      startX:   e.clientX,
      startY:   e.clientY,
      origX:    fo.x || 0,
      origY:    fo.y || 0,
      frameIdx: fi
    };
    document.addEventListener('mousemove', onSourceMove);
    document.addEventListener('mouseup',   onSourceUp);
    e.preventDefault();
  }

  function onSourceMove(e) {
    if (!sourceDrag) return;
    // Convert screen delta → image space delta (divide by zoom)
    let dx = Math.round((e.clientX - sourceDrag.startX) / state.zoom);
    let dy = Math.round((e.clientY - sourceDrag.startY) / state.zoom);
    if (snapEnabled) {
      dx = Math.round(dx / snapSize) * snapSize;
      dy = Math.round(dy / snapSize) * snapSize;
    }
    const fi = sourceDrag.frameIdx;
    if (!state.frameOffsets[fi]) state.frameOffsets[fi] = {};
    state.frameOffsets[fi].x = sourceDrag.origX + dx;
    state.frameOffsets[fi].y = sourceDrag.origY + dy;
    // Update numeric fields
    updateSourceFields(fi);
    Renderer.render();
    App.updateFoEditor();
    App.updateInfo();
  }

  function onSourceUp() {
    if (sourceDrag) {
      // Clean up empty offset
      const fi = sourceDrag.frameIdx;
      const fo = state.frameOffsets[fi];
      if (fo && !fo.x && !fo.y && !fo.w && !fo.h) delete state.frameOffsets[fi];
      Animations.buildStrip();
    }
    sourceDrag = null;
    document.removeEventListener('mousemove', onSourceMove);
    document.removeEventListener('mouseup',   onSourceUp);
  }

  function updateSourceFields(fi) {
    const fo = state.frameOffsets[fi] || {};
    const fx = document.getElementById('fo-x');
    const fy = document.getElementById('fo-y');
    if (fx) fx.value = fo.x || 0;
    if (fy) fy.value = fo.y || 0;
  }

  // ── SPRITESHEET VIEWER ──
  // Shows the full spritesheet with grid overlay and draggable crop window
  let sheetViewerOpen = false;
  let sheetCanvas     = null;
  let sheetCtx        = null;
  let sheetZoom       = 1;
  let sheetPan        = { x: 0, y: 0 };
  let sheetDrag       = null;
  let sheetCropDrag   = null;

  function openSheetViewer() {
    if (!state.img) { App.toast('Charge un sprite sheet d\'abord', 'err'); return; }
    sheetViewerOpen = true;
    const overlay = document.getElementById('sheet-overlay');
    overlay.classList.remove('hidden');
    sheetCanvas = document.getElementById('sheet-canvas');
    sheetCtx    = sheetCanvas.getContext('2d');
    sheetZoom   = Math.min(
      (window.innerWidth  * 0.8) / state.img.naturalWidth,
      (window.innerHeight * 0.8) / state.img.naturalHeight,
      3
    );
    sheetPan = { x: 0, y: 0 };
    renderSheetViewer();
    attachSheetEvents();
  }

  function closeSheetViewer() {
    sheetViewerOpen = false;
    document.getElementById('sheet-overlay').classList.add('hidden');
    detachSheetEvents();
    // Rebuild strip after potential source moves
    Animations.buildStrip();
    Renderer.render();
    App.updateInfo();
  }

  function renderSheetViewer() {
    if (!sheetCanvas || !state.img) return;
    const W = sheetCanvas.width  = sheetCanvas.offsetWidth  || 900;
    const H = sheetCanvas.height = sheetCanvas.offsetHeight || 600;
    sheetCtx.clearRect(0, 0, W, H);

    // Background
    sheetCtx.fillStyle = '#0f0f13';
    sheetCtx.fillRect(0, 0, W, H);

    // Checkerboard for image area
    const iw = state.img.naturalWidth  * sheetZoom;
    const ih = state.img.naturalHeight * sheetZoom;
    const ix = W / 2 - iw / 2 + sheetPan.x;
    const iy = H / 2 - ih / 2 + sheetPan.y;

    drawCheckerboard(sheetCtx, ix, iy, iw, ih, 10);
    sheetCtx.imageSmoothingEnabled = false;
    sheetCtx.drawImage(state.img, ix, iy, iw, ih);

    // Grid overlay
    const { cols, rows, sprW, sprH } = state;
    const ox = (parseInt(document.getElementById('offx').value) || 0) * sheetZoom;
    const oy = (parseInt(document.getElementById('offy').value) || 0) * sheetZoom;
    const px = (parseInt(document.getElementById('padx').value) || 0) * sheetZoom;
    const py = (parseInt(document.getElementById('pady').value) || 0) * sheetZoom;
    const fw = sprW * sheetZoom;
    const fh = sprH * sheetZoom;

    sheetCtx.strokeStyle = 'rgba(124,92,252,0.5)';
    sheetCtx.lineWidth   = 1;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const fi = r * cols + c;
        const fo = state.frameOffsets[fi] || {};
        const fx = ix + ox + c * (fw + px) + (fo.x || 0) * sheetZoom;
        const fy = iy + oy + r * (fh + py) + (fo.y || 0) * sheetZoom;
        const cfw = (fo.w || sprW) * sheetZoom;
        const cfh = (fo.h || sprH) * sheetZoom;

        // Highlight active frame
        const isActive = fi === state.getCurrentFrameIndex();
        sheetCtx.strokeStyle = isActive ? '#fc5c7c' : 'rgba(124,92,252,0.55)';
        sheetCtx.lineWidth   = isActive ? 2 : 1;

        // Fill active frame
        if (isActive) {
          sheetCtx.fillStyle = 'rgba(252,92,124,0.12)';
          sheetCtx.fillRect(fx, fy, cfw, cfh);
        }
        // Has offset
        if (fo.x || fo.y) {
          sheetCtx.fillStyle = 'rgba(252,176,92,0.1)';
          sheetCtx.fillRect(fx, fy, cfw, cfh);
          sheetCtx.strokeStyle = 'rgba(252,176,92,0.7)';
        }

        sheetCtx.strokeRect(fx + 0.5, fy + 0.5, cfw - 1, cfh - 1);

        // Frame number
        sheetCtx.fillStyle = isActive ? '#fc5c7c' : 'rgba(124,92,252,0.8)';
        sheetCtx.font       = `${Math.max(9, 11 * sheetZoom)}px monospace`;
        sheetCtx.fillText(fi, fx + 3, fy + 13);
      }
    }

    // Snap grid
    if (snapEnabled) {
      sheetCtx.strokeStyle = 'rgba(255,255,255,0.05)';
      sheetCtx.lineWidth   = 0.5;
      const sg = snapSize * sheetZoom;
      for (let x = ix; x < ix + iw; x += sg) { sheetCtx.beginPath(); sheetCtx.moveTo(x, iy); sheetCtx.lineTo(x, iy + ih); sheetCtx.stroke(); }
      for (let y = iy; y < iy + ih; y += sg) { sheetCtx.beginPath(); sheetCtx.moveTo(ix, y); sheetCtx.lineTo(ix + iw, y); sheetCtx.stroke(); }
    }

    // Cursor coordinates
    sheetCtx.fillStyle = 'rgba(136,136,170,0.8)';
    sheetCtx.font       = '10px monospace';
    sheetCtx.fillText(`zoom: ${sheetZoom.toFixed(1)}×  snap: ${snapEnabled ? snapSize + 'px' : 'off'}`, 8, H - 6);
  }

  function drawCheckerboard(ctx, x, y, w, h, size) {
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2a3a' : '#1e1e2a';
        ctx.fillRect(x + c * size, y + r * size, size, size);
      }
    }
    ctx.restore();
  }

  // Sheet viewer image coords from screen coords
  function screenToImage(ex, ey) {
    const W  = sheetCanvas.width;
    const H  = sheetCanvas.height;
    const iw = state.img.naturalWidth  * sheetZoom;
    const ih = state.img.naturalHeight * sheetZoom;
    const ix = W / 2 - iw / 2 + sheetPan.x;
    const iy = H / 2 - ih / 2 + sheetPan.y;
    return {
      x: (ex - ix) / sheetZoom,
      y: (ey - iy) / sheetZoom
    };
  }

  function attachSheetEvents() {
    sheetCanvas.addEventListener('mousedown',  onSheetMouseDown);
    sheetCanvas.addEventListener('mousemove',  onSheetMouseMove);
    sheetCanvas.addEventListener('mouseup',    onSheetMouseUp);
    sheetCanvas.addEventListener('wheel',      onSheetWheel, { passive: false });
    sheetCanvas.addEventListener('dblclick',   onSheetDblClick);
  }
  function detachSheetEvents() {
    if (!sheetCanvas) return;
    sheetCanvas.removeEventListener('mousedown',  onSheetMouseDown);
    sheetCanvas.removeEventListener('mousemove',  onSheetMouseMove);
    sheetCanvas.removeEventListener('mouseup',    onSheetMouseUp);
    sheetCanvas.removeEventListener('wheel',      onSheetWheel);
    sheetCanvas.removeEventListener('dblclick',   onSheetDblClick);
  }

  function hitTestFrame(imgX, imgY) {
    const { cols, rows, sprW, sprH } = state;
    const ox = parseInt(document.getElementById('offx').value) || 0;
    const oy = parseInt(document.getElementById('offy').value) || 0;
    const px = parseInt(document.getElementById('padx').value) || 0;
    const py = parseInt(document.getElementById('pady').value) || 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fi = r * cols + c;
        const fo = state.frameOffsets[fi] || {};
        const fx = ox + c * (sprW + px) + (fo.x || 0);
        const fy = oy + r * (sprH + py) + (fo.y || 0);
        const fw = fo.w || sprW;
        const fh = fo.h || sprH;
        if (imgX >= fx && imgX <= fx + fw && imgY >= fy && imgY <= fy + fh) return fi;
      }
    }
    return -1;
  }

  function onSheetMouseDown(e) {
    const rect  = sheetCanvas.getBoundingClientRect();
    const ex    = e.clientX - rect.left;
    const ey    = e.clientY - rect.top;
    const imgPt = screenToImage(ex, ey);
    const hitFi = hitTestFrame(imgPt.x, imgPt.y);

    if (e.button === 1 || e.altKey || hitFi < 0) {
      // Pan the sheet viewer
      sheetDrag = { startX: e.clientX, startY: e.clientY, origPan: { ...sheetPan } };
      sheetCanvas.style.cursor = 'grabbing';
    } else if (hitFi >= 0) {
      // Select + prepare to drag this frame's source
      state.curFrame = Animations.getFrames().indexOf(hitFi);
      if (state.curFrame < 0) state.curFrame = 0;
      const fo = state.frameOffsets[hitFi] || {};
      sheetCropDrag = {
        startX:   e.clientX,
        startY:   e.clientY,
        origX:    fo.x || 0,
        origY:    fo.y || 0,
        frameIdx: hitFi
      };
      sheetCanvas.style.cursor = 'move';
      App.updateFoEditor();
      Renderer.render();
      Animations.updateCounter();
    }
    e.preventDefault();
  }

  function onSheetMouseMove(e) {
    if (sheetDrag) {
      sheetPan.x = sheetDrag.origPan.x + (e.clientX - sheetDrag.startX);
      sheetPan.y = sheetDrag.origPan.y + (e.clientY - sheetDrag.startY);
      renderSheetViewer();
    } else if (sheetCropDrag) {
      let dx = Math.round((e.clientX - sheetCropDrag.startX) / sheetZoom);
      let dy = Math.round((e.clientY - sheetCropDrag.startY) / sheetZoom);
      if (snapEnabled) {
        dx = Math.round(dx / snapSize) * snapSize;
        dy = Math.round(dy / snapSize) * snapSize;
      }
      const fi = sheetCropDrag.frameIdx;
      if (!state.frameOffsets[fi]) state.frameOffsets[fi] = {};
      state.frameOffsets[fi].x = sheetCropDrag.origX + dx;
      state.frameOffsets[fi].y = sheetCropDrag.origY + dy;
      App.updateFoEditor();
      Renderer.render();
      renderSheetViewer();
    } else {
      // Hover: show which frame is under cursor
      const rect  = sheetCanvas.getBoundingClientRect();
      const imgPt = screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const hitFi = hitTestFrame(imgPt.x, imgPt.y);
      sheetCanvas.style.cursor = hitFi >= 0 ? 'move' : 'grab';
      // Show coords
      const coordEl = document.getElementById('sheet-coords');
      if (coordEl) {
        const ix = Math.round(imgPt.x), iy = Math.round(imgPt.y);
        coordEl.textContent = `x:${ix} y:${iy}${hitFi >= 0 ? ' · frame #' + hitFi : ''}`;
      }
    }
  }

  function onSheetMouseUp(e) {
    if (sheetCropDrag) {
      const fi = sheetCropDrag.frameIdx;
      const fo = state.frameOffsets[fi];
      if (fo && !fo.x && !fo.y && !fo.w && !fo.h) delete state.frameOffsets[fi];
      Animations.buildStrip();
      App.updateInfo();
    }
    sheetDrag     = null;
    sheetCropDrag = null;
    sheetCanvas.style.cursor = 'grab';
    renderSheetViewer();
  }

  function onSheetWheel(e) {
    e.preventDefault();
    const delta  = e.deltaY < 0 ? 1.15 : 0.87;
    const rect   = sheetCanvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const W      = sheetCanvas.width;
    const H      = sheetCanvas.height;
    const iw     = state.img.naturalWidth  * sheetZoom;
    const ih     = state.img.naturalHeight * sheetZoom;
    const ix     = W / 2 - iw / 2 + sheetPan.x;
    const iy     = H / 2 - ih / 2 + sheetPan.y;
    const imgX   = (mx - ix) / sheetZoom;
    const imgY   = (my - iy) / sheetZoom;
    sheetZoom    = Math.max(0.2, Math.min(8, sheetZoom * delta));
    const niw    = state.img.naturalWidth  * sheetZoom;
    const nih    = state.img.naturalHeight * sheetZoom;
    const nix    = W / 2 - niw / 2 + sheetPan.x;
    const niy    = H / 2 - nih / 2 + sheetPan.y;
    sheetPan.x  += (mx - (nix + imgX * sheetZoom));
    sheetPan.y  += (my - (niy + imgY * sheetZoom));
    renderSheetViewer();
  }

  function onSheetDblClick(e) {
    // Double-click: reset offset of hit frame
    const rect  = sheetCanvas.getBoundingClientRect();
    const imgPt = screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    const hitFi = hitTestFrame(imgPt.x, imgPt.y);
    if (hitFi >= 0) {
      App.pushUndo('reset offset frame #' + hitFi);
      delete state.frameOffsets[hitFi];
      App.updateFoEditor();
      App.updateInfo();
      Animations.buildStrip();
      Renderer.render();
      renderSheetViewer();
      App.toast('Offset frame #' + hitFi + ' réinitialisé');
    }
  }

  // ── SNAP GRID ──
  function toggleSnap() {
    snapEnabled = !snapEnabled;
    const btn = document.getElementById('snap-btn');
    if (btn) {
      btn.classList.toggle('on', snapEnabled);
      btn.textContent = snapEnabled ? `⊹ SNAP ${snapSize}px` : '⊹ SNAP';
    }
    if (sheetViewerOpen) renderSheetViewer();
  }

  function setSnapSize(val) {
    snapSize = Math.max(1, Math.min(64, parseInt(val) || 8));
    const btn = document.getElementById('snap-btn');
    if (btn && snapEnabled) btn.textContent = `⊹ SNAP ${snapSize}px`;
    if (sheetViewerOpen) renderSheetViewer();
  }

  // ── TOOL SWITCHING ──
  function setTool(mode) {
    activeToolMode = mode;
    const wrap = document.getElementById('canvas-wrap');
    const slotA = document.getElementById('slot-a');

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('on'));
    const btn = document.getElementById('tool-' + mode);
    if (btn) btn.classList.add('on');

    if (mode === 'pan') {
      slotA.style.cursor = 'grab';
      slotA.addEventListener('mousedown', startPanDrag);
      slotA.removeEventListener('mousedown', startSourceDrag);
    } else if (mode === 'source') {
      slotA.style.cursor = 'crosshair';
      slotA.addEventListener('mousedown', startSourceDrag);
      slotA.removeEventListener('mousedown', startPanDrag);
    } else {
      slotA.style.cursor = '';
      slotA.removeEventListener('mousedown', startPanDrag);
      slotA.removeEventListener('mousedown', startSourceDrag);
    }
  }

  // Called by Renderer to get pan offset
  function getPanOffset() { return state.panOffset || { x: 0, y: 0 }; }

  return {
    init,
    setTool,
    toggleSnap,
    setSnapSize,
    openSheetViewer,
    closeSheetViewer,
    renderSheetViewer,
    getPanOffset,
    resetPan,
    applyPanFields,
    updatePanFields
  };

})();
