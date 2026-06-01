// ── RULERS.JS ──
// Figma-style rulers: fixed on canvas edges, follow pan/zoom,
// crosshair cursor tracker, draggable guides

const Rulers = (() => {

  const RULER_SIZE = 20; // px thickness of each ruler

  let state    = null;
  let enabled  = false;
  let guides   = [];      // [{ axis:'x'|'y', pos: imageSpacePx }]
  let dragging = null;    // { axis, guide|null, startPos }
  let mouseImg = { x: 0, y: 0 }; // cursor in image space

  // Canvas elements (created dynamically)
  let cvRulerH, cvRulerV, cvCorner, cvGuides;
  let ctxRH, ctxRV, ctxCorner, ctxGuides;

  function init(appState) {
    state = appState;
    state.guides = guides;
    buildDOM();
    attachEvents();
  }

  // ── DOM ──
  function buildDOM() {
    const wrap = document.getElementById('ruler-wrap');
    if (!wrap) return;

    // Corner square (top-left)
    cvCorner = document.createElement('canvas');
    cvCorner.id = 'ruler-corner';
    cvCorner.width = RULER_SIZE; cvCorner.height = RULER_SIZE;
    ctxCorner = cvCorner.getContext('2d');

    // Horizontal ruler (top)
    cvRulerH = document.createElement('canvas');
    cvRulerH.id = 'ruler-h';
    ctxRH = cvRulerH.getContext('2d');

    // Vertical ruler (left)
    cvRulerV = document.createElement('canvas');
    cvRulerV.id = 'ruler-v';
    ctxRV = cvRulerV.getContext('2d');

    // Guide overlay (covers the full canvas area)
    cvGuides = document.createElement('canvas');
    cvGuides.id = 'ruler-guides';
    ctxGuides = cvGuides.getContext('2d');

    wrap.appendChild(cvCorner);
    wrap.appendChild(cvRulerH);
    wrap.appendChild(cvRulerV);

    // Guides go inside slot-a, on top of everything
    const slotA = document.getElementById('slot-a');
    slotA.appendChild(cvGuides);
  }

  // ── ENABLE / DISABLE ──
  function setEnabled(val) {
    enabled = val;
    const wrap   = document.getElementById('ruler-wrap');
    const btn    = document.getElementById('rulers-btn');
    const outer  = document.getElementById('canvas-outer');
    if (wrap)  wrap.style.display  = val ? 'grid' : 'none';
    if (btn)   btn.classList.toggle('on', val);
    if (outer) outer.classList.toggle('rulers-on', val);
    // Move ruler canvases into their cells
    if (val) {
      const hCell = document.getElementById('ruler-h-cell');
      const vCell = document.getElementById('ruler-v-cell');
      const cCell = document.getElementById('ruler-corner-cell');
      if (hCell && cvRulerH && !hCell.contains(cvRulerH)) hCell.appendChild(cvRulerH);
      if (vCell && cvRulerV && !vCell.contains(cvRulerV)) vCell.appendChild(cvRulerV);
      if (cCell && cvCorner && !cCell.contains(cvCorner)) cCell.appendChild(cvCorner);
      // Guides canvas stays in slot-a
      const slotA = document.getElementById('slot-a');
      if (slotA && cvGuides && !slotA.contains(cvGuides)) slotA.appendChild(cvGuides);
      slotA.classList.add('slot-a-ruler-active');
      setTimeout(redraw, 50);
    } else {
      const slotA = document.getElementById('slot-a');
      if (slotA) slotA.classList.remove('slot-a-ruler-active');
    }
  }

  function toggle() { setEnabled(!enabled); }

  // ── COORDINATE MAPPING ──
  // Convert canvas-area screen coords → image-space coords
  function screenToImage(sx, sy) {
    if (!state.img) return { x: 0, y: 0 };
    const slotA = document.getElementById('slot-a');
    const pan   = state.panOffset || { x: 0, y: 0 };
    const { w: fw, h: fh } = getDrawSize();
    const dw    = fw * state.zoom;
    const dh    = fh * state.zoom;
    const sW    = slotA.offsetWidth;
    const sH    = slotA.offsetHeight;
    const originX = sW / 2 - dw / 2 + pan.x;
    const originY = sH / 2 - dh / 2 + pan.y;
    return {
      x: (sx - originX) / state.zoom,
      y: (sy - originY) / state.zoom
    };
  }

  function imageToScreen(ix, iy) {
    if (!state.img) return { x: 0, y: 0 };
    const slotA = document.getElementById('slot-a');
    const pan   = state.panOffset || { x: 0, y: 0 };
    const { w: fw, h: fh } = getDrawSize();
    const dw    = fw * state.zoom;
    const dh    = fh * state.zoom;
    const sW    = slotA.offsetWidth;
    const sH    = slotA.offsetHeight;
    const originX = sW / 2 - dw / 2 + pan.x;
    const originY = sH / 2 - dh / 2 + pan.y;
    return {
      x: originX + ix * state.zoom,
      y: originY + iy * state.zoom
    };
  }

  function getDrawSize() {
    if (!state.img) return { w: 1, h: 1 };
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const fo = (state.frameOffsets || {})[fi] || {};
    return {
      w: state.customSize && state.customW > 0 ? state.customW : (fo.w || state.sprW || 1),
      h: state.customSize && state.customH > 0 ? state.customH : (fo.h || state.sprH || 1)
    };
  }

  // ── DRAW ──
  function redraw() {
    if (!enabled) return;
    resizeCanvases();
    drawHorizontal();
    drawVertical();
    drawCorner();
    drawGuides();
  }

  function resizeCanvases() {
    const wrap  = document.getElementById('ruler-wrap');
    const slotA = document.getElementById('slot-a');
    if (!wrap || !slotA) return;

    const totalW = slotA.offsetWidth  + RULER_SIZE;
    const totalH = slotA.offsetHeight + RULER_SIZE;

    // H ruler
    cvRulerH.width  = slotA.offsetWidth;
    cvRulerH.height = RULER_SIZE;
    cvRulerH.style.width  = slotA.offsetWidth + 'px';
    cvRulerH.style.height = RULER_SIZE + 'px';

    // V ruler
    cvRulerV.width  = RULER_SIZE;
    cvRulerV.height = slotA.offsetHeight;
    cvRulerV.style.width  = RULER_SIZE + 'px';
    cvRulerV.style.height = slotA.offsetHeight + 'px';

    // Guides overlay
    cvGuides.width  = slotA.offsetWidth;
    cvGuides.height = slotA.offsetHeight;
    cvGuides.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:15;`;
  }

  function drawRulerBase(ctx, w, h) {
    ctx.fillStyle = '#1a1a26';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5);
    ctx.stroke();
  }

  function drawHorizontal() {
    if (!cvRulerH) return;
    const W = cvRulerH.width, H = cvRulerH.height;
    ctxRH.clearRect(0, 0, W, H);
    drawRulerBase(ctxRH, W, H);

    if (!state.img) return;
    const pan      = state.panOffset || { x: 0, y: 0 };
    const { w: fw } = getDrawSize();
    const dw        = fw * state.zoom;
    const sW        = document.getElementById('slot-a').offsetWidth;
    const originX   = sW / 2 - dw / 2 + pan.x;

    const step  = niceStep(state.zoom);
    const start = Math.floor(-originX / state.zoom / step) * step;
    const end   = Math.ceil((W - originX) / state.zoom / step) * step;

    ctxRH.fillStyle   = '#6666aa';
    ctxRH.font        = '9px monospace';
    ctxRH.textAlign   = 'left';

    for (let px = start; px <= end; px += step) {
      const sx = Math.round(originX + px * state.zoom) + 0.5;
      if (sx < 0 || sx > W) continue;
      const isMajor = px % (step * 5) === 0;
      const tickH   = isMajor ? 10 : 5;
      ctxRH.strokeStyle = isMajor ? 'rgba(150,150,200,0.8)' : 'rgba(100,100,150,0.5)';
      ctxRH.lineWidth   = 1;
      ctxRH.beginPath();
      ctxRH.moveTo(sx, H); ctxRH.lineTo(sx, H - tickH);
      ctxRH.stroke();
      if (isMajor && state.zoom >= 1) {
        ctxRH.fillText(px, sx + 2, H - 11);
      }
    }

    // Cursor crosshair line
    const curX = Math.round(originX + mouseImg.x * state.zoom) + 0.5;
    if (curX >= 0 && curX <= W) {
      ctxRH.strokeStyle = 'rgba(252,92,124,0.9)';
      ctxRH.lineWidth   = 1;
      ctxRH.beginPath(); ctxRH.moveTo(curX, 0); ctxRH.lineTo(curX, H); ctxRH.stroke();
    }

    // Current pixel label
    ctxRH.fillStyle = '#fc5c7c';
    ctxRH.font      = '9px monospace';
    ctxRH.fillText(Math.round(mouseImg.x), Math.max(2, curX + 2), 9);

    // Guide indicators on ruler
    guides.filter(g => g.axis === 'x').forEach(g => {
      const gx = Math.round(originX + g.pos * state.zoom) + 0.5;
      if (gx < 0 || gx > W) return;
      ctxRH.strokeStyle = 'rgba(92,252,154,0.9)';
      ctxRH.lineWidth   = 2;
      ctxRH.beginPath(); ctxRH.moveTo(gx, H); ctxRH.lineTo(gx, H - H); ctxRH.stroke();
    });
  }

  function drawVertical() {
    if (!cvRulerV) return;
    const W = cvRulerV.width, H = cvRulerV.height;
    ctxRV.clearRect(0, 0, W, H);

    // Draw base (rotated: left border)
    ctxRV.fillStyle = '#1a1a26';
    ctxRV.fillRect(0, 0, W, H);
    ctxRV.strokeStyle = '#2a2a3a';
    ctxRV.lineWidth   = 1;
    ctxRV.beginPath();
    ctxRV.moveTo(W - 0.5, 0); ctxRV.lineTo(W - 0.5, H);
    ctxRV.stroke();

    if (!state.img) return;
    const pan      = state.panOffset || { x: 0, y: 0 };
    const { h: fh } = getDrawSize();
    const dh        = fh * state.zoom;
    const sH        = document.getElementById('slot-a').offsetHeight;
    const originY   = sH / 2 - dh / 2 + pan.y;

    const step  = niceStep(state.zoom);
    const start = Math.floor(-originY / state.zoom / step) * step;
    const end   = Math.ceil((H - originY) / state.zoom / step) * step;

    for (let py = start; py <= end; py += step) {
      const sy = Math.round(originY + py * state.zoom) + 0.5;
      if (sy < 0 || sy > H) continue;
      const isMajor = py % (step * 5) === 0;
      const tickW   = isMajor ? 10 : 5;
      ctxRV.strokeStyle = isMajor ? 'rgba(150,150,200,0.8)' : 'rgba(100,100,150,0.5)';
      ctxRV.lineWidth   = 1;
      ctxRV.beginPath();
      ctxRV.moveTo(W, sy); ctxRV.lineTo(W - tickW, sy);
      ctxRV.stroke();
      if (isMajor && state.zoom >= 1) {
        ctxRV.save();
        ctxRV.translate(W - 11, sy - 2);
        ctxRV.rotate(-Math.PI / 2);
        ctxRV.fillStyle = '#6666aa';
        ctxRV.font      = '9px monospace';
        ctxRV.textAlign = 'left';
        ctxRV.fillText(py, 0, 0);
        ctxRV.restore();
      }
    }

    // Cursor line
    const curY = Math.round(originY + mouseImg.y * state.zoom) + 0.5;
    if (curY >= 0 && curY <= H) {
      ctxRV.strokeStyle = 'rgba(252,92,124,0.9)';
      ctxRV.lineWidth   = 1;
      ctxRV.beginPath(); ctxRV.moveTo(0, curY); ctxRV.lineTo(W, curY); ctxRV.stroke();
    }

    // Current pixel label
    ctxRV.save();
    ctxRV.translate(W - 11, Math.max(20, curY - 2));
    ctxRV.rotate(-Math.PI / 2);
    ctxRV.fillStyle = '#fc5c7c';
    ctxRV.font      = '9px monospace';
    ctxRV.fillText(Math.round(mouseImg.y), 0, 0);
    ctxRV.restore();

    // Guide indicators
    guides.filter(g => g.axis === 'y').forEach(g => {
      const gy = Math.round(originY + g.pos * state.zoom) + 0.5;
      if (gy < 0 || gy > H) return;
      ctxRV.strokeStyle = 'rgba(92,252,154,0.9)';
      ctxRV.lineWidth   = 2;
      ctxRV.beginPath(); ctxRV.moveTo(0, gy); ctxRV.lineTo(W, gy); ctxRV.stroke();
    });
  }

  function drawCorner() {
    if (!cvCorner) return;
    cvCorner.width = RULER_SIZE; cvCorner.height = RULER_SIZE;
    ctxCorner.fillStyle = '#1a1a26';
    ctxCorner.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
    ctxCorner.strokeStyle = '#2a2a3a';
    ctxCorner.lineWidth = 1;
    ctxCorner.strokeRect(0.5, 0.5, RULER_SIZE - 1, RULER_SIZE - 1);
    // small cross icon
    ctxCorner.strokeStyle = '#555577';
    ctxCorner.lineWidth = 1;
    const c = RULER_SIZE / 2;
    ctxCorner.beginPath();
    ctxCorner.moveTo(c - 3, c); ctxCorner.lineTo(c + 3, c);
    ctxCorner.moveTo(c, c - 3); ctxCorner.lineTo(c, c + 3);
    ctxCorner.stroke();
  }

  function drawGuides() {
    if (!cvGuides || !state.img) return;
    const W = cvGuides.width, H = cvGuides.height;
    ctxGuides.clearRect(0, 0, W, H);

    const pan     = state.panOffset || { x: 0, y: 0 };
    const { w: fw, h: fh } = getDrawSize();
    const dw      = fw * state.zoom;
    const dh      = fh * state.zoom;
    const sW      = document.getElementById('slot-a').offsetWidth;
    const sH      = document.getElementById('slot-a').offsetHeight;
    const originX = sW / 2 - dw / 2 + pan.x;
    const originY = sH / 2 - dh / 2 + pan.y;

    guides.forEach((g, i) => {
      const isHovered = dragging && dragging.guideIdx === i;
      const color     = isHovered ? 'rgba(252,176,92,0.95)' : 'rgba(92,252,154,0.75)';

      if (g.axis === 'x') {
        const sx = Math.round(originX + g.pos * state.zoom) + 0.5;
        if (sx < -10 || sx > W + 10) return;
        ctxGuides.strokeStyle = color;
        ctxGuides.lineWidth   = 1;
        ctxGuides.setLineDash([4, 3]);
        ctxGuides.beginPath(); ctxGuides.moveTo(sx, 0); ctxGuides.lineTo(sx, H); ctxGuides.stroke();
        ctxGuides.setLineDash([]);
        // Label
        ctxGuides.fillStyle = color;
        ctxGuides.font      = '9px monospace';
        ctxGuides.fillText(Math.round(g.pos) + 'px', sx + 3, 12);
      } else {
        const sy = Math.round(originY + g.pos * state.zoom) + 0.5;
        if (sy < -10 || sy > H + 10) return;
        ctxGuides.strokeStyle = color;
        ctxGuides.lineWidth   = 1;
        ctxGuides.setLineDash([4, 3]);
        ctxGuides.beginPath(); ctxGuides.moveTo(0, sy); ctxGuides.lineTo(W, sy); ctxGuides.stroke();
        ctxGuides.setLineDash([]);
        ctxGuides.fillStyle = color;
        ctxGuides.font      = '9px monospace';
        ctxGuides.fillText(Math.round(g.pos) + 'px', 4, sy - 3);
      }
    });

    // Active drag preview
    if (dragging && dragging.axis && !dragging.guideIdx && dragging.guideIdx !== 0) {
      const pos = dragging.currentPos;
      ctxGuides.strokeStyle = 'rgba(252,176,92,0.9)';
      ctxGuides.lineWidth   = 1;
      ctxGuides.setLineDash([4, 3]);
      if (dragging.axis === 'x') {
        const sx = Math.round(originX + pos * state.zoom) + 0.5;
        ctxGuides.beginPath(); ctxGuides.moveTo(sx, 0); ctxGuides.lineTo(sx, H); ctxGuides.stroke();
        ctxGuides.fillStyle = 'rgba(252,176,92,0.9)';
        ctxGuides.font = '9px monospace';
        ctxGuides.setLineDash([]);
        ctxGuides.fillText(Math.round(pos) + 'px', sx + 3, 12);
      } else {
        const sy = Math.round(originY + pos * state.zoom) + 0.5;
        ctxGuides.beginPath(); ctxGuides.moveTo(0, sy); ctxGuides.lineTo(W, sy); ctxGuides.stroke();
        ctxGuides.setLineDash([]);
        ctxGuides.fillStyle = 'rgba(252,176,92,0.9)';
        ctxGuides.font = '9px monospace';
        ctxGuides.fillText(Math.round(pos) + 'px', 4, sy - 3);
      }
    }
  }

  // ── NICE TICK STEP ──
  function niceStep(zoom) {
    // Target ~40px between major ticks in screen space
    const rawStep = 40 / zoom;
    const nice    = [1, 2, 4, 5, 8, 10, 16, 20, 32, 50, 64, 100, 128, 256];
    for (const s of nice) { if (s >= rawStep) return s; }
    return 256;
  }

  // ── EVENTS ──
  function attachEvents() {
    // Horizontal ruler: drag to create vertical guide (axis='x')
    const hWrap = document.getElementById('ruler-h-wrap');
    const vWrap = document.getElementById('ruler-v-wrap');

    // We listen on the ruler canvases after they're built
    setTimeout(() => {
      if (cvRulerH) {
        cvRulerH.addEventListener('mousedown', e => startDragFromRuler(e, 'x'));
        cvRulerH.style.cursor = 'col-resize';
      }
      if (cvRulerV) {
        cvRulerV.addEventListener('mousedown', e => startDragFromRuler(e, 'y'));
        cvRulerV.style.cursor = 'row-resize';
      }
    }, 100);

    // Canvas area: hover for crosshair + guide dragging
    const slotA = document.getElementById('slot-a');
    slotA.addEventListener('mousemove', onCanvasMouseMove);
    slotA.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup',   onDocMouseUp);

    // Corner: clear all guides on click
    setTimeout(() => {
      if (cvCorner) {
        cvCorner.addEventListener('click', clearGuides);
        cvCorner.style.cursor = 'pointer';
        cvCorner.title = 'Cliquer pour effacer tous les guides';
      }
    }, 100);
  }

  // ── DRAG FROM RULER ──
  function startDragFromRuler(e, axis) {
    if (!enabled || !state.img) return;
    const rect    = (axis === 'x' ? cvRulerH : cvRulerV).getBoundingClientRect();
    const sx      = e.clientX - rect.left;
    const sy      = e.clientY - rect.top;
    const imgPt   = screenToImage(sx, sy);
    const pos     = axis === 'x' ? imgPt.x : imgPt.y;
    dragging = { axis, newGuide: true, currentPos: pos, startClient: { x: e.clientX, y: e.clientY } };
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    e.preventDefault();
  }

  // ── CANVAS MOUSE ──
  function onCanvasMouseMove(e) {
    if (!enabled) return;
    const rect  = document.getElementById('slot-a').getBoundingClientRect();
    const sx    = e.clientX - rect.left;
    const sy    = e.clientY - rect.top;
    const imgPt = screenToImage(sx, sy);
    mouseImg    = { x: imgPt.x, y: imgPt.y };

    // Update status bar
    const el = document.getElementById('ruler-pos');
    if (el) el.textContent = `x:${Math.round(imgPt.x)} y:${Math.round(imgPt.y)}`;

    // Hover guide detection → change cursor
    const hovered = hitGuide(sx, sy);
    if (!dragging) {
      document.getElementById('slot-a').style.cursor = hovered >= 0
        ? (guides[hovered].axis === 'x' ? 'col-resize' : 'row-resize')
        : '';
    }

    redraw();
  }

  function onCanvasMouseDown(e) {
    if (!enabled || !state.img) return;
    const rect  = document.getElementById('slot-a').getBoundingClientRect();
    const sx    = e.clientX - rect.left;
    const sy    = e.clientY - rect.top;
    const hi    = hitGuide(sx, sy);
    if (hi >= 0) {
      dragging = { guideIdx: hi, axis: guides[hi].axis, newGuide: false };
      document.body.style.cursor = guides[hi].axis === 'x' ? 'col-resize' : 'row-resize';
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // ── DOC MOUSE ──
  function onDocMouseMove(e) {
    if (!dragging || !enabled) return;
    const slotA = document.getElementById('slot-a');
    const rect  = slotA.getBoundingClientRect();
    const sx    = e.clientX - rect.left;
    const sy    = e.clientY - rect.top;
    const imgPt = screenToImage(sx, sy);
    const pos   = dragging.axis === 'x' ? imgPt.x : imgPt.y;

    // Snap
    const snapped = snapPos(pos, dragging.axis);

    if (dragging.newGuide) {
      dragging.currentPos = snapped;
    } else if (dragging.guideIdx >= 0) {
      guides[dragging.guideIdx].pos = snapped;
    }

    // Delete if dragged back onto ruler
    if (dragging.axis === 'x' && e.clientY < rect.top) {
      document.body.style.cursor = 'no-drop';
    } else if (dragging.axis === 'y' && e.clientX < rect.left) {
      document.body.style.cursor = 'no-drop';
    } else {
      document.body.style.cursor = dragging.axis === 'x' ? 'col-resize' : 'row-resize';
    }

    redraw();
  }

  function onDocMouseUp(e) {
    if (!dragging || !enabled) return;
    const slotA = document.getElementById('slot-a');
    const rect  = slotA.getBoundingClientRect();

    if (dragging.newGuide) {
      // Add guide if dropped in canvas area
      if (e.clientX >= rect.left && e.clientY >= rect.top) {
        const sx    = e.clientX - rect.left;
        const sy    = e.clientY - rect.top;
        const imgPt = screenToImage(sx, sy);
        const pos   = snapPos(dragging.axis === 'x' ? imgPt.x : imgPt.y, dragging.axis);
        guides.push({ axis: dragging.axis, pos });
        App.toast(`Guide ${dragging.axis === 'x' ? 'vertical' : 'horizontal'} à ${Math.round(pos)}px`, '');
      }
    } else if (dragging.guideIdx >= 0) {
      // Delete if dragged off canvas
      if (dragging.axis === 'x' && e.clientY < rect.top) {
        guides.splice(dragging.guideIdx, 1);
        App.toast('Guide supprimé');
      } else if (dragging.axis === 'y' && e.clientX < rect.left) {
        guides.splice(dragging.guideIdx, 1);
        App.toast('Guide supprimé');
      }
    }

    dragging = null;
    document.body.style.cursor = '';
    redraw();
  }

  // ── HIT TEST GUIDE ──
  function hitGuide(sx, sy) {
    if (!state.img) return -1;
    const pan     = state.panOffset || { x: 0, y: 0 };
    const { w: fw, h: fh } = getDrawSize();
    const dw      = fw * state.zoom;
    const dh      = fh * state.zoom;
    const slotA   = document.getElementById('slot-a');
    const originX = slotA.offsetWidth  / 2 - dw / 2 + pan.x;
    const originY = slotA.offsetHeight / 2 - dh / 2 + pan.y;
    const THRESH  = 5;
    for (let i = 0; i < guides.length; i++) {
      const g = guides[i];
      if (g.axis === 'x') {
        const gx = originX + g.pos * state.zoom;
        if (Math.abs(sx - gx) <= THRESH) return i;
      } else {
        const gy = originY + g.pos * state.zoom;
        if (Math.abs(sy - gy) <= THRESH) return i;
      }
    }
    return -1;
  }

  // ── SNAP ──
  function snapPos(pos, axis) {
    if (!state.snapEnabled) return pos;
    const sz = state.snapSize || 8;
    return Math.round(pos / sz) * sz;
  }

  // ── GUIDES MANAGEMENT ──
  function clearGuides() {
    if (!guides.length) return;
    guides.splice(0, guides.length);
    App.toast('Guides effacés');
    redraw();
  }

  function addGuide(axis, pos) {
    guides.push({ axis, pos });
    redraw();
  }

  function getGuides() { return guides; }

  function setGuides(arr) {
    guides.splice(0, guides.length, ...arr);
    redraw();
  }

  return {
    init,
    toggle,
    setEnabled,
    redraw,
    clearGuides,
    addGuide,
    getGuides,
    setGuides,
    get enabled() { return enabled; }
  };

})();
