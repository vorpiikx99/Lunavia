# Lunavia

**Ouvrir la carte : https://vorpiikx99.github.io/Lunavia/**

Lunavia est une carte de navigation qui réunit le meilleur des applis du genre : recherche de lieux et d'adresses,
itinéraires en voiture, à vélo ou à pied, guidage vocal en français, guidage par voie, limitations de vitesse,
signalements sur la route, prix des carburants en France, météo à l'arrivée.

Elle fonctionne dans le navigateur et s'installe sur l'écran d'accueil du téléphone. Aucun compte, aucune publicité :
les lieux enregistrés restent sur l'appareil.

## Données et services

- Fond de carte : OpenFreeMap, d'après OpenStreetMap et OpenMapTiles
- Recherche : Photon (komoot) et Base Adresse Nationale
- Itinéraires : Valhalla et OSRM (serveurs FOSSGIS)
- Lieux utiles : Overpass (OpenStreetMap)
- Prix des carburants : données ouvertes du ministère de l'Économie
- Photos aériennes : IGN
- Météo : Open-Meteo

Ces services sont gratuits et partagés : ils conviennent à un usage personnel. Pour ouvrir Lunavia à un large public,
il faudra passer à des offres prévues pour cela.

## Où vit Lunavia

Ce dépôt ne contient que Lunavia. Le site est à la racine (`index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/`),
l'atelier (code source, montage, essais) dans `dev/`, voir `dev/LISEZ-MOI.md`.

Lunavia garde ses lieux sur l'appareil sous la clé `jalon.v1`, et ses réserves hors ligne s'appellent `jalon-…`
(l'ancien nom de l'appli, conservé pour ne pas perdre les données déjà enregistrées).

Version 1.7.2-mwe5y9rp
