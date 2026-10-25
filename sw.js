// Service worker : garde tous les fichiers de l'app en cache pour fonctionner hors ligne.
// VERSION est réécrite automatiquement par tools/stamp.py (hash du contenu) avant chaque déploiement :
// un nouveau VERSION = un nouveau cache = les appareils récupèrent la nouvelle version.
const VERSION = '6852e37b3f';
const CACHE = 'muscu-' + VERSION;
const ASSETS = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'translations.js', 'store.js', 'ui.js', 'library.js', 'sessions.js', 'charts.js', 'progress.js', 'backup.js', 'sync.js', 'app.js',
  'data/exercises_slim.json', 'data/noms_fr.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache:'reload' contourne le cache HTTP pour télécharger des fichiers vraiment à jour
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('muscu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord, réseau seulement si le fichier n'est pas en cache
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('index.html')))
  );
});
