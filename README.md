# 🎮 Sprite Animator — Version Web

Ouvre `index.html` dans Chrome ou Safari. Aucune installation requise.

## Démarrage rapide

1. Double-clique sur `index.html`
2. Clique sur "📂 Ouvrir" ou glisse une image dans la fenêtre
3. C'est tout !

---

## ⚠ Configuration de gif.js (pour l'export GIF)

L'export GIF nécessite la bibliothèque `gif.js` qui ne peut pas être incluse automatiquement.

**Étapes :**

1. Va sur : https://github.com/jnordberg/gif.js/blob/master/dist/gif.js
2. Clique sur "Raw" puis `Cmd+S` pour sauvegarder
3. Renomme le fichier en `gifjs.js`
4. Place-le dans le dossier `js/` (remplace le fichier existant)
5. Fais de même pour `gif.worker.js` :
   https://github.com/jnordberg/gif.js/blob/master/dist/gif.worker.js
   → place-le dans `js/gif.worker.js`

Sans gif.js, toutes les autres fonctionnalités marchent normalement.

---

## Structure des fichiers

```
sprite-animator/
├── index.html          ← Ouvre ce fichier dans le navigateur
├── css/
│   └── style.css       ← Tous les styles
├── js/
│   ├── app.js          ← État central, playback, coordination
│   ├── renderer.js     ← Dessin canvas, zoom, grille, onion skin
│   ├── animations.js   ← Gestion des animations, strip, timeline
│   ├── export.js       ← GIF, PNG, JSON, sauvegarde projet
│   └── gifjs.js        ← ← Remplace par le vrai gif.js (voir ci-dessus)
└── README.md
```

---

## Fonctionnalités

| Fonctionnalité | Détail |
|---|---|
| 🗂 Découpage auto | Colonnes, lignes, décalages, espacements |
| ✦ Auto-détection | Analyse la transparence pour trouver l'offset |
| 🔍 Zoom 0.5×–12× | Slider ou molette de souris |
| ⚡ FPS 1–60 | Avec durées individuelles par frame (timeline) |
| 🎭 Animations nommées | Plages, inverse, ping-pong |
| 📐 Décalage par frame | Offset X/Y + crop W/H indépendant par frame |
| 📏 Taille personnalisée | Force une taille de frame fixe |
| 👻 Onion skin | Frame précédente en transparence |
| 🟣 Grille de pixels | Visualise les pixels au zoom |
| ⊞ Comparaison | Deux animations côte à côte |
| 🎞 Export GIF | Avec qualité et échelle |
| 🖼 Export PNG | Frames individuelles numérotées |
| 📄 Export JSON | Format Phaser 3 ou PixiJS |
| 💾 Projet .spanim | Sauvegarde/chargement de la configuration |
| ↩ Undo | 30 niveaux d'annulation (Cmd/Ctrl+Z) |
| ⛶ Plein écran | Prévisualisation sans interface |

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Espace` | Play / Pause |
| `←` | Frame précédente |
| `→` | Frame suivante |
| `Cmd/Ctrl+Z` | Annuler |
| `Cmd/Ctrl+R` | Recalculer la grille |
| `Échap` | Fermer modal / plein écran |
| `Molette` | Zoom sur le canvas |

## Format .spanim

Fichier JSON contenant toute la configuration (grille, animations, offsets, FPS…).
L'image source n'est **pas** embarquée — elle doit rester accessible séparément.
