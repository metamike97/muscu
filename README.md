# Muscu

Suivi de séances de musculation : PWA statique (HTML/JS/CSS, sans framework), installable sur iPhone, hors ligne.

- Bibliothèque : [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (domaine public), noms traduits en français.
- Données : stockées sur l'appareil (localStorage). Export/import JSON dans l'onglet Réglages.

## Sécurité : un seul site sur ce domaine

L'app est publiée sur `metamike97.github.io/muscu/`. Le navigateur partage le stockage (localStorage) entre
toutes les pages de `metamike97.github.io` : le jeton de synchro et tout l'historique y sont lisibles par
n'importe quel autre site GitHub Pages de ce compte. Ne publie pas d'autre projet GitHub Pages sur ce compte,
ou déplace d'abord l'app sur son propre domaine (Settings → Pages → Custom domain).

## Développement

    python3 -m http.server 8000      # puis ouvrir http://127.0.0.1:8000/

## Régénérer la bibliothèque allégée

    mkdir -p data && curl -L -o data/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
    python3 tools/build_slim.py

## Avant chaque déploiement

    node tools/check.js              # vérifie la logique sans interface (données reçues, déplacements dans les groupes)
    python3 tools/stamp.py           # met à jour la version du cache hors ligne dans sw.js
