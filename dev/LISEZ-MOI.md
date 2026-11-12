# Lunavia : atelier

Ce dossier contient de quoi modifier et reconstruire l'appli. Le site lui-même est dans le dossier parent (la racine du dépôt).

- `src/` : le code de l'appli (`geo.js` calculs et phrases de guidage, `icons.js` dessins, `demo.js` ville de démonstration,
  `live.js` services en ligne, `app.js` écran et logique, `styles.css`, `body.html`)
- `site/` : ce qui rend l'appli installable (manifeste, icônes, `sw.js` pour la mise en mémoire hors ligne, `README.md`)
- `build.mjs` : assemble tout. `npm install` puis `JALON_SITE=.. node build.mjs` reconstruit le site dans le dossier parent,
  et `dist/jalon.html` (la page de démonstration publiée dans Claude)
- `package.json` : `version`, et `homepage`, l'adresse publique de la vraie carte (la démo y renvoie)
- `test/` : parcours automatiques dans un vrai navigateur. `demo.mjs` joue la ville de démonstration ; `live.mjs` joue la vraie carte
  contre un banc d'essai ; `pwa.mjs` vérifie l'ouverture sans réseau ; `voisinage.mjs` vérifie la cohabitation avec le jeu
  (le jeu servi à `/Bestiolins/`, la carte à `/Bestiolins/jalon/`)
- `banc/` : le banc d'essai. `extract.py` transforme un extrait OpenStreetMap (Utrecht, tiré des données de test de Valhalla)
  en couches de carte et en fausses réponses de services ; `server.mjs` joue le rôle de tous les services en ligne.
  Les itinéraires viennent de vrais moteurs lancés en local : Valhalla (`pip install pyvalhalla`) et OSRM (`npm i @project-osrm/osrm@6.0.0`).

## Deux modes

Lunavia tente de charger le fond de carte en ligne au démarrage. S'il y parvient, tout passe par les services réels.
Si la page qui l'héberge interdit le réseau (l'aperçu dans Claude), elle bascule sur la ville de démonstration,
et propose d'ouvrir la vraie carte à son adresse.

## Mettre en ligne une nouvelle version

1. Modifier `src/` (ou `site/`), augmenter `version` dans `package.json`
2. `JALON_SITE=.. node build.mjs`
3. Envoyer sur GitHub (branche `main`) : le site se met à jour tout seul en une minute environ
4. Republier `dist/jalon.html` comme page de démonstration dans Claude si l'écran a changé
