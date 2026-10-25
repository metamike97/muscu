// Point d'entrée : onglets et affichage.
let currentTab = 'seances';

function refreshView() {
  const view = document.getElementById('view');
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === currentTab));
  if (currentTab === 'seances') renderHome(view);
  else if (currentTab === 'progres') renderProgressList(view);
  else if (currentTab === 'reglages') renderSettings(view);
  else mountLibrary(view);
}

function showTab(name) {
  currentTab = name;
  window.scrollTo(0, 0);
  refreshView();
}

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// Hors ligne : le service worker est actif sur le site publié.
// En local (localhost) il est désactivé pour ne pas servir de vieux fichiers pendant le développement ; ajouter ?sw=1 pour le tester.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || location.search.includes('sw=1'))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Demande au navigateur de ne pas purger les données (Safari peut l'ignorer)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

store.load();
lib.ready.then(() => {
  refreshView();
  // reprise automatique d'une séance en cours (ex. app rouverte après fermeture)
  const a = store.data.activeId && sessionById(store.data.activeId);
  if (a) openSession(a.id);
  syncSoon(500); // synchronisation au démarrage (si activée)
});
