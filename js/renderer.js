// ── RENDERER.JS v2 ──
// Fixed zoom/resize, removed wheel zoom, layers via Assets.drawAll

const Renderer = (() => {

  const cvP  = document.getElementById('c-preview');
  const cvO  = document.getElementById('c-onion');
  const cvG  = document.getElementById('c-grid');
  const cvFS = document.getElementById('fs-canvas');

  const ctxP  = cvP.getContext('2d');
  const ctxO  = cvO.getContext('2d');
  const ctxG  = cvG.getContext('2d');
  const ctxFS = cvFS.getContext('2d');

  let state = null;

  function init(appState) {
    state = appState;
    // ResizeObserver: re-render whenever the slot changes size
    const ro = new ResizeObserver(() => { if (state.img) render(); });
    ro.observe(document.getElementById('slot-a'));
  }

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

  // ── RAW SPRITE DRAW (no layers) ──
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

  // ── POSITION CANVASES ──
  function positionCanvases() {
    if (!state.img) return;
    const fi           = state.getCurrentFrameIndex();
    const { w: fw, h: fh } = getDrawSize(fi);
    const dw           = Math.round(fw * state.zoom);
    const dh           = Math.round(fh * state.zoom);
    const pan          = state.panOffset || { x: 0, y: 0 };

    const slotA = document.getElementById('slot-a');
    const sW    = slotA.clientWidth  || 600;
    const sH    = slotA.clientHeight || 400;
    const cx    = Math.round(sW / 2 - dw / 2 + pan.x);
    const cy    = Math.round(sH / 2 - dh / 2 + pan.y);

    const abs = 'position:absolute;image-rendering:pixelated;image-rendering:crisp-edges;';
    const pos = `left:${cx}px;top:${cy}px;`;

    cvP.width = fw; cvP.height = fh;
    cvO.width = fw; cvO.height = fh;
    cvG.width = dw; cvG.height = dh;

    const showGrid = document.getElementById('sgrid')?.checked;
    cvP.style.cssText = `${abs}${pos}width:${dw}px;height:${dh}px;display:block`;
    cvO.style.cssText = `${abs}${pos}width:${dw}px;height:${dh}px;`;
    cvG.style.cssText = `${abs}${pos}pointer-events:none;display:${showGrid ? 'block' : 'none'}`;

    const bg = document.getElementById('cbg');
    bg.style.cssText = `position:absolute;${pos}width:${dw}px;height:${dh}px;display:block;box-shadow:0 0 0 1px var(--border),0 6px 30px rgba(0,0,0,.5);`;
    applyBg(bg);
  }

  // ── RENDER ──
  function render() {
    if (!state.img) return;
    positionCanvases();
    const fi           = state.getCurrentFrameIndex();
    const { w: fw, h: fh } = getDrawSize(fi);

    // Draw all layers (Assets handles sprite + asset layers in order)
    if (typeof Assets !== 'undefined') {
      Assets.drawAll(ctxP, fw, fh, fi);
    } else {
      drawFrameTo(fi, ctxP, fw, fh);
    }

    renderOnion();
    renderGrid();
    // Draw selection overlay
    if (typeof Assets !== 'undefined') Assets.drawOverlay();
    if (document.getElementById('fs-overlay')?.classList.contains('show')) renderFullscreen();
    if (typeof Rulers    !== 'undefined' && Rulers.enabled)   Rulers.redraw();
    if (typeof Placement !== 'undefined') Placement.renderSheetViewer();
  }

  // ── ONION ──
  function renderOnion() {
    if (!state.img) return;
    const show    = document.getElementById('sonion')?.checked;
    const opacity = parseInt(document.getElementById('oop')?.value || 25) / 100;
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
    const show = document.getElementById('sgrid')?.checked;
    cvG.style.display = show ? 'block' : 'none';
    if (!show) return;

    const z = state.zoom;
    ctxG.clearRect(0, 0, cvG.width, cvG.height);

    if (z < 2) {
      ctxG.strokeStyle = 'rgba(124,92,252,0.6)';
      ctxG.lineWidth   = 1;
      ctxG.strokeRect(0.5, 0.5, cvG.width - 1, cvG.height - 1);
      return;
    }

    const opacity = Math.min(0.6, 0.15 + (z - 2) * 0.06);
    ctxG.strokeStyle = `rgba(124,92,252,${opacity})`;
    ctxG.lineWidth   = 1;

    for (let x = 0; x <= cvG.width; x += z) {
      const px = Math.round(x) + 0.5;
      ctxG.beginPath(); ctxG.moveTo(px, 0); ctxG.lineTo(px, cvG.height); ctxG.stroke();
    }
    for (let y = 0; y <= cvG.height; y += z) {
      const py = Math.round(y) + 0.5;
      ctxG.beginPath(); ctxG.moveTo(0, py); ctxG.lineTo(cvG.width, py); ctxG.stroke();
    }

    if (z >= 16) {
      ctxG.fillStyle = `rgba(124,92,252,${Math.min(0.5, opacity)})`;
      ctxG.font      = `${Math.min(z * 0.35, 9)}px monospace`;
      const fw = state.sprW, fh = state.sprH;
      for (let py = 1; py < fh; py++) {
        for (let px = 1; px < fw; px++) {
          ctxG.fillText(`${px},${py}`, px * z + 2, py * z - 2);
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
    if (typeof Assets !== 'undefined') {
      Assets.drawAll(ctxFS, cvFS.width, cvFS.height, fi);
    } else {
      drawFrameTo(fi, ctxFS, cvFS.width, cvFS.height);
    }
  }

  // ── THUMBNAIL ──
  function buildStripThumb(fi, size) {
    const cv  = document.createElement('canvas');
    const { w: sw, h: sh } = getDrawSize(fi);
    cv.width  = sw; cv.height = sh;
    const sc  = Math.min(size / sw, size / sh);
    cv.style.width  = Math.round(sw * sc) + 'px';
    cv.style.height = Math.round(sh * sc) + 'px';
    drawFrameTo(fi, cv.getContext('2d'), sw, sh);
    return cv;
  }

  // ── EXPORT FRAME (with all layers) ──
  function getFrameCanvas(fi, scale) {
    const { sw, sh } = getRect(fi);
    const W = Math.round(sw * scale), H = Math.round(sh * scale);
    const cv  = document.createElement('canvas');
    cv.width  = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (typeof Assets !== 'undefined') {
      Assets.drawAll(ctx, W, H, fi);
    } else {
      ctx.imageSmoothingEnabled = false;
      drawFrameTo(fi, ctx, W, H);
    }
    return cv;
  }

  return {
    init, render, renderGrid, renderOnion, renderFullscreen,
    buildStripThumb, getFrameCanvas, getRect, getDrawSize,
    applyBg, positionCanvases, drawFrameTo
  };

})();
