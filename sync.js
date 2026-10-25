// Synchronisation entre appareils via un dépôt GitHub privé (fichier data.json).
//   - Réglages (dépôt + jeton) : clé localStorage SÉPARÉE de store.data, donc jamais exportée.
//   - Fusion : séances terminées par id (immuables) ; modèles par date de modification (le plus récent gagne) ;
//     suppressions propagées par "tombstones". La séance en cours n'est jamais synchronisée.
//   - Écriture protégée par le sha du fichier : si un autre appareil a écrit entre-temps, GitHub refuse (409)
//     et on relit, refusionne, réessaie.
const SYNC_KEY = 'muscu.sync';
const SYNC_FILE = 'data.json';

const sync = {
  cfg: null, // { repo, token, lastSync, lastError }
  busy: false,
  pending: false,
  timer: null,
  get on() { return !!(this.cfg && this.cfg.token && this.cfg.repo); },
  load() { try { this.cfg = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { this.cfg = null; } },
  tentative: false, // vrai pendant le premier essai de connexion : un jeton non validé n'est jamais écrit sur disque
  save() {
    if (this.tentative) return;
    try { if (this.cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(this.cfg)); else localStorage.removeItem(SYNC_KEY); } catch (e) {}
  },
};
sync.load();

// ---------- base64 UTF-8 (btoa seul plante sur les accents) ----------
function b64enc(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64dec(b64) {
  const bin = atob(String(b64).replace(/\s/g, '')); // GitHub coupe les lignes
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---------- client API GitHub ----------
class SyncError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function ghApi(path, opts = {}) {
  return fetch('https://api.github.com' + path, {
    cache: 'no-store', // GitHub répond avec max-age=60 : sans ça on lirait des données périmées
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + sync.cfg.token, ...(opts.headers || {}) },
  });
}

async function apiFail(r) {
  let msg = '';
  try { msg = (await r.json()).message || ''; } catch (e) {}
  return new SyncError(r.status, msg);
}

// -> { doc, sha } ; doc = null si le fichier n'existe pas encore
async function readRemote() {
  const repo = sync.cfg.repo;
  const r = await ghApi('/repos/' + repo + '/contents/' + SYNC_FILE);
  if (r.status === 404) {
    // fichier absent, ou dépôt inaccessible avec ce jeton ? on lève le doute
    const chk = await ghApi('/repos/' + repo);
    if (!chk.ok) throw await apiFail(chk);
    return { doc: null, sha: null };
  }
  if (!r.ok) throw await apiFail(r);
  const j = await r.json();
  let b64 = j.encoding === 'base64' && j.content ? j.content : null;
  if (!b64) { // fichier > 1 Mo : l'API "contents" ne renvoie pas le contenu, on passe par le blob
    const b = await ghApi('/repos/' + repo + '/git/blobs/' + j.sha);
    if (!b.ok) throw await apiFail(b);
    b64 = (await b.json()).content;
  }
  let doc;
  try { doc = JSON.parse(b64dec(b64)); } catch (e) { throw new SyncError(0, 'Le fichier de synchronisation est illisible.'); }
  if (!doc || !Array.isArray(doc.templates) || !Array.isArray(doc.sessions)) throw new SyncError(0, 'Le fichier de synchronisation est invalide.');
  return { doc: normDoc(doc), sha: j.sha };
}

async function writeRemote(doc, sha) {
  const body = { message: 'Synchro ' + new Date().toISOString(), content: b64enc(JSON.stringify(doc)) };
  if (sha) body.sha = sha;
  const r = await ghApi('/repos/' + sync.cfg.repo + '/contents/' + SYNC_FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const e = await apiFail(r);
    // sha périmé : 409, parfois 422 avec un message qui parle de sha
    if (e.status === 409 || (e.status === 422 && /sha/i.test(e.message))) e.conflict = true;
    throw e;
  }
}

// ---------- fusion (fonctions pures) ----------
const emptyDoc = () => ({ version: 1, templates: [], sessions: [], tombstones: { templates: {}, sessions: {}, weights: {} }, nameOverrides: {}, bodyweight: [] });

function normDoc(d) {
  const t = (d.tombstones || {});
  return {
    version: 1,
    templates: (d.templates || []).map(cleanTemplate),
    sessions: (d.sessions || []).map(cleanSession),
    tombstones: { templates: t.templates || {}, sessions: t.sessions || {}, weights: t.weights || {} },
    // champs absents des anciens fichiers distants : vides
    nameOverrides: cleanOverrides(d.nameOverrides),
    bodyweight: cleanWeights(d.bodyweight),
  };
}

// JSON à clés triées : permet de comparer deux documents sans faux écarts d'ordre
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortedById = (list) => [...list].sort(byId);
// ordre stable et identique sur tous les appareils : date de création, puis id
const sortedTemplates = (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || byId(a, b));

// a = local (prioritaire à égalité, pour conserver les mêmes objets), b = distant
function mergeDocs(a, b) {
  const tomb = { templates: { ...b.tombstones.templates }, sessions: { ...b.tombstones.sessions }, weights: { ...b.tombstones.weights } };
  for (const kind of ['templates', 'sessions', 'weights']) {
    for (const [id, ts] of Object.entries(a.tombstones[kind])) tomb[kind][id] = Math.max(ts, tomb[kind][id] || 0);
  }
  const templates = new Map();
  for (const t of [...b.templates, ...a.templates]) { // a en dernier : gagne à égalité
    const cur = templates.get(t.id);
    if (!cur || (t.updatedAt || 0) >= (cur.updatedAt || 0)) templates.set(t.id, t);
  }
  // séances : le plus récent gagne (une note peut être modifiée après coup) ; à égalité on garde l'objet local
  const sessions = new Map();
  for (const s of [...b.sessions, ...a.sessions]) {
    const cur = sessions.get(s.id);
    if (!cur || stampOf(s) >= stampOf(cur)) sessions.set(s.id, s);
  }
  const weights = new Map();
  for (const w of [...b.bodyweight, ...a.bodyweight]) {
    const cur = weights.get(w.id);
    if (!cur || w.updatedAt >= cur.updatedAt) weights.set(w.id, w);
  }
  return {
    version: 1,
    // la suppression gagne si elle est postérieure ou égale à la dernière modification du modèle
    templates: sortedTemplates([...templates.values()].filter((t) => !(tomb.templates[t.id] >= (t.updatedAt || 0)))),
    sessions: sortedById([...sessions.values()].filter((s) => !(s.id in tomb.sessions))),
    tombstones: tomb,
    nameOverrides: mergeOverrides(a.nameOverrides, b.nameOverrides),
    bodyweight: [...weights.values()].filter((w) => !(tomb.weights[w.id] >= w.updatedAt)).sort((x, y) => x.t - y.t || byId(x, y)),
  };
}

// état local synchronisable (sans la séance en cours)
const localDoc = () => ({
  version: 1,
  templates: store.data.templates,
  sessions: store.data.sessions.filter((s) => s.end),
  tombstones: store.data.tombstones,
  nameOverrides: store.data.nameOverrides,
  bodyweight: store.data.bodyweight,
});

function applyDoc(doc) {
  const d = store.data;
  const active = d.sessions.filter((s) => !s.end); // jamais touchées
  d.templates = doc.templates;
  d.sessions = [...active, ...doc.sessions];
  d.tombstones = doc.tombstones;
  d.nameOverrides = doc.nameOverrides;
  d.bodyweight = doc.bodyweight;
  lib.refreshOverrides(); // recherche à jour avec les noms reçus des autres appareils
  store.save();
}

// ---------- exécution ----------
function friendlyError(e) {
  if (e instanceof TypeError) return 'Pas de connexion.';
  if (e.status === 401) return 'Jeton invalide ou expiré : crée-en un nouveau et saisis-le à nouveau.';
  if (e.status === 403) return "Accès refusé : le jeton doit avoir la permission « Contents : Read and write » sur le dépôt (ou limite de requêtes atteinte).";
  if (e.status === 404) return "Dépôt introuvable : vérifie son nom et que le jeton a accès à ce dépôt.";
  if (e.conflict) return 'Conflit avec un autre appareil, réessaie dans un instant.';
  return e.message || 'Erreur de synchronisation.';
}

async function runSync({ manual = false } = {}) {
  if (!sync.on) return false;
  if (sync.busy) { sync.pending = true; return false; }
  if (!manual && navigator.onLine === false) return false;
  sync.busy = true;
  let ok = false;
  try {
    let merged;
    for (let attempt = 0; ; attempt++) {
      const { doc: remote, sha } = await readRemote();
      merged = mergeDocs(localDoc(), remote || emptyDoc());
      if (remote && canon(merged) === canon(remote)) break; // rien à écrire : pas de commit inutile
      try { await writeRemote(merged, sha); break; }
      catch (e) { if (e.conflict && attempt < 3) continue; throw e; }
    }
    // on refusionne avec l'état local ACTUEL : il a pu changer pendant les appels réseau
    applyDoc(mergeDocs(localDoc(), merged));
    if (canon(localDoc()) !== canon(merged)) sync.pending = true; // modifié pendant la synchro : on repasse
    sync.cfg.lastSync = Date.now();
    sync.cfg.lastError = null;
    ok = true;
  } catch (e) {
    sync.cfg.lastError = friendlyError(e);
    if (manual) toast(sync.cfg.lastError);
  } finally {
    sync.busy = false;
    sync.save();
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#view') && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typeof refreshView === 'function' && !typing) refreshView();
    if (sync.pending) { sync.pending = false; syncSoon(300); }
  }
  return ok;
}

// Déclenchement automatique, groupé (anti-rebond)
function syncSoon(delay = 1500) {
  if (!sync.on) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => runSync(), delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sync.on && Date.now() - (sync.cfg.lastSync || 0) > 60000) syncSoon(500);
});
window.addEventListener('online', () => syncSoon(1000));

// ---------- carte "Synchronisation" des Réglages ----------
function renderSyncCard() {
  if (sync.on) {
    const c = sync.cfg;
    return h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Connecté à ' + c.repo),
      h('p', { class: 'muted' }, c.lastSync ? 'Dernière synchronisation : ' + fmtDate(c.lastSync) : 'Pas encore synchronisé.'),
      c.lastError && h('p', { class: 'muted err' }, c.lastError),
      h('button', { class: 'btn primary wide', disabled: sync.busy, onclick: async () => { if (await runSync({ manual: true })) toast('Synchronisé'); } }, sync.busy ? 'Synchronisation…' : 'Synchroniser maintenant'),
      h('button', { class: 'btn wide', onclick: () => {
        if (!confirm('Déconnecter cet appareil ? Tes données restent ici ; seul le jeton est effacé.')) return;
        sync.cfg = null; sync.save(); refreshView();
      } }, 'Déconnecter cet appareil'));
  }
  const repo = h('input', { type: 'text', value: 'metamike97/muscu-data', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  const token = h('input', { type: 'password', placeholder: 'Colle ici ton jeton', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  return h('div', { class: 'card' },
    h('p', { class: 'muted' }, "Garde tes séances identiques sur tous tes appareils via un dépôt GitHub privé. Sur github.com : Settings → Developer settings → Fine-grained tokens → Generate. Accès : uniquement le dépôt muscu-data ; permission « Contents : Read and write »."),
    h('p', { class: 'muted' }, "Colle le jeton ici, dans l'app installée. Ne l'envoie jamais à personne ni dans un chat."),
    h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Dépôt'), repo),
    h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Jeton'), token),
    h('button', { class: 'btn primary wide', onclick: async (ev) => {
      const r = repo.value.trim(), t = token.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return toast('Dépôt invalide (format : utilisateur/nom)');
      if (!t) return toast('Colle ton jeton');
      ev.target.disabled = true;
      sync.cfg = { repo: r, token: t, lastSync: null, lastError: null };
      sync.tentative = true;
      const ok = await runSync({ manual: true });
      sync.tentative = false;
      if (ok) toast('Synchronisation activée');
      else { sync.cfg = null; ev.target.disabled = false; } // on n'enregistre pas un jeton qui ne marche pas
      sync.save();
      refreshView();
    } }, 'Enregistrer et synchroniser'));
}
