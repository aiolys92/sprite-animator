// ── ASSETS.JS v3 ──
// Clean layer system with working canvas drag + resize handles

const Assets = (() => {

  const SPRITE_ID = 0;

  let state      = null;
  let layers     = [];
  let frameProps = {};   // { layerId: { fi: { x,y,scale,scaleX,scaleY,opacity,visible } } }
  let selectedId = null;
  let nextId     = 1;
  let undoCb     = null;

  // ── UNDO ──
  function setUndoCallback(cb) { undoCb = cb; }
  function pushUndo(desc) { if (undoCb) undoCb(desc); }

  // ── INIT ──
  function init(appState) {
    state = appState;
    layers = [{
      id: SPRITE_ID, type: 'sprite', name: 'Sprite',
      img: null, dataUrl: null,
      x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1,
      opacity: 1, visible: true, blendMode: 'source-over',
      mode: 'global', frameEnabled: {}, order: 0
    }];
    selectedId = SPRITE_ID;
    renderLayerList();
  }

  // ── CRUD ──
  function addLayer(dataUrl, name) {
    pushUndo('ajout calque');
    const img = new Image();
    img.onload = () => {
      const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      const layer = {
        id: nextId++, type: 'asset',
        name: name || ('asset_' + nextId),
        img, dataUrl,
        x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1,
        opacity: 1, visible: true, blendMode: 'source-over',
        mode: 'frame',
        frameEnabled: { [fi]: true },
        order: layers.length
      };
      layers.unshift(layer);
      recomputeOrder();
      selectedId = layer.id;
      renderLayerList();
      syncPropsPanel();
      Renderer.render();
      App.toast('Calque ajouté — frame #' + fi, 'ok');
    };
    img.src = dataUrl;
  }

  function removeLayer(id) {
    if (id === SPRITE_ID) return;
    pushUndo('suppression calque');
    layers = layers.filter(l => l.id !== id);
    delete frameProps[id];
    if (selectedId === id) selectedId = SPRITE_ID;
    recomputeOrder();
    renderLayerList();
    syncPropsPanel();
    Renderer.render();
  }

  function recomputeOrder() { layers.forEach((l, i) => l.order = i); }
  function getLayer(id) { return layers.find(l => l.id === id); }

  // ── EFFECTIVE PROPS ──
  function ep(layerId, fi) {
    const l = getLayer(layerId);
    if (!l) return null;
    const ov = (frameProps[layerId] || {})[fi] || {};
    const visible = l.mode === 'frame'
      ? !!(l.frameEnabled[fi])
      : (ov.visible !== undefined ? ov.visible : l.visible);
    return {
      x:       ov.x       !== undefined ? ov.x       : l.x,
      y:       ov.y       !== undefined ? ov.y       : l.y,
      scale:   ov.scale   !== undefined ? ov.scale   : l.scale,
      scaleX:  ov.scaleX  !== undefined ? ov.scaleX  : l.scaleX,
      scaleY:  ov.scaleY  !== undefined ? ov.scaleY  : l.scaleY,
      opacity: ov.opacity !== undefined ? ov.opacity : l.opacity,
      blendMode: l.blendMode,
      visible,
      hasOverride: Object.keys(ov).length > 0
    };
  }

  function hasOverride(layerId, fi) {
    return !!(frameProps[layerId]?.[fi] && Object.keys(frameProps[layerId][fi]).length);
  }

  // Write a prop — always as frame override on current frame
  function setFrameProp(layerId, fi, key, value) {
    if (!frameProps[layerId]) frameProps[layerId] = {};
    if (!frameProps[layerId][fi]) frameProps[layerId][fi] = {};
    frameProps[layerId][fi][key] = value;
  }

  function setProp(layerId, key, value, perFrame) {
    const l = getLayer(layerId);
    if (!l) return;
    if (perFrame && layerId !== SPRITE_ID) {
      const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      setFrameProp(layerId, fi, key, value);
    } else {
      l[key] = value;
    }
    renderLayerList();
    syncPropsPanel();
    Renderer.render();
  }

  function clearFrameOverride(layerId) {
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    if (frameProps[layerId]) delete frameProps[layerId][fi];
    syncPropsPanel(); renderLayerList(); Renderer.render();
    App.toast('Override frame supprimé');
  }

  function copyFrameToAll(layerId) {
    const fi  = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const src = (frameProps[layerId] || {})[fi];
    if (!src) { App.toast('Aucun override sur cette frame', 'err'); return; }
    for (let i = 0; i < (state.totalF || 1); i++) {
      if (i === fi) continue;
      setFrameProp(layerId, i, 'x', src.x);
      setFrameProp(layerId, i, 'y', src.y);
      if (src.scale   !== undefined) setFrameProp(layerId, i, 'scale',   src.scale);
      if (src.scaleX  !== undefined) setFrameProp(layerId, i, 'scaleX',  src.scaleX);
      if (src.scaleY  !== undefined) setFrameProp(layerId, i, 'scaleY',  src.scaleY);
      if (src.opacity !== undefined) setFrameProp(layerId, i, 'opacity', src.opacity);
    }
    App.toast('Propriétés copiées sur toutes les frames', 'ok');
    Renderer.render();
  }

  function toggleFrameEnable(layerId, fi) {
    const l = getLayer(layerId);
    if (!l || l.mode !== 'frame') return;
    l.frameEnabled[fi] = !l.frameEnabled[fi];
    renderLayerList(); Renderer.render();
  }

  // ── DRAW ──
  function drawAll(ctx, fw, fh, fi) {
    ctx.clearRect(0, 0, fw, fh);
    [...layers].reverse().forEach(layer => {
      layer.type === 'sprite'
        ? drawSpriteLayer(ctx, fw, fh, fi)
        : drawAssetLayer(ctx, fw, fh, fi, layer);
    });
  }

  function drawSpriteLayer(ctx, fw, fh, fi) {
    if (!state.img) return;
    const p = ep(SPRITE_ID, fi);
    if (!p || !p.visible) return;
    const { sx, sy, sw, sh } = Renderer.getRect(fi);
    ctx.save();
    ctx.globalAlpha              = Math.max(0, Math.min(1, p.opacity));
    ctx.globalCompositeOperation = getLayer(SPRITE_ID).blendMode || 'source-over';
    ctx.imageSmoothingEnabled    = false;
    ctx.drawImage(state.img, sx, sy, sw, sh,
      p.x * fw / (state.sprW || 1),
      p.y * fh / (state.sprH || 1),
      fw * p.scaleX, fh * p.scaleY);
    ctx.restore();
  }

  function drawAssetLayer(ctx, fw, fh, fi, layer) {
    if (!layer.img) return;
    const p = ep(layer.id, fi);
    if (!p || !p.visible) return;
    // x,y are in SPRITE pixels → convert to canvas pixels
    const px = p.x * fw / (state.sprW || fw);
    const py = p.y * fh / (state.sprH || fh);
    // asset size in canvas pixels
    const aw = layer.img.naturalWidth  * p.scale * p.scaleX * fw / (state.sprW || fw);
    const ah = layer.img.naturalHeight * p.scale * p.scaleY * fh / (state.sprH || fh);
    ctx.save();
    ctx.globalAlpha              = Math.max(0, Math.min(1, p.opacity));
    ctx.globalCompositeOperation = p.blendMode || 'source-over';
    ctx.imageSmoothingEnabled    = false;
    ctx.drawImage(layer.img, px, py, aw, ah);
    ctx.restore();
  }

  // ── COORDINATE HELPERS ──
  // Convert screen coords (relative to window) → sprite-space coords (0..sprW, 0..sprH)
  function screenToSprite(screenX, screenY) {
    const slotA   = document.getElementById('slot-a');
    const rect    = slotA.getBoundingClientRect();
    const sx      = screenX - rect.left;
    const sy      = screenY - rect.top;
    const pan     = state.panOffset || { x: 0, y: 0 };
    const fi      = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const { w: fw, h: fh } = Renderer.getDrawSize(fi);
    const dw      = fw * state.zoom;
    const dh      = fh * state.zoom;
    const originX = slotA.clientWidth  / 2 - dw / 2 + pan.x;
    const originY = slotA.clientHeight / 2 - dh / 2 + pan.y;
    // canvas pixel coords
    const cpx = (sx - originX) / state.zoom;
    const cpy = (sy - originY) / state.zoom;
    // convert canvas pixels → sprite pixels
    return {
      x: cpx * (state.sprW || fw) / fw,
      y: cpy * (state.sprH || fh) / fh
    };
  }

  // ── HIT TEST (in sprite-space) ──
  function hitTest(spX, spY, fi) {
    for (const layer of layers) {
      if (layer.type === 'sprite' || !layer.img) continue;
      const p  = ep(layer.id, fi);
      if (!p || !p.visible) continue;
      const aw = layer.img.naturalWidth  * p.scale * p.scaleX;
      const ah = layer.img.naturalHeight * p.scale * p.scaleY;
      if (spX >= p.x && spX <= p.x + aw && spY >= p.y && spY <= p.y + ah) {
        return layer.id;
      }
    }
    return null;
  }

  // ── CANVAS DRAG (move + resize) ──
  // Drag state: { type:'move'|'resize', layerId, fi, startX, startY, origX, origY, origScale, origScaleX, origScaleY, corner }
  let activeDrag = null;

  // Convert sprite-space → screen for overlay drawing
  function spriteToScreen(spX, spY) {
    const slotA   = document.getElementById('slot-a');
    const rect    = slotA.getBoundingClientRect();
    const pan     = state.panOffset || { x: 0, y: 0 };
    const fi      = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const { w: fw, h: fh } = Renderer.getDrawSize(fi);
    const dw      = fw * state.zoom;
    const dh      = fh * state.zoom;
    const originX = slotA.clientWidth  / 2 - dw / 2 + pan.x;
    const originY = slotA.clientHeight / 2 - dh / 2 + pan.y;
    const cpx = spX * fw / (state.sprW || fw);
    const cpy = spY * fh / (state.sprH || fh);
    return {
      x: rect.left + originX + cpx * state.zoom,
      y: rect.top  + originY + cpy * state.zoom
    };
  }

  // Get asset bounding box on screen {x,y,w,h}
  function getAssetScreenBox(layerId, fi) {
    const layer = getLayer(layerId);
    if (!layer || !layer.img) return null;
    const p  = ep(layerId, fi);
    if (!p)  return null;
    const aw = layer.img.naturalWidth  * p.scale * p.scaleX;
    const ah = layer.img.naturalHeight * p.scale * p.scaleY;
    const tl = spriteToScreen(p.x, p.y);
    const br = spriteToScreen(p.x + aw, p.y + ah);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y,
             spX: p.x, spY: p.y, spW: aw, spH: ah };
  }

  const HANDLE_SIZE = 8;
  const HANDLE_PADDING = 4;

  // Returns corner hit: 'tl','tr','bl','br' or null
  function hitTestHandles(screenX, screenY, layerId, fi) {
    const box = getAssetScreenBox(layerId, fi);
    if (!box) return null;
    const corners = {
      tl: { x: box.x - HANDLE_PADDING, y: box.y - HANDLE_PADDING },
      tr: { x: box.x + box.w + HANDLE_PADDING - HANDLE_SIZE, y: box.y - HANDLE_PADDING },
      bl: { x: box.x - HANDLE_PADDING, y: box.y + box.h + HANDLE_PADDING - HANDLE_SIZE },
      br: { x: box.x + box.w + HANDLE_PADDING - HANDLE_SIZE, y: box.y + box.h + HANDLE_PADDING - HANDLE_SIZE }
    };
    for (const [corner, pos] of Object.entries(corners)) {
      if (screenX >= pos.x && screenX <= pos.x + HANDLE_SIZE &&
          screenY >= pos.y && screenY <= pos.y + HANDLE_SIZE) {
        return corner;
      }
    }
    return null;
  }

  // ── ATTACH CANVAS EVENTS ──
  function attachCanvasEvents() {
    const slotA = document.getElementById('slot-a');
    if (!slotA) return;
    slotA.addEventListener('mousemove', onCanvasMove);
    slotA.addEventListener('mousedown', onCanvasDown);
  }

  function getActiveTool() {
    const btn = document.querySelector('.tool-btn.on');
    return btn ? btn.id : '';
  }

  function onCanvasMove(e) {
    if (activeDrag) return;
    if (!state.img || layers.length <= 1) return;
    const tool = getActiveTool();
    if (tool === 'tool-pan' || tool === 'tool-source') return;

    const fi     = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const slotA  = document.getElementById('slot-a');

    // Check resize handles on selected layer first
    if (selectedId !== null && selectedId !== SPRITE_ID) {
      const corner = hitTestHandles(e.clientX, e.clientY, selectedId, fi);
      if (corner) {
        const cursors = { tl:'nw-resize', tr:'ne-resize', bl:'sw-resize', br:'se-resize' };
        slotA.style.cursor = cursors[corner];
        return;
      }
    }

    // Check asset hit
    const sp    = screenToSprite(e.clientX, e.clientY);
    const hitId = hitTest(sp.x, sp.y, fi);
    slotA.style.cursor = hitId !== null ? 'grab' : '';

    if (hitId !== null) {
      const layer = getLayer(hitId);
      document.getElementById('sframe').textContent =
        'frame: ' + fi + ' · 📌 ' + (layer ? layer.name : '');
    }
  }

  function onCanvasDown(e) {
    if (e.button !== 0) return;
    if (!state.img || layers.length <= 1) return;
    const tool = getActiveTool();
    if (tool === 'tool-pan' || tool === 'tool-source') return;

    const fi    = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const slotA = document.getElementById('slot-a');

    // 1. Try resize handle on selected layer
    if (selectedId !== null && selectedId !== SPRITE_ID) {
      const corner = hitTestHandles(e.clientX, e.clientY, selectedId, fi);
      if (corner) {
        const layer = getLayer(selectedId);
        const p     = ep(selectedId, fi);
        activeDrag = {
          type: 'resize', layerId: selectedId, fi, corner,
          startX: e.clientX, startY: e.clientY,
          origScale:  p.scale, origScaleX: p.scaleX, origScaleY: p.scaleY,
          origX: p.x, origY: p.y,
          origImgW: layer.img ? layer.img.naturalWidth  * p.scale * p.scaleX : 1,
          origImgH: layer.img ? layer.img.naturalHeight * p.scale * p.scaleY : 1,
        };
        startDragListeners();
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }

    // 2. Try move on any visible asset
    const sp    = screenToSprite(e.clientX, e.clientY);
    const hitId = hitTest(sp.x, sp.y, fi);
    if (hitId === null) return;

    const p = ep(hitId, fi);
    selectedId = hitId;
    renderLayerList();
    syncPropsPanel();

    activeDrag = {
      type: 'move', layerId: hitId, fi,
      startX: e.clientX, startY: e.clientY,
      origX: p.x, origY: p.y
    };
    slotA.style.cursor = 'grabbing';
    startDragListeners();
    e.preventDefault(); e.stopPropagation();
  }

  function startDragListeners() {
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragUp);
  }

  function onDragMove(e) {
    if (!activeDrag) return;
    const { type, layerId, fi } = activeDrag;

    if (type === 'move') {
      // Delta in screen px → sprite px
      const dxS = (e.clientX - activeDrag.startX) / state.zoom;
      const dyS = (e.clientY - activeDrag.startY) / state.zoom;
      const { w: fw, h: fh } = Renderer.getDrawSize(fi);
      const dx = dxS * (state.sprW || fw) / fw;
      const dy = dyS * (state.sprH || fh) / fh;
      const newX = Math.round(activeDrag.origX + dx);
      const newY = Math.round(activeDrag.origY + dy);
      setFrameProp(layerId, fi, 'x', newX);
      setFrameProp(layerId, fi, 'y', newY);
      // sync fields
      const fx = document.getElementById('ap-x'); if (fx) fx.value = newX;
      const fy = document.getElementById('ap-y'); if (fy) fy.value = newY;

    } else if (type === 'resize') {
      const layer   = getLayer(layerId);
      if (!layer?.img) return;
      const { corner, origImgW, origImgH } = activeDrag;
      const { w: fw, h: fh } = Renderer.getDrawSize(fi);

      // Delta in screen → sprite pixels
      const dxS  = (e.clientX - activeDrag.startX) / state.zoom;
      const dyS  = (e.clientY - activeDrag.startY) / state.zoom;
      const dxSp = dxS * (state.sprW || fw) / fw;
      const dySp = dyS * (state.sprH || fh) / fh;

      // New size based on corner
      let newW = origImgW, newH = origImgH;
      let newX = activeDrag.origX, newY = activeDrag.origY;

      if (corner === 'br') { newW = Math.max(4, origImgW + dxSp); newH = Math.max(4, origImgH + dySp); }
      if (corner === 'bl') { newW = Math.max(4, origImgW - dxSp); newH = Math.max(4, origImgH + dySp); newX = activeDrag.origX + (origImgW - newW); }
      if (corner === 'tr') { newW = Math.max(4, origImgW + dxSp); newH = Math.max(4, origImgH - dySp); newY = activeDrag.origY + (origImgH - newH); }
      if (corner === 'tl') { newW = Math.max(4, origImgW - dxSp); newH = Math.max(4, origImgH - dySp); newX = activeDrag.origX + (origImgW - newW); newY = activeDrag.origY + (origImgH - newH); }

      // Maintain aspect ratio if shift held
      if (e.shiftKey) {
        const ratio = layer.img.naturalWidth / layer.img.naturalHeight;
        newH = newW / ratio;
        if (corner === 'bl' || corner === 'tl') newY = activeDrag.origY + (origImgH - newH);
      }

      // Convert back to scale values
      const newScale = newW / layer.img.naturalWidth;
      setFrameProp(layerId, fi, 'scale',  newScale);
      setFrameProp(layerId, fi, 'scaleX', 1);
      setFrameProp(layerId, fi, 'scaleY', newH / (layer.img.naturalHeight * newScale));
      setFrameProp(layerId, fi, 'x', Math.round(newX));
      setFrameProp(layerId, fi, 'y', Math.round(newY));

      // Sync fields
      const fs = document.getElementById('ap-scale');
      if (fs) { fs.value = newScale.toFixed(3); document.getElementById('ap-scale-v').textContent = Math.round(newScale*100)+'%'; }
      const fx = document.getElementById('ap-x'); if (fx) fx.value = Math.round(newX);
      const fy = document.getElementById('ap-y'); if (fy) fy.value = Math.round(newY);
    }

    Renderer.render();
    drawOverlay();
  }

  function onDragUp() {
    if (activeDrag) {
      const { layerId, fi, type } = activeDrag;
      pushUndo(type === 'move' ? 'déplacement asset' : 'redimensionnement asset');
      const layer = getLayer(layerId);
      if (layer?.mode === 'frame') {
        layer.frameEnabled[fi] = true;
        renderFrameGrid(layer);
      }
      renderLayerList();
      syncPropsPanel();
      document.getElementById('slot-a').style.cursor = 'grab';
      activeDrag = null;
    }
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragUp);
  }

  // ── OVERLAY (selection box + resize handles) ──
  function drawOverlay() {
    const ov = document.getElementById('c-overlay');
    if (!ov) return;
    const slotA = document.getElementById('slot-a');
    ov.width  = slotA.clientWidth;
    ov.height = slotA.clientHeight;
    ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:12;';
    const ctx = ov.getContext('2d');
    ctx.clearRect(0, 0, ov.width, ov.height);

    if (selectedId === null || selectedId === SPRITE_ID) return;
    const fi  = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const box = getAssetScreenBox(selectedId, fi);
    if (!box) return;

    const layer = getLayer(selectedId);
    const p     = ep(selectedId, fi);
    if (!p?.visible) return;

    // Bounding box — relative to slot-a
    const slotRect = slotA.getBoundingClientRect();
    const bx = box.x - slotRect.left;
    const by = box.y - slotRect.top;
    const bw = box.w;
    const bh = box.h;
    const pad = HANDLE_PADDING;

    // Dashed outline
    ctx.strokeStyle = 'rgba(252,92,124,0.9)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(bx - pad + 0.5, by - pad + 0.5, bw + pad*2 - 1, bh + pad*2 - 1);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = 'rgba(252,92,124,0.9)';
    ctx.font      = '10px monospace';
    ctx.fillText(`${layer.name}  ${Math.round(box.spW)}×${Math.round(box.spH)}px  (${Math.round(p.x)},${Math.round(p.y)})`,
      bx - pad, by - pad - 5);

    // Corner handles
    const hs = HANDLE_SIZE;
    const corners = [
      [bx - pad,         by - pad        ],
      [bx + bw + pad - hs, by - pad      ],
      [bx - pad,         by + bh + pad - hs],
      [bx + bw + pad - hs, by + bh + pad - hs]
    ];
    corners.forEach(([hx, hy]) => {
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = 'rgba(252,92,124,0.95)';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(hx, hy, hs, hs);
      ctx.strokeRect(hx + 0.5, hy + 0.5, hs - 1, hs - 1);
    });

    // Shift hint
    ctx.fillStyle = 'rgba(136,136,170,0.7)';
    ctx.font = '9px monospace';
    ctx.fillText('⇧ Shift = proportionnel', bx - pad, by + bh + pad + 15);
  }

  // ── DRAG REORDER ──
  let dragReorder = null;

  function startReorderDrag(e, layerId) {
    dragReorder = { id: layerId };
    document.addEventListener('mousemove', onReorderMove);
    document.addEventListener('mouseup',   onReorderUp);
    e.preventDefault(); e.stopPropagation();
  }

  function onReorderMove(e) {
    if (!dragReorder) return;
    const items = document.querySelectorAll('.layer-item');
    items.forEach(item => {
      const rect = item.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const targetId = parseInt(item.dataset.id);
        const srcIdx   = layers.findIndex(l => l.id === dragReorder.id);
        const tgtIdx   = layers.findIndex(l => l.id === targetId);
        if (tgtIdx >= 0 && srcIdx !== tgtIdx) {
          const [moved] = layers.splice(srcIdx, 1);
          layers.splice(tgtIdx, 0, moved);
          recomputeOrder();
          renderLayerList();
          Renderer.render();
        }
      }
    });
  }

  function onReorderUp() {
    dragReorder = null;
    document.removeEventListener('mousemove', onReorderMove);
    document.removeEventListener('mouseup',   onReorderUp);
  }

  // ── FRAME GRID UI ──
  function renderFrameGrid(layer) {
    const container = document.getElementById('ap-frame-grid');
    if (!container || !state.img) return;
    container.innerHTML = '';
    const total  = state.totalF || 0;
    const fi     = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const active = Object.values(layer.frameEnabled).filter(Boolean).length;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;color:var(--text2);margin-bottom:6px;display:flex;justify-content:space-between';
    title.innerHTML = `<span>Frames actives</span><span style="color:var(--accent);font-family:'IBM Plex Mono',monospace">${active} / ${total}</span>`;
    container.appendChild(title);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;margin-bottom:8px';
    [['Tout', () => { for(let i=0;i<total;i++) layer.frameEnabled[i]=true; refresh(); }],
     ['Aucun', () => { layer.frameEnabled={}; refresh(); }],
     ['Copier→', () => copyFrameToAll(layer.id)]
    ].forEach(([lbl, fn]) => {
      const b = document.createElement('button');
      b.className='btn'; b.style.cssText='flex:1;font-size:9px;margin:0;padding:4px';
      b.textContent=lbl; b.onclick=fn; actions.appendChild(b);
    });
    container.appendChild(actions);

    function refresh() { renderLayerList(); renderFrameGrid(layer); Renderer.render(); }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(30px,1fr));gap:3px;max-height:120px;overflow-y:auto';
    for (let i = 0; i < total; i++) {
      const on  = !!layer.frameEnabled[i];
      const cur = i === fi;
      const cell = document.createElement('div');
      cell.style.cssText = `aspect-ratio:1;border-radius:4px;cursor:pointer;border:2px solid ${cur?'var(--accent2)':on?'var(--green)':'var(--border)'};background:${on?'rgba(92,252,154,.15)':'var(--bg3)'};display:flex;align-items:center;justify-content:center;font-size:9px;font-family:monospace;color:${on?'var(--green)':'var(--text2)'};transition:all .12s`;
      cell.textContent = i;
      cell.title = `Frame ${i} — ${on?'actif':'inactif'}`;
      cell.onclick = () => { layer.frameEnabled[i]=!layer.frameEnabled[i]; refresh(); };
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }

  // ── LAYER LIST UI ──
  function renderLayerList() {
    const list = document.getElementById('layer-list');
    if (!list) return;
    list.innerHTML = '';
    if (layers.length === 0) return;
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;

    layers.forEach(layer => {
      const p      = ep(layer.id, fi);
      const active = selectedId === layer.id;
      const ov     = hasOverride(layer.id, fi);
      const isSpr  = layer.type === 'sprite';

      const item = document.createElement('div');
      item.className = 'layer-item' + (active ? ' active' : '') + (isSpr ? ' layer-sprite' : '');
      item.dataset.id = layer.id;
      item.onclick = () => { selectedId = layer.id; renderLayerList(); syncPropsPanel(); drawOverlay(); };

      // Drag handle
      const dh = document.createElement('div');
      dh.className = isSpr ? '' : 'layer-drag-handle';
      dh.textContent = isSpr ? '' : '⠿';
      dh.style.cssText = 'width:14px;flex-shrink:0';
      if (!isSpr) dh.onmousedown = e => startReorderDrag(e, layer.id);

      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.width = 28; thumb.height = 28;
      thumb.style.cssText = 'width:28px;height:28px;border-radius:3px;flex-shrink:0;image-rendering:pixelated;background:#1a1a2a';
      const tc = thumb.getContext('2d');
      if (isSpr && state.img) {
        const { sx, sy, sw, sh } = Renderer.getRect(fi);
        const sc = Math.min(28/sw, 28/sh);
        tc.imageSmoothingEnabled = false;
        tc.drawImage(state.img, sx, sy, sw, sh, (28-sw*sc)/2, (28-sh*sc)/2, sw*sc, sh*sc);
      } else if (layer.img) {
        const sc = Math.min(28/layer.img.naturalWidth, 28/layer.img.naturalHeight);
        const tw = layer.img.naturalWidth*sc, th = layer.img.naturalHeight*sc;
        tc.imageSmoothingEnabled = false;
        tc.drawImage(layer.img, (28-tw)/2, (28-th)/2, tw, th);
      }

      // Info
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      const nm = document.createElement('div');
      nm.style.cssText = 'font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nm.textContent = (isSpr ? '🎮 ' : '') + layer.name;
      const mt = document.createElement('div');
      mt.style.cssText = 'font-size:9px;color:var(--text2);font-family:monospace;margin-top:1px';
      const modeTag = layer.mode==='frame' ? '📌' : '🌐';
      mt.textContent = `${modeTag} ${layer.blendMode} · ${Math.round((p?.opacity||1)*100)}%${ov?' ⚡':''}`;
      info.appendChild(nm); info.appendChild(mt);

      // Visibility btn
      const vis = document.createElement('button');
      vis.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:2px 3px;flex-shrink:0';
      vis.textContent = p?.visible ? '👁' : '🚫';
      vis.onclick = e => {
        e.stopPropagation();
        layer.mode==='frame'
          ? toggleFrameEnable(layer.id, fi)
          : setProp(layer.id, 'visible', !p?.visible, false);
      };

      // Delete
      item.appendChild(dh); item.appendChild(thumb); item.appendChild(info); item.appendChild(vis);
      if (!isSpr) {
        const del = document.createElement('button');
        del.className='aitem-del'; del.textContent='✕';
        del.onclick = e => { e.stopPropagation(); removeLayer(layer.id); };
        item.appendChild(del);
      }
      list.appendChild(item);
    });
  }

  // ── PROPS PANEL SYNC ──
  function syncPropsPanel() {
    const panel = document.getElementById('asset-props');
    if (!panel) return;
    const layer = getLayer(selectedId);
    if (!layer) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    const fi   = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const p    = ep(layer.id, fi);
    const ov   = hasOverride(layer.id, fi);
    const isSpr = layer.type === 'sprite';

    const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val; };
    const setTxt = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };

    set('ap-name', layer.name);
    document.getElementById('ap-name').disabled = isSpr;
    set('ap-x',        Math.round(p?.x  || 0));
    set('ap-y',        Math.round(p?.y  || 0));
    set('ap-scale',    p?.scale  || 1);
    setTxt('ap-scale-v',  Math.round((p?.scale||1)*100)+'%');
    set('ap-scalex',   p?.scaleX || 1);
    setTxt('ap-scalex-v', Math.round((p?.scaleX||1)*100)+'%');
    set('ap-scaley',   p?.scaleY || 1);
    setTxt('ap-scaley-v', Math.round((p?.scaleY||1)*100)+'%');
    set('ap-opacity',  Math.round((p?.opacity||1)*100));
    setTxt('ap-opacity-v', Math.round((p?.opacity||1)*100)+'%');
    set('ap-blend',    layer.blendMode);
    set('ap-mode',     layer.mode);
    document.getElementById('ap-mode').disabled = isSpr;
    setTxt('ap-override', ov ? '⚡ Override frame actif' : '');
    const clrBtn = document.getElementById('ap-clear-override');
    const cpyBtn = document.getElementById('ap-copy-all');
    if (clrBtn) clrBtn.style.display = ov ? 'flex' : 'none';
    if (cpyBtn) cpyBtn.style.display = ov ? 'flex' : 'none';

    const fmRow = document.getElementById('ap-frame-mode-row');
    if (fmRow) fmRow.style.display = layer.mode==='frame' ? 'block' : 'none';
    if (layer.mode === 'frame') renderFrameGrid(layer);

    const dh = document.getElementById('ap-drag-handle');
    if (dh) dh.onmousedown = e => {
      // direct drag from panel handle — same as canvas drag
      const fii = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      const pp  = ep(layer.id, fii);
      activeDrag = { type:'move', layerId:layer.id, fi:fii, startX:e.clientX, startY:e.clientY, origX:pp?.x||0, origY:pp?.y||0 };
      startDragListeners();
      e.preventDefault();
    };
  }

  // ── EXPORT ──
  function getLayersData() {
    return layers.map(l => ({
      id: l.id, type: l.type, name: l.name,
      dataUrl: l.type==='sprite' ? null : l.dataUrl,
      x:l.x, y:l.y, scale:l.scale, scaleX:l.scaleX, scaleY:l.scaleY,
      opacity:l.opacity, visible:l.visible, blendMode:l.blendMode,
      mode:l.mode, frameEnabled:l.frameEnabled, order:l.order
    }));
  }

  function applyLayersData(data, fp) {
    layers = [];
    frameProps = fp ? JSON.parse(JSON.stringify(fp)) : {};
    if (!data) { init(state); return; }
    let loaded = 0;
    data.sort((a,b)=>a.order-b.order).forEach(d => {
      if (d.type==='sprite') {
        layers.push({...d, img:null});
        loaded++;
        if (loaded===data.length) { recomputeOrder(); renderLayerList(); Renderer.render(); }
      } else {
        const img=new Image();
        img.onload=()=>{
          layers.push({...d, img});
          loaded++;
          recomputeOrder();
          if (loaded===data.length) { renderLayerList(); Renderer.render(); }
        };
        img.src=d.dataUrl;
      }
    });
    nextId = Math.max(2, ...data.map(d=>d.id+1));
  }

  return {
    init, addLayer, removeLayer, drawAll,
    renderLayerList, syncPropsPanel, drawOverlay,
    setProp, clearFrameOverride, copyFrameToAll, toggleFrameEnable,
    getLayersData, applyLayersData,
    attachCanvasEvents,
    effectiveProps: (id, fi) => ep(id, fi),
    setUndoCallback,
    get selectedId() { return selectedId; },
    get layers()     { return layers; },
    get frameProps() { return frameProps; },
    SPRITE_ID
  };

})();
