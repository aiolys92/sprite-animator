// ── ANIMATIONS.JS ──
// Manages animation list, ranges, strip, timeline

const Animations = (() => {

  let state = null;
  function init(appState) { state = appState; }

  // ── FRAME SEQUENCE ──
  function getFrames(animIdx) {
    const idx = animIdx !== undefined ? animIdx : state.activeAnim;
    if (idx < 0 || !state.anims[idx]) {
      return Array.from({ length: state.totalF }, (_, i) => i);
    }
    const a = state.anims[idx];
    const s = Math.max(0, a.start);
    const e = Math.min(state.totalF - 1, a.end);
    let f = [];
    for (let i = s; i <= e; i++) f.push(i);
    if (a.rev) f.reverse();
    if (a.pp) {
      const back = [...f].slice(1, -1).reverse();
      f = [...f, ...back];
    }
    return f;
  }

  // ── RENDER LIST ──
  function renderList() {
    const list = document.getElementById('anim-list');
    list.innerHTML = '';

    const mk = (label, idx, start, end) => {
      const fc   = end - start + 1;
      const item = document.createElement('div');
      item.className = 'aitem' + (state.activeAnim === idx ? ' active' : '');

      // Thumbnail
      const thumb = document.createElement('div');
      thumb.className = 'aitem-thumb';
      if (state.img && state.totalF > 0) {
        const cv = Renderer.buildStripThumb(start, 36);
        thumb.appendChild(cv);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'aitem-info';
      info.innerHTML = `<div class="aitem-name">${label}</div>
        <div class="aitem-meta">${start}—${end} · ${fc} fr.</div>`;

      item.appendChild(thumb);
      item.appendChild(info);

      // Delete button (not for "all frames")
      if (idx >= 0) {
        const del = document.createElement('button');
        del.className   = 'aitem-del';
        del.textContent = '✕';
        del.title       = 'Supprimer';
        del.onclick = e => {
          e.stopPropagation();
          App.pushUndo('suppression animation');
          state.anims.splice(idx, 1);
          if (state.activeAnim === idx) { state.activeAnim = -1; syncEditor(); }
          else if (state.activeAnim > idx) state.activeAnim--;
          renderList();
          buildStrip();
          Renderer.render();
          updateCompareSelect();
        };
        item.appendChild(del);
      }

      item.onclick = () => {
        state.activeAnim = idx;
        state.curFrame   = 0;
        syncEditor();
        renderList();
        buildStrip();
        Renderer.render();
        App.updateInfo();
      };
      list.appendChild(item);
    };

    mk('▶ Toutes les frames', -1, 0, Math.max(0, state.totalF - 1));
    state.anims.forEach((a, i) => mk(a.name, i, a.start, a.end));
  }

  // ── SYNC EDITOR ──
  function syncEditor() {
    if (state.activeAnim < 0 || !state.anims[state.activeAnim]) {
      document.getElementById('aname').value   = '';
      document.getElementById('astart').value  = 0;
      document.getElementById('aend').value    = Math.max(0, state.totalF - 1);
      document.getElementById('arev').checked  = false;
      document.getElementById('appc').checked  = false;
      return;
    }
    const a = state.anims[state.activeAnim];
    document.getElementById('aname').value   = a.name;
    document.getElementById('astart').value  = a.start;
    document.getElementById('aend').value    = a.end;
    document.getElementById('arev').checked  = !!a.rev;
    document.getElementById('appc').checked  = !!a.pp;
  }
  // ── FRAME STRIP ──
  function buildStrip() {
    const strip    = document.getElementById('strip');
    const timeline = document.getElementById('timeline');
    strip.innerHTML    = '';
    timeline.innerHTML = '';
    if (!state.img) return;

    const frames = getFrames();
    frames.forEach((fi, i) => {
      const hasOff = state.frameOffsets[fi] &&
        (state.frameOffsets[fi].x || state.frameOffsets[fi].y ||
         state.frameOffsets[fi].w || state.frameOffsets[fi].h);

      // ── Strip thumb ──
      const d = document.createElement('div');
      d.className = 'fthumb' +
        (i === state.curFrame ? ' active' : '') +
        (hasOff ? ' has-offset' : '');
      d.onclick = () => { state.curFrame = i; Renderer.render(); updateCounter(); highlightStrip(); App.updateFoEditor(); };

      const cv = Renderer.buildStripThumb(fi, 48);
      const n  = document.createElement('span');
      n.className   = 'fnum';
      n.textContent = fi;
      d.appendChild(cv); d.appendChild(n);
      strip.appendChild(d);

      // ── Timeline frame ──
      const dur   = state.frameDurations[fi] || (1000 / state.fps);
      const tlW   = Math.max(36, Math.min(120, dur / 16));
      const tf    = document.createElement('div');
      tf.className = 'tl-frame' + (i === state.curFrame ? ' active' : '');
      tf.style.width = tlW + 'px';
      tf.onclick = () => { state.curFrame = i; Renderer.render(); updateCounter(); highlightStrip(); App.updateFoEditor(); };

      const dd  = document.createElement('div');
      dd.className   = 'tl-dur';
      dd.textContent = Math.round(dur) + 'ms';

      const rz = document.createElement('div');
      rz.className = 'tl-resize';
      rz.addEventListener('mousedown', e => {
        e.stopPropagation();
        const startX   = e.clientX;
        const startDur = state.frameDurations[fi] || (1000 / state.fps);
        const onMove = ev => {
          const delta  = (ev.clientX - startX) * 16;
          const newDur = Math.max(50, Math.min(2000, startDur + delta));
          state.frameDurations[fi] = newDur;
          tf.style.width   = Math.max(36, Math.min(120, newDur / 16)) + 'px';
          dd.textContent   = Math.round(newDur) + 'ms';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      tf.appendChild(dd); tf.appendChild(rz);
      timeline.appendChild(tf);
    });
  }

  function highlightStrip() {
    document.getElementById('strip').querySelectorAll('.fthumb').forEach((el, i) =>
      el.classList.toggle('active', i === state.curFrame));
    document.getElementById('timeline').querySelectorAll('.tl-frame').forEach((el, i) =>
      el.classList.toggle('active', i === state.curFrame));
    const active = document.getElementById('strip').querySelector('.fthumb.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function updateCounter() {
    const frames = getFrames();
    document.getElementById('fcnt').textContent = `${state.curFrame + 1} / ${frames.length}`;
    document.getElementById('sframe').textContent = 'frame: ' + (frames[state.curFrame] ?? '—');
  }

  return {
    init,
    getFrames,
    renderList,
    syncEditor,
    buildStrip,
    highlightStrip,
    updateCounter
  };

})();
