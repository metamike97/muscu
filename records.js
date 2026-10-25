// Records personnels. Rien n'est stocké : tout est recalculé à partir de l'historique, donc toujours cohérent
// (et identique sur tous les appareils après synchronisation).
//   - charge max : la série la plus lourde
//   - 1RM estimé : formule d'Epley, kg × (1 + reps / 30) (indicatif au-delà de ~12 reps)
//   - reps max : seulement pour les séries au poids du corps (0 kg)
// Un record n'est signalé que s'il bat strictement un résultat antérieur (la toute première fois ne compte pas).

const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);

function baselineBests(exId, beforeStart, excludeId) {
  const b = { kg: 0, e1rm: 0, reps0: 0, any: false };
  for (const s of store.data.sessions) {
    if (!s.end || s.id === excludeId || s.start >= beforeStart) continue;
    for (const ex of s.exercises) {
      if (ex.exId !== exId) continue;
      for (const x of ex.sets) {
        if (!x.done) continue;
        b.any = true;
        const kg = x.kg || 0, reps = x.reps || 0;
        b.kg = Math.max(b.kg, kg);
        b.e1rm = Math.max(b.e1rm, e1rm(kg, reps));
        if (kg === 0) b.reps0 = Math.max(b.reps0, reps);
      }
    }
  }
  return b;
}

// Map "indexExercice:indexSérie" -> ['kg' | '1rm' | 'reps'] pour les séries qui battent un record dans cette séance
function prFlags(session) {
  const out = new Map();
  session.exercises.forEach((ex, ei) => {
    const base = baselineBests(ex.exId, session.start, session.id);
    const run = { ...base };
    ex.sets.forEach((st, si) => {
      if (!st.done) return;
      const kg = st.kg || 0, reps = st.reps || 0, est = e1rm(kg, reps);
      const flags = [];
      if (base.any) {
        if (kg > run.kg) flags.push('kg');
        if (est > run.e1rm + 1e-9) flags.push('1rm');
        if (kg === 0 && reps > run.reps0) flags.push('reps');
      }
      run.kg = Math.max(run.kg, kg);
      run.e1rm = Math.max(run.e1rm, est);
      if (kg === 0) run.reps0 = Math.max(run.reps0, reps);
      if (flags.length) out.set(ei + ':' + si, flags);
    });
  });
  return out;
}

// texte du badge : on n'affiche que le record le plus parlant (charge > 1RM > reps)
function prText(flags, st) {
  if (flags.includes('kg')) return 'Record de charge : ' + fmtNum(st.kg) + ' kg';
  if (flags.includes('1rm')) return 'Record de 1RM estimé : ' + fmtNum(Math.round(e1rm(st.kg, st.reps) * 10) / 10) + ' kg';
  return 'Record de répétitions : ' + st.reps;
}

// Records actuels d'un exercice : { kg:{v,reps,t}, e1rm:{v,kg,reps,t}, reps0:{v,t} } (null si aucun)
function exerciseRecords(exId) {
  const r = { kg: null, e1rm: null, reps0: null };
  const finished = store.data.sessions.filter((s) => s.end).sort((a, b) => a.start - b.start);
  for (const s of finished) {
    for (const ex of s.exercises) {
      if (ex.exId !== exId) continue;
      for (const x of ex.sets) {
        if (!x.done) continue;
        const kg = x.kg || 0, reps = x.reps || 0, est = e1rm(kg, reps);
        if (kg > 0 && (!r.kg || kg > r.kg.v)) r.kg = { v: kg, reps, t: s.start };
        if (est > 0 && (!r.e1rm || est > r.e1rm.v + 1e-9)) r.e1rm = { v: est, kg, reps, t: s.start };
        if (kg === 0 && reps > 0 && (!r.reps0 || reps > r.reps0.v)) r.reps0 = { v: reps, t: s.start };
      }
    }
  }
  return r;
}

const shortDate = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
const round1r = (v) => Math.round(v * 10) / 10;

// lignes "libellé / valeur / date" pour un exercice
function recordLines(r) {
  const lines = [];
  if (r.kg) lines.push(['Charge max', fmtNum(r.kg.v) + ' kg × ' + r.kg.reps, r.kg.t]);
  if (r.e1rm) lines.push(['1RM estimé', fmtNum(round1r(r.e1rm.v)) + ' kg', r.e1rm.t]);
  if (r.reps0) lines.push(['Reps max (poids du corps)', String(r.reps0.v), r.reps0.t]);
  return lines;
}

// Écran "Records" (dans l'onglet Progrès)
function renderRecordsList(container) {
  const ids = [...new Set(store.data.sessions.filter((s) => s.end).flatMap((s) => s.exercises.map((e) => e.exId)))];
  const rows = ids.map((id) => ({ id, r: exerciseRecords(id) }))
    .filter((x) => x.r.kg || x.r.e1rm || x.r.reps0)
    .map((x) => ({ ...x, last: Math.max(...recordLines(x.r).map((l) => l[2])) }))
    .sort((a, b) => b.last - a.last);
  setChildren(container,
    rows.length === 0 && h('p', { class: 'muted' }, 'Tes records apparaîtront ici dès ta première séance terminée.'),
    rows.length > 0 && h('p', { class: 'muted small' }, 'Triés du plus récent au plus ancien. Le 1RM est une estimation (formule d\'Epley).'),
    rows.map(({ id, r }) => h('div', { class: 'card tap', onclick: () => openProgress(id) },
      h('div', { class: 'row between' }, h('b', {}, lib.fr(id)), h('span', { class: 'muted' }, '›')),
      recordLines(r).map(([label, value, t]) => h('div', { class: 'histset' }, h('span', { class: 'muted' }, label), h('span', {}, h('b', {}, value), h('span', { class: 'muted small' }, '  ' + shortDate(t))))))));
}
