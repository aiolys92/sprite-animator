// ── ASSETS.JS ──
// Layer system: global assets + per-frame overrides
// Each layer: { id, name, img, dataUrl, x, y, scale, opacity, visible, zIndex }
// zIndex: negative = under sprite, positive = over sprite
// Per-frame override: frameAssets[frameIdx][layerId] = { x, y, scale, opacity, visible }

const Assets = (() => {

  let state = null;
  let layers = [];        // global layer definitions
  let frameOverrides = {}; // { frameIdx: { layerId: {...props} } }
  let selectedLayer = null;
  let dragState = null;
  let nextId = 1;

  function init(appState) {
    state = appState;
    state.layers = layers;
    state.frameOverrides = frameOverrides;
    buildPanel();
  }

  // ── LAYER CRUD ──
  function addLayer(dataUrl, name, above = true) {
    const img = new Image();
    img.onload = () => {
      const layer = {
        id:      nextId++,
        name:    name || 'asset_' + (layers.length + 1),
        img,
        dataUrl,
        x:       0, y: 0,
        scale:   1,
        opacity: 1,
        visible: true,
        zIndex:  above ? 1 : -1   // 1 = over sprite, -1 = under sprite
      };
      layers.push(layer);
      selectedLayer = layer.id;
      renderLayerList();
      Renderer.render();
      App.toast('Asset ajouté : ' + layer.name, 'ok');
    };
    img.src = dataUrl;
  }

  function removeLayer(id) {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    layers.splice(idx, 1);
    // Remove overrides
    Object.keys(frameOverrides).forEach(fi => {
      if (frameOverrides[fi][id]) delete frameOverrides[fi][id];
    });
    if (selectedLayer === id) selectedLayer = layers.length ? layers[layers.length - 1].id : null;
    renderLayerList();
    Renderer.render();
  }

  function getLayer(id) { return layers.find(l => l.id === id); }

  // ── EFFECTIVE PROPS (global + frame override) ──
  function effectiveProps(layerId, frameIdx) {
    const layer = getLayer(layerId);
    if (!layer) return null;
    const over  = (frameOverrides[frameIdx] || {})[layerId] || {};
    return {
      img:     layer.img,
      x:       over.x       !== undefined ? over.x       : layer.x,
      y:       over.y       !== undefined ? over.y       : layer.y,
      scale:   over.scale   !== undefined ? over.scale   : layer.scale,
      opacity: over.opacity !== undefined ? over.opacity : layer.opacity,
      visible: over.visible !== undefined ? over.visible : layer.visible,
      zIndex:  layer.zIndex,
      hasOverride: Object.keys(over).length > 0
    };
  }

  function hasFrameOverride(layerId, frameIdx) {
    return !!(frameOverrides[frameIdx] && frameOverrides[frameIdx][layerId]);
  }

  // ── SET PROP (global or per-frame) ──
  function setProp(layerId, key, value, perFrame) {
    if (perFrame) {
      const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
      if (!frameOverrides[fi]) frameOverrides[fi] = {};
      if (!frameOverrides[fi][layerId]) frameOverrides[fi][layerId] = {};
      frameOverrides[fi][layerId][key] = value;
    } else {
      const layer = getLayer(layerId);
      if (layer) layer[key] = value;
    }
    renderLayerList();
    syncPropsPanel();
    Renderer.render();
  }

  function clearFrameOverride(layerId) {
    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    if (frameOverrides[fi]) delete frameOverrides[fi][layerId];
    syncPropsPanel();
    Renderer.render();
    App.toast('Override de frame supprimé');
  }

  // ── DRAW (called by Renderer) ──
  function drawLayers(ctx, dw, dh, frameIdx, zFilter) {
    // zFilter: 'under' (zIndex < 0) or 'over' (zIndex > 0)
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach(layer => {
      if (zFilter === 'under' && layer.zIndex >= 0) return;
      if (zFilter === 'over'  && layer.zIndex <= 0) return;
      const ep = effectiveProps(layer.id, frameIdx);
      if (!ep || !ep.visible || !ep.img) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, ep.opacity));
      ctx.imageSmoothingEnabled = false;
      const aw = Math.round(ep.img.naturalWidth  * ep.scale);
      const ah = Math.round(ep.img.naturalHeight * ep.scale);
      // x/y are in image-space (sprite pixels), scale to canvas
      const scaleX = dw / (state.sprW || dw);
      const scaleY = dh / (state.sprH || dh);
      ctx.drawImage(ep.img, ep.x * scaleX, ep.y * scaleY, aw * scaleX, ah * scaleY);
      ctx.restore();
    });
  }

  // ── DRAG TO POSITION ──
  function startDrag(e, layerId) {
    if (!state.img) return;
    const slotA = document.getElementById('slot-a');
    const rect  = slotA.getBoundingClientRect();
    const layer = getLayer(layerId);
    if (!layer) return;
    const fi  = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const ep  = effectiveProps(layerId, fi);
    dragState = {
      layerId,
      startMX: e.clientX, startMY: e.clientY,
      origX: ep.x, origY: ep.y,
      perFrame: hasFrameOverride(layerId, fi)
    };
    selectedLayer = layerId;
    renderLayerList();
    syncPropsPanel();
    const onMove = ev => {
      if (!dragState) return;
      const dx = (ev.clientX - dragState.startMX) / state.zoom;
      const dy = (ev.clientY - dragState.startMY) / state.zoom;
      const newX = Math.round(dragState.origX + dx);
      const newY = Math.round(dragState.origY + dy);
      setProp(dragState.layerId, 'x', newX, dragState.perFrame);
      setProp(dragState.layerId, 'y', newY, dragState.perFrame);
    };
    const onUp = () => {
      dragState = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  }

  // ── PANEL UI ──
  function buildPanel() {
    // Already in HTML, just render
    renderLayerList();
  }

  function renderLayerList() {
    const list = document.getElementById('layer-list');
    if (!list) return;
    list.innerHTML = '';

    if (!layers.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:8px;text-align:center;opacity:.6">Aucun asset</div>';
      return;
    }

    const fi = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;

    // Draw in reverse for display (top layer first)
    [...layers].reverse().forEach(layer => {
      const ep       = effectiveProps(layer.id, fi);
      const isActive = selectedLayer === layer.id;
      const hasOver  = hasFrameOverride(layer.id, fi);

      const item = document.createElement('div');
      item.className = 'layer-item' + (isActive ? ' active' : '');
      item.onclick   = () => { selectedLayer = layer.id; renderLayerList(); syncPropsPanel(); };

      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.width = 28; thumb.height = 28;
      thumb.style.cssText = 'width:28px;height:28px;border-radius:3px;background:#1a1a2a;image-rendering:pixelated;flex-shrink:0';
      const tc = thumb.getContext('2d');
      if (layer.img) {
        const sc = Math.min(28 / layer.img.naturalWidth, 28 / layer.img.naturalHeight);
        const tw = layer.img.naturalWidth  * sc;
        const th = layer.img.naturalHeight * sc;
        tc.imageSmoothingEnabled = false;
        tc.drawImage(layer.img, (28-tw)/2, (28-th)/2, tw, th);
      }

      // Info
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:16px';
      nameEl.textContent = layer.name;
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:9px;font-family:"IBM Plex Mono",monospace;color:var(--text2);margin-top:1px';
      meta.textContent = `${layer.zIndex > 0 ? '▲ dessus' : '▼ dessous'} · ${Math.round(ep.scale*100)}% · ${Math.round(ep.opacity*100)}%${hasOver ? ' · ⚡frame' : ''}`;
      info.appendChild(nameEl);
      info.appendChild(meta);

      // Visibility toggle
      const vis = document.createElement('button');
      vis.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;color:var(--text2);padding:2px;transition:color .15s;flex-shrink:0';
      vis.textContent = ep.visible ? '👁' : '🚫';
      vis.title = ep.visible ? 'Masquer' : 'Afficher';
      vis.onclick = e => { e.stopPropagation(); setProp(layer.id, 'visible', !ep.visible, false); };

      // Delete
      const del = document.createElement('button');
      del.className = 'aitem-del';
      del.textContent = '✕';
      del.onclick = e => { e.stopPropagation(); removeLayer(layer.id); };

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(vis);
      item.appendChild(del);
      list.appendChild(item);
    });
  }

  function syncPropsPanel() {
    const panel = document.getElementById('asset-props');
    if (!panel) return;
    const layer = getLayer(selectedLayer);
    if (!layer) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    const fi  = state.getCurrentFrameIndex ? state.getCurrentFrameIndex() : 0;
    const ep  = effectiveProps(layer.id, fi);
    const ov  = hasFrameOverride(layer.id, fi);

    document.getElementById('ap-name').value      = layer.name;
    document.getElementById('ap-x').value         = ep.x;
    document.getElementById('ap-y').value         = ep.y;
    document.getElementById('ap-scale').value     = ep.scale;
    document.getElementById('ap-scale-v').textContent = Math.round(ep.scale * 100) + '%';
    document.getElementById('ap-opacity').value   = Math.round(ep.opacity * 100);
    document.getElementById('ap-opacity-v').textContent = Math.round(ep.opacity * 100) + '%';
    document.getElementById('ap-zindex').value    = layer.zIndex > 0 ? 'over' : 'under';
    document.getElementById('ap-override').textContent = ov ? '⚡ Override frame actif' : '';
    document.getElementById('ap-clear-override').style.display = ov ? 'flex' : 'none';

    // Drag handle
    const dh = document.getElementById('ap-drag-handle');
    if (dh) {
      dh.onmousedown = e => startDrag(e, layer.id);
    }
  }

  // ── EXPORT HELPERS ──
  function getLayersData() {
    return layers.map(l => ({
      id: l.id, name: l.name, dataUrl: l.dataUrl,
      x: l.x, y: l.y, scale: l.scale, opacity: l.opacity,
      visible: l.visible, zIndex: l.zIndex
    }));
  }

  function applyLayersData(data, overridesData) {
    layers.splice(0);
    frameOverrides = {};
    if (data) {
      data.forEach(d => {
        const img = new Image();
        img.onload = () => {
          layers.push({ ...d, img });
          renderLayerList();
          Renderer.render();
        };
        img.src = d.dataUrl;
      });
    }
    if (overridesData) Object.assign(frameOverrides, overridesData);
    nextId = Math.max(nextId, ...(data || []).map(d => d.id + 1), 1);
  }

  return {
    init,
    addLayer,
    removeLayer,
    drawLayers,
    renderLayerList,
    syncPropsPanel,
    setProp,
    clearFrameOverride,
    effectiveProps,
    hasFrameOverride,
    getLayersData,
    applyLayersData,
    get selectedLayer() { return selectedLayer; },
    get layers() { return layers; },
    get frameOverrides() { return frameOverrides; }
  };

})();
