// ── PANELS.JS ──
// Collapsible panel sections, resizable panel widths, panel collapse

const Panels = (() => {

  // ── SECTION TOGGLE ──
  function toggleSection(id) {
    const sec = document.getElementById(id);
    if (!sec) return;
    sec.classList.toggle('collapsed');
    // Persist state
    try {
      const saved = JSON.parse(localStorage.getItem('sa_panels') || '{}');
      saved[id] = sec.classList.contains('collapsed');
      localStorage.setItem('sa_panels', JSON.stringify(saved));
    } catch(e) {}
  }

  function restoreSections() {
    try {
      const saved = JSON.parse(localStorage.getItem('sa_panels') || '{}');
      Object.entries(saved).forEach(([id, collapsed]) => {
        const sec = document.getElementById(id);
        if (sec) sec.classList.toggle('collapsed', collapsed);
      });
    } catch(e) {}
  }

  // ── PANEL COLLAPSE (hide entire panel) ──
  function collapseLeft() {
    const panel = document.getElementById('panel-left');
    const isCollapsed = panel.classList.toggle('collapsed');
    // Show/hide a re-open button
    updatePanelToggleBtns();
  }

  function collapseRight() {
    const panel = document.getElementById('panel-right');
    panel.classList.toggle('collapsed');
    updatePanelToggleBtns();
  }

  function updatePanelToggleBtns() {
    const leftCollapsed  = document.getElementById('panel-left').classList.contains('collapsed');
    const rightCollapsed = document.getElementById('panel-right').classList.contains('collapsed');
    let bar = document.getElementById('panel-toggle-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'panel-toggle-bar';
      document.getElementById('app').appendChild(bar);
    }
    bar.innerHTML = '';
    if (leftCollapsed) {
      const btn = document.createElement('button');
      btn.className = 'panel-show-btn left';
      btn.textContent = '▶ Paramètres';
      btn.onclick = () => { document.getElementById('panel-left').classList.remove('collapsed'); updatePanelToggleBtns(); };
      bar.appendChild(btn);
    }
    if (rightCollapsed) {
      const btn = document.createElement('button');
      btn.className = 'panel-show-btn right';
      btn.textContent = 'Propriétés ◀';
      btn.onclick = () => { document.getElementById('panel-right').classList.remove('collapsed'); updatePanelToggleBtns(); };
      bar.appendChild(btn);
    }
  }

  // ── PANEL RESIZE ──
  function initResize(handleId, panelId, side) {
    const handle = document.getElementById(handleId);
    if (!handle) return;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      handle.classList.add('dragging');
      const panel   = document.getElementById(panelId);
      const startX  = e.clientX;
      const startW  = panel.offsetWidth;
      const minW    = 180;
      const maxW    = 480;

      const onMove = ev => {
        const delta = side === 'right'
          ? ev.clientX - startX      // right panel: drag right = wider
          : startX - ev.clientX;     // left panel:  drag left  = wider — inverted
        // left panel handle is on the right, drag right = wider
        const actualDelta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
        const newW = Math.max(minW, Math.min(maxW, startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX)));
        panel.style.width = newW + 'px';
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Persist width
        try {
          const saved = JSON.parse(localStorage.getItem('sa_panels') || '{}');
          saved[panelId + '_width'] = panel.offsetWidth;
          localStorage.setItem('sa_panels', JSON.stringify(saved));
        } catch(e) {}
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function restoreWidths() {
    try {
      const saved = JSON.parse(localStorage.getItem('sa_panels') || '{}');
      ['panel-left', 'panel-right'].forEach(id => {
        const w = saved[id + '_width'];
        if (w) document.getElementById(id).style.width = w + 'px';
      });
    } catch(e) {}
  }

  // ── INIT ──
  function init() {
    restoreSections();
    restoreWidths();
    initResize('resize-left',  'panel-left',  'left');
    initResize('resize-right', 'panel-right', 'right');
  }

  return { init, toggleSection, collapseLeft, collapseRight };

})();
