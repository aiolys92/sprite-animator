// ── EXPORTMENU.JS ──
// Figma-style export panel: floating overlay with collapsible sections

const ExportMenu = (() => {

  let open      = false;
  let openBlocks = new Set(['gif']); // which blocks are expanded

  function toggle() {
    open ? close() : show();
  }

  function show() {
    if (!document.getElementById('expbtn').disabled === false) return; // no sprite loaded check handled by disabled state
    open = true;
    updateInfo();
    const menu = document.getElementById('export-menu');
    menu.classList.remove('hidden');
    // Animate in
    requestAnimationFrame(() => {
      document.getElementById('export-panel').classList.add('visible');
    });
  }

  function close() {
    open = false;
    const panel = document.getElementById('export-panel');
    panel.classList.remove('visible');
    setTimeout(() => {
      document.getElementById('export-menu').classList.add('hidden');
    }, 200);
  }

  function toggleBlock(name) {
    if (openBlocks.has(name)) {
      openBlocks.delete(name);
    } else {
      openBlocks.add(name);
    }
    renderBlocks();
  }

  function renderBlocks() {
    ['gif', 'png', 'json', 'proj'].forEach(name => {
      const body  = document.getElementById('exp-body-' + name);
      const chev  = document.getElementById('exp-chev-' + name);
      const block = document.getElementById('exp-block-' + name);
      if (!body) return;
      const isOpen = openBlocks.has(name);
      body.style.display  = isOpen ? 'block' : 'none';
      if (chev)  chev.textContent = isOpen ? '▾' : '▸';
      if (block) block.classList.toggle('open', isOpen);
    });
  }

  function updateInfo() {
    // Update the summary line at the top
    const el = document.getElementById('export-info');
    if (!el || typeof App === 'undefined') return;
    const state = App.state;
    if (!state || !state.img) { el.textContent = ''; return; }

    const frames = state.getFrames ? state.getFrames() : [];
    const { sprW, sprH } = state;
    const gifScale = state.gifScale || 2;
    el.textContent = `${frames.length} frames · ${sprW}×${sprH}px · GIF ${Math.round(sprW*gifScale)}×${Math.round(sprH*gifScale)}`;

    // Update desc lines
    const descGif  = document.getElementById('exp-desc-gif');
    const descPng  = document.getElementById('exp-desc-png');
    if (descGif) descGif.textContent = `${frames.length} frames · ${Math.round(sprW*gifScale)}×${Math.round(sprH*gifScale)}px`;
    if (descPng) {
      const escale = parseInt(document.getElementById('em-escale')?.value || 1);
      descPng.textContent = `${frames.length} fichiers PNG · ${sprW*escale}×${sprH*escale}px`;
    }
  }

  // Init — called after App.init()
  function init() {
    renderBlocks();
    // Keep desc updated when sliders change
    document.getElementById('em-escale')?.addEventListener('input', updateInfo);
    document.getElementById('em-gscale')?.addEventListener('input', updateInfo);
    // Close on Escape
    document.addEventListener('keydown', e => { if (e.code === 'Escape' && open) close(); });
  }

  // Enable/disable export buttons when sprite loads
  function setEnabled(val) {
    ['expbtn','expframes','expjson','btn-export-main','btn-add-layer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !val;
    });
  }

  return { toggle, show, close, toggleBlock, init, setEnabled, updateInfo };

})();
