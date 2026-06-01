// ── RENDERER.JS ──
// Handles all canvas drawing, positioning, grid, onion skin

const Renderer = (() => {

  const cvP  = document.getElementById('c-preview');
  const cvO  = document.getElementById('c-onion');
  const cvG  = document.getElementById('c-grid');
  const cvPB = document.getElementById('c-preview-b');
  const cvFS = document.getElementById('fs-canvas');

  const ctxP  = cvP.getContext('2d');
  const ctxO  = cvO.getContext('2d');
  const ctxG  = cvG.getContext('2d');
  const ctxPB = cvPB.getContext('2d');
  const ctxFS = cvFS.getContext('2d');

  let state = null;
  function init(appState) { state = appState; }

  // ── RECT ──
  function getRect(idx) {
    const { offx, offy, padx, pady, sprW, sprH, cols, frameOffsets, customSize, customW, customH } = state;
    const c  = idx % cols;
    const r  = Math.floor(idx / cols);
    const fo = frameOffsets[idx] || {};
    const fw = customSize && customW > 0 ? customW : (fo.w || sprW);
    const fh = customSize && customH > 0 ? customH : (fo.h || sprH);
    return {
      sx: offx + c * (sprW + padx) + (fo.x || 0),
      sy: offy + r * (sprH + pady) + (fo.y || 0),
      sw: fw, sh: fh
    };
  }

  function getDrawSize(idx) {
    const { sprW, sprH, customSize, customW, customH, frameOffsets } = state;
    const fo = frameOffsets[idx] || {};
    return {
      w: customSize && customW > 0 ? customW : (fo.w || sprW),
      h: customSize && customH > 0 ? customH : (fo.h || sprH)
    };
  }

  // ── DRAW FRAME ──
  function drawFrameTo(idx, ctx, dw, dh) {
    if (!state.img) return;
    const { sx, sy, sw, sh } = getRect(idx);
    ctx.clearRect(0, 0, dw, dh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.img, sx, sy, sw, sh, 0, 0, dw, dh);
  }

  // ── BACKGROUND ──
  function applyBg(el) {
    if (state.bgMode === 'checker') {
      el.style.backgroundImage = [
        'linear-gradient(45deg,#bbb 25%,transparent 25%)',
        'linear-gradient(-45deg,#bbb 25%,transparent 25%)',
        'linear-gradient(45deg,transparent 75%,#bbb 75%)',
        'linear-gradient(-45deg,transparent 75%,#bbb 75%)'
      ].join(',');
      el.style.backgroundSize     = '12px 12px';
      el.style.backgroundPosition = '0 0,0 6px,6px -6px,-6px 0';
      el.style.backgroundColor    = '#fff';
    } else {
      el.style.backgroundImage = '';
      el.style.backgroundColor = state.bgColor;
    }
  }

  // ── POSITION ──
  function positionCanvases() {
    if (!state.img) return;
    const fi           = state.getCurrentFrameIndex();
    const { w: fw, h: fh } = getDrawSize(fi);
    const dw           = fw * state.zoom;
    const dh           = fh * state.zoom;
    const pan          = state.panOffset || { x: 0, y: 0 };

    const slotA = document.getElementById('slot-a');
    const sW    = slotA.offsetWidth  || 600;
    const sH    = slotA.offsetHeight || 400;
    const cx    = sW / 2 - dw / 2 + pan.x;
    const cy    = sH / 2 - dh / 2 + pan.y;

    const abs = 'position:absolute;image-rendering:pixelated;image-rendering:crisp-edges;';
    const pos = `left:${cx}px;top:${cy}px;`;

    cvP.width = fw; cvP.height = fh;
    cvO.width = fw; cvO.height = fh;
    cvG.width = dw; cvG.height = dh;

    const showGrid = document.getElementById('sgrid').checked;
    cvP.style.cssText = `${abs}${pos}width:${dw}px;height:${dh}px;display:block`;
    cvO.style.cssText = `${abs}${pos}width:${dw}px;height:${dh}px;`;
    cvG.style.cssText = `${abs}${pos}pointer-events:none;display:${showGrid ? 'block' : 'none'}`;

    const bg = document.getElementById('cbg');
    bg.style.cssText = `position:absolute;${pos}width:${dw}px;height:${dh}px;display:block;box-shadow:0 0 0 1px var(--border),0 6px 30px rgba(0,0,0,.5);`;
    applyBg(bg);

    // Slot B
    if (state.compareMode) {
      const bFi            = state.getCompareFrameIndex();
      const { w: bfw, h: bfh } = getDrawSize(bFi);
      const bdw            = bfw * state.zoom;
      const bdh            = bfh * state.zoom;
      cvPB.width = bfw; cvPB.height = bfh;
      const slotB = document.getElementById('slot-b');
      const bW    = slotB.offsetWidth  || 600;
      const bH    = slotB.offsetHeight || 400;
      // Slot B shares pan offset
      const bcx   = bW / 2 - bdw / 2 + pan.x;
      const bcy   = bH / 2 - bdh / 2 + pan.y;
      cvPB.style.cssText = `${abs}left:${bcx}px;top:${bcy}px;width:${bdw}px;height:${bdh}px;display:block`;
      const bgB = document.getElementById('cbg-b');
      bgB.style.cssText  = `position:absolute;left:${bcx}px;top:${bcy}px;width:${bdw}px;height:${bdh}px;box-shadow:0 0 0 1px var(--border);`;
      applyBg(bgB);
    }
  }

  // ── RENDER ──
  function render() {
    if (!state.img) return;
    positionCanvases();
    const fi           = state.getCurrentFrameIndex();
    const { w: fw, h: fh } = getDrawSize(fi);
    // ── Draw: under layers → sprite → over layers ──
    ctxP.clearRect(0, 0, fw, fh);
    // Under assets (zIndex < 0)
    if (typeof Assets !== 'undefined' && Assets.layers.length)
      Assets.drawLayers(ctxP, fw, fh, fi, 'under');
    // Sprite
    const { sx, sy, sw, sh } = getRect(fi);
    ctxP.imageSmoothingEnabled = false;
    ctxP.drawImage(state.img, sx, sy, sw, sh, 0, 0, fw, fh);
    // Over assets (zIndex > 0)
    if (typeof Assets !== 'undefined' && Assets.layers.length)
      Assets.drawLayers(ctxP, fw, fh, fi, 'over');

    renderOnion();
    renderGrid();
    if (state.compareMode) {
      const bFi            = state.getCompareFrameIndex();
      const { w: bfw, h: bfh } = getDrawSize(bFi);
      drawFrameTo(bFi, ctxPB, bfw, bfh);
    }
    if (document.getElementById('fs-overlay').classList.contains('show')) renderFullscreen();
    // Keep rulers in sync
    if (typeof Rulers !== 'undefined' && Rulers.enabled) Rulers.redraw();
    // Keep sheet viewer in sync if open
    if (typeof Placement !== 'undefined') Placement.renderSheetViewer();
  }

  // ── ONION ──
  function renderOnion() {
    if (!state.img) return;
    const show    = document.getElementById('sonion').checked;
    const opacity = parseInt(document.getElementById('oop').value) / 100;
    document.getElementById('oopv').textContent = Math.round(opacity * 100) + '%';
    cvO.style.display = show ? 'block' : 'none';
    cvO.style.opacity = opacity;
    if (!show) return;
    const frames  = state.getFrames();
    const prevIdx = (state.curFrame - 1 + frames.length) % frames.length;
    const pfi     = frames[prevIdx] ?? 0;
    const { w, h } = getDrawSize(pfi);
    drawFrameTo(pfi, ctxO, w, h);
  }

  // ── GRID ──
  function renderGrid() {
    if (!state.img) return;
    const show = document.getElementById('sgrid').checked;
    cvG.style.display = show ? 'block' : 'none';
    if (!show) return;

    const z = state.zoom;
    // Don't draw if pixels would be too small to see individual cells
    if (z < 2) {
      // At very low zoom just show a subtle border
      ctxG.clearRect(0, 0, cvG.width, cvG.height);
      ctxG.strokeStyle = 'rgba(124,92,252,0.6)';
      ctxG.lineWidth   = 1;
      ctxG.strokeRect(0.5, 0.5, cvG.width - 1, cvG.height - 1);
      return;
    }

    ctxG.clearRect(0, 0, cvG.width, cvG.height);

    // Adaptive opacity: more transparent at low zoom, more visible at high zoom
    const opacity = Math.min(0.6, 0.15 + (z - 2) * 0.06);
    ctxG.strokeStyle = `rgba(124,92,252,${opacity})`;
    ctxG.lineWidth   = 1;

    // Draw lines snapped to half-pixel for crispness
    for (let x = 0; x <= cvG.width; x += z) {
      const px = Math.round(x) + 0.5;
      ctxG.beginPath(); ctxG.moveTo(px, 0); ctxG.lineTo(px, cvG.height); ctxG.stroke();
    }
    for (let y = 0; y <= cvG.height; y += z) {
      const py = Math.round(y) + 0.5;
      ctxG.beginPath(); ctxG.moveTo(0, py); ctxG.lineTo(cvG.width, py); ctxG.stroke();
    }

    // At high zoom: show pixel coordinates every 4 pixels
    if (z >= 8) {
      ctxG.fillStyle = `rgba(124,92,252,${Math.min(0.7, opacity + 0.1)})`;
      ctxG.font      = `${Math.min(z * 0.4, 10)}px monospace`;
      const step     = z >= 16 ? 1 : (z >= 8 ? 2 : 4);
      const fw       = state.sprW, fh = state.sprH;
      for (let py = 0; py < fh; py += step) {
        for (let px = 0; px < fw; px += step) {
          if (px === 0 || py === 0) continue;
          if (z >= 16) ctxG.fillText(`${px},${py}`, px * z + 2, py * z - 2);
        }
      }
    }
  }

  // ── FULLSCREEN ──
  function renderFullscreen() {
    if (!state.img) return;
    const fi       = state.getCurrentFrameIndex();
    const { w: fw, h: fh } = getDrawSize(fi);
    const scale    = Math.min(window.innerWidth / fw, window.innerHeight / fh, 8);
    cvFS.width     = Math.round(fw * scale);
    cvFS.height    = Math.round(fh * scale);
    ctxFS.imageSmoothingEnabled = false;
    drawFrameTo(fi, ctxFS, cvFS.width, cvFS.height);
  }

  // ── THUMBNAIL ──
  function buildStripThumb(fi, size) {
    const cv  = document.createElement('canvas');
    cv.width  = state.sprW;
    cv.height = state.sprH;
    const sc  = Math.min(size / state.sprW, size / state.sprH);
    cv.style.width  = Math.round(state.sprW * sc) + 'px';
    cv.style.height = Math.round(state.sprH * sc) + 'px';
    drawFrameTo(fi, cv.getContext('2d'), state.sprW, state.sprH);
    return cv;
  }

  // ── EXPORT HELPERS ──
  function getFrameCanvas(fi, scale) {
    const { sw, sh } = getRect(fi);
    const cv  = document.createElement('canvas');
    cv.width  = sw * scale; cv.height = sh * scale;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawFrameTo(fi, ctx, cv.width, cv.height);
    return cv;
  }

  return {
    init, render, renderGrid, renderOnion, renderFullscreen,
    buildStripThumb, getFrameCanvas, getRect, getDrawSize,
    applyBg, positionCanvases, drawFrameTo
  };

})();
