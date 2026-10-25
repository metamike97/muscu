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

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
