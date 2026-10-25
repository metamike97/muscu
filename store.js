// Stockage : tout est dans un seul objet JSON sauvegardé dans le localStorage.
//   templates : modèles de séances  { id, name, exercises:[{exId, sets, reps, restSec}] }
//   sessions  : séances réalisées   { id, name, templateId, start, end, exercises:[{exId, restSec, targetReps, sets:[{kg, reps, rir, done, ts}]}] }
//   activeId  : id de la séance en cours (ou null)
//   rest      : chrono de repos en cours { endsAt, total, beeped } (ou null)
const KEY = 'muscu.v1';

const store = {
  data: null,
  saveOk: true,

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      this.data = null;
    }
    if (!this.data) this.data = { version: 1, templates: [], sessions: [], activeId: null, rest: null };
    // tombstones : suppressions { id: horodatage }, nécessaires pour que la synchro propage les suppressions
    const d = this.data;
    d.tombstones = d.tombstones || {};
    d.tombstones.templates = d.tombstones.templates || {};
    d.tombstones.sessions = d.tombstones.sessions || {};
    d.nameOverrides = cleanOverrides(d.nameOverrides);
    return d;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.saveOk = true;
    } catch (e) {
      if (this.saveOk) toast("Impossible d'enregistrer les données sur cet appareil");
      this.saveOk = false;
    }
  },
};

// nameOverrides : noms d'exercices corrigés par l'utilisateur { exId: { name, updatedAt } }.
// name === '' = "rétabli" : on garde l'entrée pour que le rétablissement se propage aux autres appareils.
// Ces données peuvent venir d'un fichier ou du dépôt distant : on ne garde que ce qui a la bonne forme.
function cleanOverrides(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [id, o] of Object.entries(obj)) {
    if (o && typeof o === 'object' && typeof o.name === 'string' && o.name.length <= 200 && Number.isFinite(o.updatedAt)) {
      out[id] = { name: o.name, updatedAt: o.updatedAt };
    }
  }
  return out;
}
// le plus récent gagne ; à égalité, a (local) l'emporte
function mergeOverrides(a, b) {
  const out = { ...b };
  for (const [id, o] of Object.entries(a)) if (!out[id] || o.updatedAt >= out[id].updatedAt) out[id] = o;
  return out;
}

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
