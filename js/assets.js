// ── ASSETS.JS v2 ──
// Full layer system:
//   - Layer 0 = sprite (locked, reorderable)
//   - Asset layers: global props + per-frame overrides
//   - Modes: GLOBAL (shows on all frames) | FRAME (shows only on explicitly enabled frames)
//   - Drag to reorder, blend modes, mask/clip, copy frame props

const Assets = (() => {

  // ── CONSTANTS ──
  const SPRITE_ID  = 0;
  const BLEND_MODES = ['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'];

  // ── STATE ──
  let state        = null;
  let layers       = [];         // ordered top→bottom. Each: { id, type:'sprite'|'asset', name, img, dataUrl, x, y, scale, scaleX, scaleY, opacity, visible, blendMode, mode:'global'|'frame', frameEnabled:{fi:bool}, order }
  let frameProps   = {};         // { layerId: { frameIdx: { x,y,scale,scaleX,scaleY,opacity,visible } } }
  let selectedId   = null;
  let nextId       = 1;
  let dragReorder  = null;
  let dragMove     = null;
  let undoCb       = null;       // pushUndo callback from app.js

  // ── UNDO CALLBACK ──
  function setUndoCallback(cb) { undoCb = cb; }
  function pushUndo(desc) { if (undoCb) undoCb(desc); }

  // ── INIT ──
  function init(appState) {
    state = appState;
    // Create the sprite layer (id=0, always exists)
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

  // ── LAYER CRUD ──
  function addLayer(dataUrl, name) {
    pushUndo("ajout calque");
    const img = new Image();
    img.onload = () => {
      const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      const frameEnabled = {};
      frameEnabled[fi] = true; // active only on current frame by default
      const layer = {
        id: nextId++, type: 'asset',
        name: name || ('asset_' + nextId),
        img, dataUrl,
        x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1,
        opacity: 1, visible: true, blendMode: 'source-over',
        mode: 'frame',       // ← frame mode by default
        frameEnabled,
        order: layers.length
      };
      layers.unshift(layer);
      recomputeOrder();
      selectedId = layer.id;
      renderLayerList();
      syncPropsPanel();
      Renderer.render();
      App.toast(`Calque ajouté sur frame #${fi}`, 'ok');
    };
    img.src = dataUrl;
  }

  function removeLayer(id) {
    if (id === SPRITE_ID) return;
    pushUndo("suppression calque"); // cannot remove sprite
    layers = layers.filter(l => l.id !== id);
    delete frameProps[id];
    if (selectedId === id) selectedId = SPRITE_ID;
    recomputeOrder();
    renderLayerList();
    syncPropsPanel();
    Renderer.render();
  }

  function recomputeOrder() {
    layers.forEach((l, i) => l.order = i);
  }

  function getLayer(id) { return layers.find(l => l.id === id); }

  // ── EFFECTIVE PROPS ──
  // Returns merged global + frame override props for rendering
  function ep(layerId, frameIdx) {
    const l = getLayer(layerId);
    if (!l) return null;
    const over = (frameProps[layerId] || {})[frameIdx] || {};
    // For 'frame' mode layers, check if enabled for this frame
    const visible = l.mode === 'frame'
      ? !!(l.frameEnabled[frameIdx])
      : (over.visible !== undefined ? over.visible : l.visible);
    return {
      x:         over.x         !== undefined ? over.x         : l.x,
      y:         over.y         !== undefined ? over.y         : l.y,
      scale:     over.scale     !== undefined ? over.scale     : l.scale,
      scaleX:    over.scaleX    !== undefined ? over.scaleX    : l.scaleX,
      scaleY:    over.scaleY    !== undefined ? over.scaleY    : l.scaleY,
      opacity:   over.opacity   !== undefined ? over.opacity   : l.opacity,
      blendMode: l.blendMode,
      visible,
      hasOverride: Object.keys(over).length > 0
    };
  }

  function hasOverride(layerId, fi) {
    return !!(frameProps[layerId] && frameProps[layerId][fi] && Object.keys(frameProps[layerId][fi]).length);
  }

  // ── SET PROP ──
  function setProp(layerId, key, value, perFrame) {
    const l = getLayer(layerId);
    if (!l) return;
    if (perFrame && layerId !== SPRITE_ID) {
      const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      if (!frameProps[layerId]) frameProps[layerId] = {};
      if (!frameProps[layerId][fi]) frameProps[layerId][fi] = {};
      frameProps[layerId][fi][key] = value;
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
    syncPropsPanel();
    renderLayerList();
    Renderer.render();
    App.toast('Override frame supprimé');
  }

  function copyFrameToAll(layerId) {
    const fi   = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const src  = (frameProps[layerId] || {})[fi];
    if (!src)  { App.toast('Aucun override sur cette frame', 'err'); return; }
    const total = state.totalF || 1;
    for (let i = 0; i < total; i++) {
      if (i === fi) continue;
      if (!frameProps[layerId]) frameProps[layerId] = {};
      frameProps[layerId][i] = { ...src };
    }
    App.toast('Propriétés copiées sur toutes les frames', 'ok');
    Renderer.render();
  }

  // ── TOGGLE FRAME VISIBILITY (for 'frame' mode layers) ──
  function toggleFrameEnable(layerId, fi) {
    const l = getLayer(layerId);
    if (!l || l.mode !== 'frame') return;
    l.frameEnabled[fi] = !l.frameEnabled[fi];
    renderLayerList();
    Renderer.render();
  }

  // ── DRAW (called by Renderer) ──
  // Draws all layers in order (layers[0] = top, last = bottom)
  // The sprite layer is drawn at its position in the stack
  function drawAll(ctx, fw, fh, fi) {
    ctx.clearRect(0, 0, fw, fh);
    // Draw bottom→top (reverse of display order)
    const sorted = [...layers].reverse();
    sorted.forEach(layer => {
      if (layer.type === 'sprite') {
        drawSpriteLayer(ctx, fw, fh, fi, layer);
      } else {
        drawAssetLayer(ctx, fw, fh, fi, layer);
      }
    });
  }

  function drawSpriteLayer(ctx, fw, fh, fi, layer) {
    if (!state.img) return;
    const p = ep(SPRITE_ID, fi);
    if (!p.visible) return;
    ctx.save();
    ctx.globalAlpha       = Math.max(0, Math.min(1, p.opacity));
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    ctx.imageSmoothingEnabled = false;
    // Apply scaleX/scaleY for sprite layer
    const { sx, sy, sw, sh } = Renderer.getRect(fi);
    const dw = fw * p.scaleX;
    const dh = fh * p.scaleY;
    const dx = p.x * (fw / (state.sprW || fw));
    const dy = p.y * (fh / (state.sprH || fh));
    ctx.drawImage(state.img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawAssetLayer(ctx, fw, fh, fi, layer) {
    if (!layer.img) return;
    const p = ep(layer.id, fi);
    if (!p.visible) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
    ctx.globalCompositeOperation = p.blendMode || 'source-over';
    ctx.imageSmoothingEnabled = false;
    const scaleX = fw / (state.sprW || fw);
    const scaleY = fh / (state.sprH || fh);
    const aw = layer.img.naturalWidth  * p.scale * p.scaleX * scaleX;
    const ah = layer.img.naturalHeight * p.scale * p.scaleY * scaleY;
    ctx.drawImage(layer.img, p.x * scaleX, p.y * scaleY, aw, ah);
    ctx.restore();
  }

  // ── DRAG REORDER ──
  function startReorderDrag(e, layerId) {
    if (layerId === SPRITE_ID) return; // can still reorder, but handle separately
    dragReorder = {
      id: layerId,
      startY: e.clientY,
      origOrder: layers.findIndex(l => l.id === layerId)
    };
    document.addEventListener('mousemove', onReorderMove);
    document.addEventListener('mouseup',   onReorderUp);
    e.preventDefault(); e.stopPropagation();
  }

  function onReorderMove(e) {
    if (!dragReorder) return;
    const items = document.querySelectorAll('.layer-item');
    let target  = null;
    items.forEach(item => {
      const rect = item.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) target = item;
    });
    if (target) {
      const targetId = parseInt(target.dataset.id);
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
  }

  function onReorderUp() {
    dragReorder = null;
    document.removeEventListener('mousemove', onReorderMove);
    document.removeEventListener('mouseup',   onReorderUp);
  }

  // ── HIT TEST: find topmost visible asset at image-space coords ──
  function hitTest(imgX, imgY, fi) {
    // Test layers top→bottom (layers[0] is topmost)
    for (const layer of layers) {
      if (layer.type === 'sprite') continue; // skip sprite for direct drag
      const p = ep(layer.id, fi);
      if (!p.visible) continue;
      const scaleX = 1; // coords already in image space
      const scaleY = 1;
      const aw = layer.img ? layer.img.naturalWidth  * p.scale * p.scaleX : 0;
      const ah = layer.img ? layer.img.naturalHeight * p.scale * p.scaleY : 0;
      if (imgX >= p.x && imgX <= p.x + aw &&
          imgY >= p.y && imgY <= p.y + ah) {
        return layer.id;
      }
    }
    return null;
  }

  // ── CANVAS PREVIEW INTERACTION ──
  // Called by app.js to attach to the canvas slot
  function attachCanvasEvents() {
    const slotA = document.getElementById('slot-a');
    if (!slotA) return;
    slotA.addEventListener('mousedown', onCanvasMouseDown);
    slotA.addEventListener('mousemove', onCanvasHover);
  }

  let canvasDrag = null; // { layerId, startMX, startMY, origX, origY, fi }

  function screenToImageCoords(screenX, screenY) {
    const slotA   = document.getElementById('slot-a');
    const rect    = slotA.getBoundingClientRect();
    const sx      = screenX - rect.left;
    const sy      = screenY - rect.top;
    const pan     = state.panOffset || { x: 0, y: 0 };
    const fi      = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const fo      = (state.frameOffsets || {})[fi] || {};
    const fw      = state.customSize && state.customW > 0 ? state.customW : (fo.w || state.sprW || 1);
    const fh      = state.customSize && state.customH > 0 ? state.customH : (fo.h || state.sprH || 1);
    const dw      = fw * state.zoom;
    const dh      = fh * state.zoom;
    const originX = slotA.clientWidth  / 2 - dw / 2 + pan.x;
    const originY = slotA.clientHeight / 2 - dh / 2 + pan.y;
    return {
      x: (sx - originX) / state.zoom,
      y: (sy - originY) / state.zoom
    };
  }

  function onCanvasHover(e) {
    if (canvasDrag) return;
    if (!state.img || !layers.length) return;
    const fi     = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const imgPt  = screenToImageCoords(e.clientX, e.clientY);
    const hitId  = hitTest(imgPt.x, imgPt.y, fi);
    const slotA  = document.getElementById('slot-a');
    // Only change cursor if no placement tool is active
    const activeTool = document.querySelector('.tool-btn.on');
    if (!activeTool || activeTool.id === 'tool-none') {
      slotA.style.cursor = hitId !== null ? 'grab' : '';
    }
    // Show asset name on hover
    if (hitId !== null) {
      const layer = getLayer(hitId);
      document.getElementById('sframe').textContent =
        'frame: ' + fi + ' · 📌 ' + (layer ? layer.name : '');
    }
  }

  function onCanvasMouseDown(e) {
    if (e.button !== 0) return;
    if (!state.img || !layers.length) return;
    // Skip if a placement tool is active (pan/source)
    const activeTool = document.querySelector('.tool-btn.on');
    if (activeTool && activeTool.id !== 'tool-none') return;

    const fi    = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const imgPt = screenToImageCoords(e.clientX, e.clientY);
    const hitId = hitTest(imgPt.x, imgPt.y, fi);
    if (hitId === null) return;

    const layer  = getLayer(hitId);
    const p      = ep(hitId, fi);

    // Select this layer in the panel
    selectedId = hitId;
    renderLayerList();
    syncPropsPanel();

    canvasDrag = {
      layerId: hitId,
      startMX: e.clientX, startMY: e.clientY,
      origX: p.x, origY: p.y,
      fi
    };

    const slotA = document.getElementById('slot-a');
    slotA.style.cursor = 'grabbing';

    const onMove = ev => {
      if (!canvasDrag) return;
      const dx = Math.round((ev.clientX - canvasDrag.startMX) / state.zoom);
      const dy = Math.round((ev.clientY - canvasDrag.startMY) / state.zoom);
      const newX = canvasDrag.origX + dx;
      const newY = canvasDrag.origY + dy;
      // Always write as frame override on current frame
      const layerId = canvasDrag.layerId;
      const cfi     = canvasDrag.fi;
      if (!frameProps[layerId]) frameProps[layerId] = {};
      if (!frameProps[layerId][cfi]) frameProps[layerId][cfi] = {};
      frameProps[layerId][cfi].x = newX;
      frameProps[layerId][cfi].y = newY;
      // Sync fields
      const fx = document.getElementById('ap-x');
      const fy = document.getElementById('ap-y');
      if (fx) fx.value = newX;
      if (fy) fy.value = newY;
      Renderer.render();
    };

    const onUp = () => {
      if (canvasDrag) {
        slotA.style.cursor = 'grab';
        canvasDrag = null;
        // Refresh UI — push undo after drag
        pushUndo('déplacement asset');
        renderLayerList();
        syncPropsPanel();
        // Auto-enable frame in 'frame' mode if not already
        if (layer && layer.mode === 'frame') {
          layer.frameEnabled[fi] = true;
          renderFrameGrid(layer);
        }
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  }

  // ── DRAG POSITION (from props panel handle) ──
  function startMoveDrag(e, layerId) {
    if (!state.img) return;
    const l  = getLayer(layerId);
    if (!l)  return;
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const p  = ep(layerId, fi);
    // Always frame override when dragging from panel handle too
    dragMove = { layerId, startMX: e.clientX, startMY: e.clientY, origX: p.x, origY: p.y, perFrame: true };
    const onMove = ev => {
      if (!dragMove) return;
      const dx = Math.round((ev.clientX - dragMove.startMX) / state.zoom);
      const dy = Math.round((ev.clientY - dragMove.startMY) / state.zoom);
      setProp(dragMove.layerId, 'x', dragMove.origX + dx, dragMove.perFrame);
      setProp(dragMove.layerId, 'y', dragMove.origY + dy, dragMove.perFrame);
    };
    const onUp = () => { dragMove = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault(); e.stopPropagation();
  }

  // ── UI ──
  // ── FRAME GRID: visual per-frame toggle for 'frame' mode layers ──
  function renderFrameGrid(layer) {
    const container = document.getElementById('ap-frame-grid');
    if (!container || !state.img) return;
    container.innerHTML = '';
    const total = state.totalF || 0;
    const fi    = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;

    // Title with count
    const activeCount = Object.values(layer.frameEnabled).filter(Boolean).length;
    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;color:var(--text2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
    title.innerHTML = `<span>Frames actives</span><span style="color:var(--accent);font-family:'IBM Plex Mono',monospace">${activeCount} / ${total}</span>`;
    container.appendChild(title);

    // Quick actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;margin-bottom:8px';
    const btnAll = document.createElement('button');
    btnAll.className = 'btn'; btnAll.style.cssText = 'flex:1;font-size:9px;margin:0;padding:4px';
    btnAll.textContent = 'Tout activer';
    btnAll.onclick = () => {
      for (let i = 0; i < total; i++) layer.frameEnabled[i] = true;
      renderLayerList(); renderFrameGrid(layer); Renderer.render();
    };
    const btnNone = document.createElement('button');
    btnNone.className = 'btn'; btnNone.style.cssText = 'flex:1;font-size:9px;margin:0;padding:4px';
    btnNone.textContent = 'Tout désactiver';
    btnNone.onclick = () => {
      layer.frameEnabled = {};
      renderLayerList(); renderFrameGrid(layer); Renderer.render();
    };
    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn'; btnCopy.style.cssText = 'flex:1;font-size:9px;margin:0;padding:4px';
    btnCopy.textContent = 'Copier props →';
    btnCopy.title = 'Copier les propriétés de la frame courante sur toutes les frames actives';
    btnCopy.onclick = () => copyFrameToAll(layer.id);
    actions.appendChild(btnAll);
    actions.appendChild(btnNone);
    actions.appendChild(btnCopy);
    container.appendChild(actions);

    // Frame grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:3px;max-height:120px;overflow-y:auto';
    for (let i = 0; i < total; i++) {
      const active  = !!layer.frameEnabled[i];
      const isCur   = i === fi;
      const cell    = document.createElement('div');
      cell.style.cssText = `
        width:100%;aspect-ratio:1;border-radius:4px;cursor:pointer;
        border:2px solid ${isCur ? 'var(--accent2)' : active ? 'var(--green)' : 'var(--border)'};
        background:${active ? 'rgba(92,252,154,.15)' : 'var(--bg3)'};
        display:flex;align-items:center;justify-content:center;
        font-size:9px;font-family:'IBM Plex Mono',monospace;
        color:${active ? 'var(--green)' : 'var(--text2)'};
        transition:all .12s;position:relative;
      `;
      cell.textContent = i;
      cell.title = `Frame ${i} — ${active ? 'actif' : 'inactif'} (clic pour toggle)`;
      cell.onclick = () => {
        layer.frameEnabled[i] = !layer.frameEnabled[i];
        renderLayerList(); renderFrameGrid(layer); Renderer.render();
      };
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }

  function renderLayerList() {
    const list = document.getElementById('layer-list');
    if (!list) return;
    list.innerHTML = '';
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;

    // Display top→bottom (layers[0] is topmost)
    layers.forEach(layer => {
      const p      = ep(layer.id, fi);
      const isActive = selectedId === layer.id;
      const ov     = hasOverride(layer.id, fi);
      const isSpr  = layer.type === 'sprite';

      const item = document.createElement('div');
      item.className = 'layer-item' + (isActive ? ' active' : '') + (isSpr ? ' layer-sprite' : '');
      item.dataset.id = layer.id;
      item.title      = isSpr ? 'Calque sprite (non supprimable)' : '';
      item.onclick    = () => { selectedId = layer.id; renderLayerList(); syncPropsPanel(); };

      // ── Drag handle (reorder) ──
      if (!isSpr) {
        const dh = document.createElement('div');
        dh.className = 'layer-drag-handle';
        dh.textContent = '⠿';
        dh.title = 'Glisser pour réordonner';
        dh.onmousedown = e => startReorderDrag(e, layer.id);
        item.appendChild(dh);
      } else {
        const sp = document.createElement('div');
        sp.style.cssText = 'width:14px;flex-shrink:0';
        item.appendChild(sp);
      }

      // ── Thumbnail ──
      const thumb = document.createElement('canvas');
      thumb.width = 28; thumb.height = 28;
      thumb.style.cssText = 'width:28px;height:28px;border-radius:3px;flex-shrink:0;image-rendering:pixelated';
      const tc = thumb.getContext('2d');
      tc.fillStyle = '#1a1a2a';
      tc.fillRect(0, 0, 28, 28);
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

      // ── Info ──
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const nm = document.createElement('div');
      nm.style.cssText = 'font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nm.textContent = (isSpr ? '🎮 ' : '') + layer.name;
      const mt = document.createElement('div');
      mt.style.cssText = 'font-size:9px;color:var(--text2);font-family:"IBM Plex Mono",monospace;margin-top:1px';
      const modeTag = layer.mode === 'frame' ? '📌frame' : '🌐global';
      mt.textContent = `${modeTag} · ${layer.blendMode} · ${Math.round(p.opacity*100)}%${ov?' · ⚡':''}`;
      info.appendChild(nm); info.appendChild(mt);

      // ── Visibility ──
      const vis = document.createElement('button');
      vis.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:2px 3px;flex-shrink:0;opacity:.8';
      vis.textContent = p.visible ? '👁' : '🚫';
      vis.onclick = e => {
        e.stopPropagation();
        if (layer.mode === 'frame') {
          toggleFrameEnable(layer.id, fi);
        } else {
          setProp(layer.id, 'visible', !p.visible, false);
        }
      };

      // ── Delete (not for sprite) ──
      if (!isSpr) {
        const del = document.createElement('button');
        del.className = 'aitem-del';
        del.textContent = '✕';
        del.onclick = e => { e.stopPropagation(); removeLayer(layer.id); };
        item.appendChild(thumb); item.appendChild(info); item.appendChild(vis); item.appendChild(del);
      } else {
        item.appendChild(thumb); item.appendChild(info); item.appendChild(vis);
      }
      list.appendChild(item);
    });
  }

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

    document.getElementById('ap-name').value         = layer.name;
    document.getElementById('ap-name').disabled      = isSpr;
    document.getElementById('ap-x').value            = Math.round(p.x);
    document.getElementById('ap-y').value            = Math.round(p.y);
    document.getElementById('ap-scale').value        = p.scale;
    document.getElementById('ap-scale-v').textContent= Math.round(p.scale*100)+'%';
    document.getElementById('ap-scalex').value       = p.scaleX;
    document.getElementById('ap-scalex-v').textContent = Math.round(p.scaleX*100)+'%';
    document.getElementById('ap-scaley').value       = p.scaleY;
    document.getElementById('ap-scaley-v').textContent = Math.round(p.scaleY*100)+'%';
    document.getElementById('ap-opacity').value      = Math.round(p.opacity*100);
    document.getElementById('ap-opacity-v').textContent = Math.round(p.opacity*100)+'%';
    document.getElementById('ap-blend').value        = layer.blendMode;
    document.getElementById('ap-mode').value         = layer.mode;
    document.getElementById('ap-mode').disabled      = isSpr;
    document.getElementById('ap-override').textContent = ov ? '⚡ Override frame actif' : '';
    document.getElementById('ap-clear-override').style.display = ov ? 'flex' : 'none';
    document.getElementById('ap-copy-all').style.display = ov ? 'flex' : 'none';
    document.getElementById('ap-per-frame').disabled = isSpr;

    // Frame mode indicator
    const fmRow = document.getElementById('ap-frame-mode-row');
    if (fmRow) fmRow.style.display = layer.mode === 'frame' ? 'block' : 'none';
    if (layer.mode === 'frame') renderFrameGrid(layer);

    // Drag handle
    const dh = document.getElementById('ap-drag-handle');
    if (dh) dh.onmousedown = e => startMoveDrag(e, layer.id);
  }

  // ── EXPORT ──
  function getLayersData() {
    return layers.map(l => ({
      id: l.id, type: l.type, name: l.name,
      dataUrl: l.type === 'sprite' ? null : l.dataUrl,
      x: l.x, y: l.y, scale: l.scale, scaleX: l.scaleX, scaleY: l.scaleY,
      opacity: l.opacity, visible: l.visible, blendMode: l.blendMode,
      mode: l.mode, frameEnabled: l.frameEnabled, order: l.order
    }));
  }

  function applyLayersData(data, fp) {
    layers = [];
    if (fp) frameProps = JSON.parse(JSON.stringify(fp));
    if (!data) { init(state); return; }
    let loaded = 0;
    data.forEach(d => {
      if (d.type === 'sprite') {
        layers.push({ ...d, img: null });
        loaded++;
        if (loaded === data.length) { recomputeOrder(); renderLayerList(); Renderer.render(); }
      } else {
        const img = new Image();
        img.onload = () => {
          layers.push({ ...d, img });
          loaded++;
          recomputeOrder();
          if (loaded === data.length) { renderLayerList(); Renderer.render(); }
        };
        img.src = d.dataUrl;
      }
    });
    nextId = Math.max(2, ...(data.map(d => d.id + 1)));
  }

  return {
    init, addLayer, removeLayer, drawAll,
    attachCanvasEvents,
    effectiveProps: (id, fi) => ep(id, fi),
    setUndoCallback,
    renderLayerList, syncPropsPanel,
    setProp, clearFrameOverride, copyFrameToAll,
    toggleFrameEnable,
    getLayersData, applyLayersData,
    get selectedId() { return selectedId; },
    get layers()     { return layers; },
    get frameProps() { return frameProps; },
    SPRITE_ID
  };

})();
