// Réglages : sauvegarde (export) et restauration (import) des données en JSON.
const BACKUP_APP = 'muscu';
const BACKUP_VERSION = 1;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

function buildBackup() {
  const d = store.data;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      templates: d.templates,
      sessions: d.sessions.filter((s) => s.end), // la séance en cours n'est pas exportée
      nameOverrides: d.nameOverrides || {}, // noms d'exercices corrigés
    },
  };
}

async function exportData() {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = 'muscu-' + stamp + '.json';
  const text = JSON.stringify(buildBackup(), null, 1);
  const file = new File([text], name, { type: 'application/json' });
  let saved = false;
  try {
    // iPhone : la feuille de partage permet "Enregistrer dans Fichiers"
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      saved = true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // l'utilisateur a annulé
  }
  if (!saved) {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  store.data.lastExport = Date.now();
  store.save();
  toast('Sauvegarde exportée');
  refreshView();
}

// Vérifie la forme du fichier ; renvoie { templates, sessions, nameOverrides } ou lève une erreur
function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error("Ce fichier n'est pas du JSON valide."); }
  if (!obj || obj.app !== BACKUP_APP || !obj.data) throw new Error("Ce fichier n'est pas une sauvegarde de cette app.");
  if (obj.version > BACKUP_VERSION) throw new Error('Sauvegarde issue d\'une version plus récente de l\'app.');
  const { templates, sessions } = obj.data;
  if (!Array.isArray(templates) || !Array.isArray(sessions)) throw new Error('Sauvegarde incomplète.');
  const okEx = (e) => e && typeof e.exId === 'string';
  const validT = templates.filter((t) => t && t.id && typeof t.name === 'string' && Array.isArray(t.exercises) && t.exercises.every(okEx));
  const validS = sessions.filter((s) => s && s.id && typeof s.start === 'number' && typeof s.end === 'number' &&
    Array.isArray(s.exercises) && s.exercises.every((e) => okEx(e) && Array.isArray(e.sets)));
  // les éléments supprimés (sur n'importe quel appareil) ne ressuscitent pas par un import
  const tomb = store.data.tombstones;
  const goodT = validT.filter((t) => !tomb.templates[t.id]);
  const goodS = validS.filter((s) => !tomb.sessions[s.id]);
  return {
    templates: goodT, sessions: goodS,
    skipped: templates.length - validT.length + sessions.length - validS.length,
    deleted: validT.length - goodT.length + validS.length - goodS.length,
    nameOverrides: cleanOverrides(obj.data.nameOverrides),
  };
}

// Fusion par identifiant : on ajoute ce qui manque ; si l'id existe déjà, on garde le plus récent
// (les séances terminées ne changent plus ; les modèles ont une date de modification updatedAt)
function mergeById(local, incoming) {
  const map = new Map(local.map((x) => [x.id, x]));
  let added = 0, updated = 0;
  for (const x of incoming) {
    const cur = map.get(x.id);
    if (!cur) { added++; map.set(x.id, x); }
    else if ((x.updatedAt || 0) >= (cur.updatedAt || 0)) { updated++; map.set(x.id, x); }
  }
  return { list: [...map.values()], added, updated };
}

async function importData(file) {
  let b;
  try { b = parseBackup(await file.text()); } catch (e) { return alert(e.message); }
  const names = Object.keys(b.nameOverrides).length;
  if (!b.sessions.length && !b.templates.length && !names) return alert(b.deleted ? 'Tout ce que contient ce fichier a été supprimé depuis : rien à importer.' : 'Aucune séance ni modèle valide dans ce fichier.');
  const s = mergeById(store.data.sessions, b.sessions);
  const t = mergeById(store.data.templates, b.templates);
  const msg = 'Importer ' + b.sessions.length + ' séance(s), ' + b.templates.length + ' modèle(s) et ' + names + ' nom(s) d\'exercice corrigé(s) ?\n' +
    '• Nouveaux : ' + (s.added + t.added) + '\n• Déjà présents (remplacés) : ' + (s.updated + t.updated) +
    (b.skipped ? '\n• Ignorés (invalides) : ' + b.skipped : '') +
    (b.deleted ? '\n• Ignorés (supprimés depuis) : ' + b.deleted : '') + '\n\nRien n\'est supprimé de ce qui existe déjà.';
  if (!confirm(msg)) return;
  store.data.sessions = s.list;
  store.data.templates = t.list;
  store.data.nameOverrides = mergeOverrides(store.data.nameOverrides, b.nameOverrides);
  lib.refreshOverrides();
  store.save();
  toast('Import terminé');
  refreshView();
  syncSoon();
}

function renderSettings(root) {
  const d = store.data;
  const finished = d.sessions.filter((s) => s.end).length;
  const picker = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); } });
  const persistLine = h('p', { class: 'muted' });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => (persistLine.textContent = p ? 'Stockage protégé par le navigateur : oui.' : 'Stockage protégé par le navigateur : non garanti. Fais des sauvegardes régulières.'));
  }

  root.replaceChildren(h('div', { class: 'pad' },
    h('h1', {}, 'Réglages'),
    h('h2', {}, 'Sauvegarde'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, finished + ' séance(s) · ' + d.templates.length + ' modèle(s)'),
      h('p', { class: 'muted' }, d.lastExport ? 'Dernier export : ' + fmtDate(d.lastExport) : "Jamais exporté."),
      h('button', { class: 'btn primary wide', onclick: exportData }, 'Exporter mes données'),
      h('button', { class: 'btn wide', onclick: () => picker.click() }, 'Importer un fichier'),
      picker,
      h('p', { class: 'muted' }, "Les données restent sur cet appareil. Exporte régulièrement : sur iPhone, choisis « Enregistrer dans Fichiers » (iCloud Drive). L'import fusionne sans rien effacer.")),
    persistLine,
    h('h2', {}, 'Synchronisation'),
    renderSyncCard(),
    h('h2', {}, 'À propos'),
    h('p', { class: 'muted' }, "Bibliothèque d'exercices : free-exercise-db (domaine public).")));
}

function backupReminder() {
  const d = store.data;
  const finished = d.sessions.filter((s) => s.end).length;
  const stale = !d.lastExport || Date.now() - d.lastExport > 14 * 864e5;
  // la synchronisation tient lieu de sauvegarde tant qu'elle fonctionne
  if (sync.on && sync.cfg.lastSync && !sync.cfg.lastError && Date.now() - sync.cfg.lastSync < 14 * 864e5) return null;
  return finished > 0 && stale
    ? h('div', { class: 'card banner' }, h('div', { class: 'grow muted' }, 'Pense à sauvegarder tes données.'), h('button', { class: 'btn', onclick: () => showTab('reglages') }, 'Réglages'))
    : null;
}
