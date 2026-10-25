# Muscu

Suivi de séances de musculation : PWA statique (HTML/JS/CSS, sans framework), installable sur iPhone, hors ligne.

- Bibliothèque : [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (domaine public), noms traduits en français.
- Données : stockées sur l'appareil (localStorage). Export/import JSON dans l'onglet Réglages.

## Développement

    python3 -m http.server 8000      # puis ouvrir http://127.0.0.1:8000/

## Régénérer la bibliothèque allégée

    mkdir -p data && curl -L -o data/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
    python3 tools/build_slim.py

## Avant chaque déploiement

    python3 tools/stamp.py           # met à jour la version du cache hors ligne dans sw.js
