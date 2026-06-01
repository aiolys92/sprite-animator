// ── gifjs.js ──
// Placeholder: gif.js doit être téléchargé manuellement.
// Voir README.md pour les instructions.
// En attendant, l'export GIF affichera un message d'erreur.

// Minimal stub to avoid crashes
if (typeof GIF === 'undefined') {
  class GIF {
    constructor() {}
    addFrame() {}
    on(evt, cb) { if (evt === 'finished') this._cb = cb; }
    render() {
      console.warn('gif.js non chargé. Voir README.md');
      alert('⚠ gif.js manquant.\n\nTélécharge gif.js depuis :\nhttps://github.com/jnordberg/gif.js/blob/master/dist/gif.js\n\nPuis place-le dans js/gifjs.js');
    }
  }
  window.GIF = GIF;
}
