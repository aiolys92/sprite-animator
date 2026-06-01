// ── EXPORT.JS ──
// Handles GIF export, PNG frames, JSON

const Export = (() => {

  let state = null;
  function init(appState) { state = appState; }

  // ── DOWNLOAD HELPER ──
  function download(dataUrl, filename) {
    const a       = document.createElement('a');
    a.href        = dataUrl;
    a.download    = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── GIF EXPORT ──
  function exportGif() {
    const frames = Animations.getFrames();
    if (!state.img || !frames.length) { App.toast('Aucune frame à exporter', 'err'); return; }

    const qual  = parseInt(document.getElementById('gqual').value);
    const scale = state.gifScale;
    const rect0 = Renderer.getRect(frames[0]);
    const W     = Math.round(rect0.sw * scale);
    const H     = Math.round(rect0.sh * scale);

    const prog  = document.getElementById('gif-progress');
    const bar   = document.getElementById('gif-bar');
    const txt   = document.getElementById('gif-txt');
    prog.style.display = 'block';
    bar.value  = 0;
    txt.textContent = 'Initialisation…';
    document.getElementById('expbtn').disabled = true;

    const tmp  = document.createElement('canvas');
    tmp.width  = W; tmp.height = H;
    const tc   = tmp.getContext('2d');

    try {
      const gif = new GIF({
        workers:      2,
        quality:      qual,
        width:        W,
        height:       H,
        workerScript: 'js/gif.worker.js'
      });

      frames.forEach(fi => {
        tc.clearRect(0, 0, W, H);
        tc.imageSmoothingEnabled = false;
        if (state.bgMode === 'color') { tc.fillStyle = state.bgColor; tc.fillRect(0, 0, W, H); }
        const { sx, sy, sw, sh } = Renderer.getRect(fi);
        tc.drawImage(state.img, sx, sy, sw, sh, 0, 0, W, H);
        gif.addFrame(tmp, { copy: true, delay: state.frameDurations[fi] || Math.round(1000 / state.fps) });
      });

      gif.on('progress', p => {
        bar.value = Math.round(p * 100);
        txt.textContent = `Encodage… ${Math.round(p * 100)}%`;
      });

      gif.on('finished', blob => {
        const url = URL.createObjectURL(blob);
        download(url, 'animation.gif');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        prog.style.display = 'none';
        document.getElementById('expbtn').disabled = false;
        App.toast('GIF exporté !', 'ok');
      });

      gif.render();

    } catch (e) {
      prog.style.display = 'none';
      document.getElementById('expbtn').disabled = false;
      App.toast('Erreur export GIF', 'err');
      console.error(e);
    }
  }

  // ── PNG FRAMES EXPORT ──
  async function exportFrames() {
    if (!state.img) { App.toast('Charge un sprite sheet', 'err'); return; }
    const frames = Animations.getFrames();
    const prefix = document.getElementById('export-prefix').value || 'frame';
    const scale  = parseInt(document.getElementById('escale').value) || 1;

    App.toast(`Export de ${frames.length} frames…`);

    // Small delay to avoid browser blocking multiple downloads
    for (let i = 0; i < frames.length; i++) {
      const fi = frames[i];
      const cv = Renderer.getFrameCanvas(fi, scale);
      const dataUrl = cv.toDataURL('image/png');
      const filename = `${prefix}_${String(i).padStart(3, '0')}.png`;
      await new Promise(resolve => setTimeout(resolve, 80));
      download(dataUrl, filename);
    }
    App.toast(`${frames.length} frames exportées !`, 'ok');
  }

  // ── JSON EXPORT ──
  function exportJSON() {
    if (!state.img) { App.toast('Charge un sprite sheet', 'err'); return; }
    const frames     = Animations.getFrames();
    const usePhaser  = document.getElementById('json-phaser').checked;
    const usePixiJS  = document.getElementById('json-pixijs').checked;
    const format     = usePhaser ? 'phaser' : 'pixijs';
    let data;

    if (format === 'phaser') {
      data = {
        textures: [{
          image: 'spritesheet.png',
          format: 'RGBA8888',
          size:   { w: state.img.naturalWidth, h: state.img.naturalHeight },
          scale:  1,
          frames: frames.map((fi, i) => {
            const { sx, sy, sw, sh } = Renderer.getRect(fi);
            return {
              filename:        `frame_${String(i).padStart(3, '0')}`,
              rotated:         false,
              trimmed:         false,
              sourceSize:      { w: sw, h: sh },
              spriteSourceSize:{ x: 0, y: 0, w: sw, h: sh },
              frame:           { x: sx, y: sy, w: sw, h: sh }
            };
          })
        }]
      };
      // Add animations
      if (state.anims.length > 0) {
        data.animations = {};
        state.anims.forEach(a => {
          const aFrames = [];
          for (let i = a.start; i <= a.end; i++) aFrames.push(`frame_${String(i - a.start).padStart(3, '0')}`);
          data.animations[a.name] = { frames: aFrames, frameRate: state.fps, repeat: -1 };
        });
      }
    } else {
      // PixiJS format
      data = { frames: {}, meta: { image: 'spritesheet.png', size: { w: state.img.naturalWidth, h: state.img.naturalHeight }, scale: '1' } };
      frames.forEach((fi, i) => {
        const { sx, sy, sw, sh } = Renderer.getRect(fi);
        data.frames[`frame_${String(i).padStart(3, '0')}`] = {
          frame:           { x: sx, y: sy, w: sw, h: sh },
          sourceSize:      { w: sw, h: sh },
          spriteSourceSize:{ x: 0, y: 0, w: sw, h: sh }
        };
      });
    }

    const json    = JSON.stringify(data, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    download(url, `spritesheet_${format}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    App.toast('JSON exporté !', 'ok');
  }

  // ── PROJECT SAVE / LOAD ──
  function saveProject() {
    if (!state.img) { App.toast('Rien à sauvegarder', 'err'); return; }
    const data = {
      version:       2,
      cols:          parseInt(document.getElementById('cols').value),
      rows:          parseInt(document.getElementById('rows').value),
      offx:          parseInt(document.getElementById('offx').value) || 0,
      offy:          parseInt(document.getElementById('offy').value) || 0,
      padx:          parseInt(document.getElementById('padx').value) || 0,
      pady:          parseInt(document.getElementById('pady').value) || 0,
      fps:           state.fps,
      zoom:          state.zoom,
      bgMode:        state.bgMode,
      bgColor:       state.bgColor,
      anims:         state.anims,
      frameOffsets:  state.frameOffsets,
      frameDurations:state.frameDurations,
      customSize:    state.customSize,
      guides:        Rulers.getGuides(),
      layers:        Assets.getLayersData(),
      layerFrameProps: Assets.frameProps,
      customW:       state.customW,
      customH:       state.customH
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    download(url, 'projet.spanim');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    App.toast('Projet sauvegardé !', 'ok');
  }

  function applyProject(data) {
    document.getElementById('cols').value = data.cols;
    document.getElementById('rows').value = data.rows;
    document.getElementById('offx').value = data.offx || 0;
    document.getElementById('offy').value = data.offy || 0;
    document.getElementById('padx').value = data.padx || 0;
    document.getElementById('pady').value = data.pady || 0;
    document.getElementById('fps').value  = data.fps;
    document.getElementById('zoom').value = data.zoom;
    document.getElementById('bg-mode').value = data.bgMode || 'checker';
    document.getElementById('bgc').value = data.bgColor || '#ffffff';

    state.fps           = data.fps;
    state.zoom          = data.zoom;
    state.bgMode        = data.bgMode || 'checker';
    state.bgColor       = data.bgColor || '#ffffff';
    state.anims         = data.anims || [];
    state.frameOffsets  = data.frameOffsets || {};
    state.frameDurations= data.frameDurations || {};
    state.customSize    = !!data.customSize;
    state.customW       = data.customW || 0;
    state.customH       = data.customH || 0;
    if (data.guides) Rulers.setGuides(data.guides);
    if (data.layers) Assets.applyLayersData(data.layers, data.layerFrameProps);

    document.getElementById('fpsv').textContent  = state.fps + ' fps';
    document.getElementById('zvl').textContent   = state.zoom + '×';
    document.getElementById('custom-size').checked = state.customSize;
    document.getElementById('fw').disabled = !state.customSize;
    document.getElementById('fh').disabled = !state.customSize;

    Animations.renderList();
    Animations.updateCompareSelect();
    App.toast('Projet chargé !', 'ok');
  }

  return { init, exportGif, exportFrames, exportJSON, saveProject, applyProject };

})();
