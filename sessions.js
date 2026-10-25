// Séances : accueil, modèles, saisie d'une séance en cours, historique.

const DEFAULT_REST = 90;
const newSet = () => ({ kg: null, reps: null, rir: null, done: false });

const sessionById = (id) => store.data.sessions.find((s) => s.id === id);
const volume = (s) =>
  s.exercises.reduce((t, ex) => t + ex.sets.reduce((a, x) => a + (x.done ? (x.kg || 0) * (x.reps || 0) : 0), 0), 0);
const setText = (x) => fmtNum(x.kg) + '×' + x.reps + (x.rir != null ? ' (RIR ' + x.rir + ')' : '');

// Dernière séance terminée contenant cet exercice -> { date, sets }
function lastPerf(exId) {
  const done = store.data.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  for (const s of done) {
    const ex = s.exercises.find((e) => e.exId === exId);
    if (ex && ex.sets.length) return { date: s.start, sets: ex.sets, note: ex.note };
  }
  return null;
}

// charge la plus lourde de la dernière séance (suggestion dans l'éditeur de modèle)
function lastKgText(exId) {
  const p = lastPerf(exId);
  const kg = p ? Math.max(...p.sets.map((x) => x.kg || 0)) : 0;
  return kg > 0 ? fmtNum(kg) : '';
}
// "8-10" si les reps varient, "8" sinon
function repsRange(sets) {
  const r = sets.filter((x) => x.done !== false && x.reps).map((x) => x.reps);
  if (!r.length) return '';
  const lo = Math.min(...r), hi = Math.max(...r);
  return lo === hi ? String(lo) : lo + '-' + hi;
}
// ce dont startSession a besoin, depuis un modèle ou depuis une séance passée
const fromTemplate = (t) => ({
  name: t.name, templateId: t.id, muscles: cleanMuscles(t.muscles),
  exercises: t.exercises.map((te) => ({ exId: te.exId, restSec: te.restSec, targetReps: te.reps, targetKg: te.kg == null ? null : te.kg, nSets: te.sets })),
});
const fromSession = (s) => ({
  name: s.name, templateId: s.templateId || null, muscles: cleanMuscles(s.muscles),
  exercises: s.exercises.map((ex) => ({ exId: ex.exId, restSec: ex.restSec, targetReps: ex.targetReps || repsRange(ex.sets), targetKg: null, nSets: ex.sets.length })),
});

function saveAsTemplate(s) {
  const name = (prompt('Nom du modèle :', s.name) || '').trim();
  if (!name) return;
  const now = Date.now();
  store.data.templates.push({
    id: uid(), name, createdAt: now, updatedAt: now, muscles: sessionMuscles(s),
    exercises: s.exercises.map((ex) => {
      const heavy = ex.sets.find((x) => x.kg > 0);
      return { exId: ex.exId, sets: ex.sets.length, reps: ex.targetReps || repsRange(ex.sets), kg: heavy ? heavy.kg : null, restSec: ex.restSec == null ? DEFAULT_REST : ex.restSec };
    }),
  });
  store.save();
  refreshView();
  syncSoon();
  toast('Modèle « ' + name + ' » créé');
}

// ---------- Accueil ----------

function renderHome(root) {
  const d = store.data;
  const active = d.activeId && sessionById(d.activeId);
  const history = d.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);

  root.replaceChildren(h('div', { class: 'pad' },
    h('h1', {}, 'Séances'),
    backupReminder(),

    active && h('div', { class: 'card banner' },
      h('div', { class: 'grow' }, h('b', {}, 'Séance en cours'), h('div', { class: 'muted' }, active.name + ' · commencée ' + fmtDate(active.start))),
      h('button', { class: 'btn primary', onclick: () => openSession(active.id) }, 'Reprendre')),

    !active && h('button', { class: 'btn primary wide', onclick: () => startSession(null) }, '+ Séance libre'),

    h('h2', {}, 'Modèles'),
    d.templates.length === 0 && h('p', { class: 'muted' }, 'Aucun modèle. Crée-en un (ex. Push, Pull, Jambes) pour démarrer vite une séance.'),
    d.templates.map((t) => h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('b', {}, t.name), h('div', { class: 'muted' }, t.exercises.length + ' exercice' + (t.exercises.length > 1 ? 's' : '') + (templateGroups(t).length ? ' · ' + groupLabels(templateGroups(t)) : ''))),
        h('button', { class: 'btn', onclick: () => editTemplate(t.id) }, 'Modifier'),
        !active && h('button', { class: 'btn primary', onclick: () => startSession(fromTemplate(t)) }, 'Démarrer')))),
    h('button', { class: 'btn wide', onclick: () => editTemplate(null) }, '+ Nouveau modèle'),

    h('h2', {}, 'Historique'),
    history.length === 0 && h('p', { class: 'muted' }, 'Aucune séance terminée pour le moment.'),
    history.map((s) => h('div', { class: 'card tap', onclick: () => viewSession(s.id) },
      h('div', { class: 'row between' }, h('b', {}, s.name), h('span', { class: 'muted' }, fmtDate(s.start))),
      h('div', { class: 'muted' },
        s.exercises.length + ' exercice' + (s.exercises.length > 1 ? 's' : '') + ' · ' +
        Math.round(volume(s)) + ' kg de volume · ' + fmtClock((s.end - s.start) / 1000) +
        (s.note || s.exercises.some((e) => e.note) ? ' · 📝' : '')),
      sessionMuscles(s).length > 0 && h('div', { class: 'muted small' }, groupLabels(sessionMuscles(s)))))),
  );
}

// ---------- Modèles ----------

function editTemplate(id) {
  const existing = id && store.data.templates.find((t) => t.id === id);
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: '', exercises: [], muscles: [] };
  const ov = overlay();

  function render() {
    const scroll = ov.el.scrollTop;
    ov.el.replaceChildren(h('div', { class: 'pad' },
      h('div', { class: 'row between' }, h('h1', {}, existing ? 'Modifier le modèle' : 'Nouveau modèle'), h('button', { class: 'btn', onclick: () => ov.close() }, 'Annuler')),
      h('input', { type: 'text', placeholder: 'Nom (ex. Push A)', value: draft.name, oninput: (e) => (draft.name = e.target.value) }),
      h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', {}, 'Groupes ciblés'), h('button', { class: 'btn sm', onclick: () => { draft.muscles = groupsOfExercises(draft.exercises); render(); } }, 'Déduire des exercices')),
        muscleChips(draft.muscles || [], (m) => { draft.muscles = m; })),

      draft.exercises.map((te, i) => h('div', { class: 'card' },
        h('div', { class: 'row between' },
          h('div', { class: 'grow' }, h('b', {}, lib.fr(te.exId)), h('div', { class: 'en' }, lib.en(te.exId))),
          h('button', { class: 'btn sm', disabled: i === 0, onclick: () => { move(i, -1); } }, '↑'),
          h('button', { class: 'btn sm', disabled: i === draft.exercises.length - 1, onclick: () => { move(i, 1); } }, '↓'),
          h('button', { class: 'btn sm danger', onclick: () => { draft.exercises.splice(i, 1); render(); } }, '✕')),
        h('div', { class: 'fields' },
          field('Séries', h('input', { type: 'text', inputMode: 'numeric', value: te.sets, oninput: (e) => (te.sets = Math.max(1, parseInt(e.target.value) || 1)) })),
          field('Reps visées', h('input', { type: 'text', value: te.reps, placeholder: '8-12', oninput: (e) => (te.reps = e.target.value) })),
          field('Charge (kg)', h('input', { type: 'text', inputMode: 'decimal', value: fmtNum(te.kg), placeholder: lastKgText(te.exId), oninput: (e) => (te.kg = parseNum(e.target.value)) })),
          field('Repos (s)', h('input', { type: 'text', inputMode: 'numeric', value: te.restSec, oninput: (e) => (te.restSec = parseInt(e.target.value) || 0) }))))),

      h('button', { class: 'btn wide', onclick: () => pickExercise((exId) => { draft.exercises.push({ exId, sets: 3, reps: '8-12', kg: null, restSec: DEFAULT_REST }); render(); }) }, '+ Ajouter un exercice'),
      h('button', { class: 'btn primary wide', onclick: save }, 'Enregistrer'),
      existing && h('button', { class: 'btn danger wide', onclick: remove }, 'Supprimer le modèle'),
    ));
    ov.el.scrollTop = scroll;
  }

  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'muted' }, label), input);
  function move(i, dir) { const [x] = draft.exercises.splice(i, 1); draft.exercises.splice(i + dir, 0, x); render(); }

  function save() {
    draft.name = draft.name.trim();
    if (!draft.name) return toast('Donne un nom au modèle');
    if (!draft.exercises.length) return toast('Ajoute au moins un exercice');
    draft.muscles = cleanMuscles(draft.muscles);
    draft.updatedAt = Date.now();
    draft.createdAt = draft.createdAt || draft.updatedAt;
    const list = store.data.templates;
    const idx = list.findIndex((t) => t.id === draft.id);
    if (idx >= 0) list[idx] = draft; else list.push(draft);
    store.save();
    ov.close();
    refreshView();
    syncSoon();
  }
  function remove() {
    if (!confirm('Supprimer ce modèle ? Les séances déjà faites sont conservées.')) return;
    store.data.templates = store.data.templates.filter((t) => t.id !== draft.id);
    store.data.tombstones.templates[draft.id] = Date.now();
    store.save();
    ov.close();
    refreshView();
    syncSoon();
  }
  render();
}

// ---------- Séance en cours ----------

// spec : null (séance libre) ou fromTemplate(...) / fromSession(...)
function startSession(spec) {
  const s = {
    id: uid(),
    name: spec ? spec.name : 'Séance libre',
    templateId: spec ? spec.templateId : null,
    muscles: spec ? cleanMuscles(spec.muscles) : [],
    start: Date.now(),
    end: null,
    exercises: spec
      ? spec.exercises.map((e) => ({ exId: e.exId, restSec: e.restSec, targetReps: e.targetReps || '', targetKg: e.targetKg == null ? null : e.targetKg, sets: Array.from({ length: e.nSets }, newSet) }))
      : [],
  };
  store.data.sessions.push(s);
  store.data.activeId = s.id;
  store.data.rest = null;
  store.save();
  refreshView();
  openSession(s.id);
}

function openSession(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const ov = overlay();
  const body = h('div', { class: 'pad' });
  const elapsed = h('span', { class: 'muted' });

  // --- chrono de repos (construit une fois, mis à jour toutes les 250 ms)
  const restLabel = h('span', {}, 'Repos');
  const restTime = h('b', { class: 'restTime' });
  const restBar = h('div', { class: 'restbar', hidden: true },
    restLabel, restTime,
    h('button', { class: 'btn sm', onclick: () => adjustRest(-15) }, '−15'),
    h('button', { class: 'btn sm', onclick: () => adjustRest(15) }, '+15'),
    h('button', { class: 'btn sm', onclick: () => { store.data.rest = null; store.save(); tick(); } }, 'Passer'));

  function startRest(sec) {
    if (!sec) return;
    store.data.rest = { endsAt: Date.now() + sec * 1000, total: sec, beeped: false };
    store.save();
    tick();
  }
  function adjustRest(delta) {
    const r = store.data.rest;
    if (!r) return;
    r.endsAt += delta * 1000;
    r.beeped = r.endsAt <= Date.now();
    store.save();
    tick();
  }
  function tick() {
    elapsed.textContent = fmtClock((Date.now() - s.start) / 1000);
    const r = store.data.rest;
    if (!r) { restBar.hidden = true; return; }
    const left = (r.endsAt - Date.now()) / 1000;
    if (left <= -10) { store.data.rest = null; store.save(); restBar.hidden = true; return; }
    if (left <= 0 && !r.beeped) { r.beeped = true; store.save(); beep(); }
    restBar.hidden = false;
    restBar.classList.toggle('over', left <= 0);
    restLabel.textContent = left <= 0 ? 'Repos terminé' : 'Repos';
    restTime.textContent = left <= 0 ? '✓' : fmtClock(Math.ceil(left));
  }
  const timer = setInterval(tick, 250);
  ov.onClose(() => clearInterval(timer));

  // --- pré-remplissages
  //   charge : si le modèle en fixe une -> la série précédente de cette séance, sinon la charge du modèle ;
  //            sans charge dans le modèle -> même série de la dernière séance, puis série précédente
  //   reps   : même série de la dernière séance, puis série précédente, puis reps visées
  function placeholders(ex, i, prev) {
    const ps = prev && (prev.sets[i] || prev.sets[prev.sets.length - 1]);
    const before = ex.sets.slice(0, i).reverse().find((x) => x.done);
    let kg;
    if (ex.targetKg != null) kg = before ? before.kg : ex.targetKg;
    else kg = ps && ps.kg != null ? ps.kg : before ? before.kg : null;
    let reps = ps && ps.reps != null ? ps.reps : before ? before.reps : null;
    if (reps == null) { const m = (ex.targetReps || '').match(/\d+/); if (m) reps = +m[0]; }
    return { kg, reps };
  }

  function toggleDone(ex, i, prev) {
    const st = ex.sets[i];
    if (st.done) { st.done = false; store.save(); return render(); }
    const ph = placeholders(ex, i, prev);
    if (st.kg == null && ph.kg != null) st.kg = ph.kg;
    if (st.reps == null && ph.reps != null) st.reps = ph.reps;
    if (st.reps == null) return toast('Indique les répétitions');
    if (st.kg == null) st.kg = 0;
    st.done = true;
    st.ts = Date.now();
    primeAudio();
    store.save();
    startRest(ex.restSec);
    const rec = prFlags(s).get(s.exercises.indexOf(ex) + ':' + i);
    if (rec) toast('🏆 ' + prText(rec, st));
    render();
  }

  function numInput(st, key, placeholder, integer) {
    return h('input', {
      type: 'text', inputMode: integer ? 'numeric' : 'decimal', class: 'num',
      placeholder: placeholder == null ? '' : fmtNum(placeholder),
      value: fmtNum(st[key]),
      oninput: (e) => {
        const n = parseNum(e.target.value);
        st[key] = n == null ? null : integer ? Math.round(n) : n;
        store.save();
      },
    });
  }

  let flags = new Map();
  function exerciseCard(ex, ei) {
    const prev = lastPerf(ex.exId);
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('b', {}, lib.fr(ex.exId)), h('div', { class: 'en' }, lib.en(ex.exId))),
        h('button', { class: 'btn sm', 'aria-label': 'Corriger le nom', onclick: () => editExerciseName(ex.exId, render) }, '✎'),
        h('button', { class: 'btn sm', 'aria-label': 'Retirer', onclick: () => { if (confirm('Retirer cet exercice de la séance ?')) { s.exercises.splice(ei, 1); store.save(); render(); } } }, '✕')),
      prev && h('div', { class: 'muted small' }, 'Dernière fois (' + new Date(prev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ') : ' + prev.sets.map(setText).join(' · ')),
      prev && prev.note && h('div', { class: 'muted small' }, 'Note précédente : ' + prev.note),
      (ex.targetReps || ex.targetKg != null) && h('div', { class: 'muted small' }, 'Objectif : ' + ex.sets.length + ' × ' + (ex.targetReps || '?') + (ex.targetKg != null ? ' @ ' + fmtNum(ex.targetKg) + ' kg' : '')),

      h('div', { class: 'setrow head' }, h('span', {}, 'Série'), h('span', {}, 'kg'), h('span', {}, 'Reps'), h('span', {}, 'RIR'), h('span', {})),
      ex.sets.map((st, i) => {
        const ph = placeholders(ex, i, prev);
        const rec = flags.get(ei + ':' + i);
        return [
          h('div', { class: 'setrow' + (st.done ? ' done' : '') },
            h('span', { class: 'idx' }, i + 1),
            numInput(st, 'kg', ph.kg, false),
            numInput(st, 'reps', ph.reps, true),
            numInput(st, 'rir', null, true),
            h('button', { class: 'check' + (st.done ? ' on' : ''), 'aria-label': 'Valider la série', onclick: () => toggleDone(ex, i, prev) }, '✓')),
          rec && h('div', { class: 'pr small' }, '🏆 ' + prText(rec, st)),
        ];
      }),
      h('textarea', { class: 'note', rows: 1, maxLength: NOTE_MAX, placeholder: 'Note (sensations, réglage de machine…)', value: ex.note || '', oninput: (e) => { if (e.target.value) ex.note = e.target.value; else delete ex.note; store.save(); } }),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { ex.sets.push(newSet()); store.save(); render(); } }, '+ Série'),
        h('button', { class: 'btn sm', disabled: ex.sets.length <= 1, onclick: () => { const last = ex.sets[ex.sets.length - 1]; if (last.done && !confirm('Supprimer la dernière série (déjà validée) ?')) return; ex.sets.pop(); store.save(); render(); } }, '− Série'),
        h('span', { class: 'grow' }),
        h('label', { class: 'rest' }, h('span', { class: 'muted small' }, 'Repos '), h('input', { type: 'text', inputMode: 'numeric', class: 'num sm', value: ex.restSec, oninput: (e) => { ex.restSec = parseInt(e.target.value) || 0; store.save(); } }), h('span', { class: 'muted small' }, ' s'))));
  }

  function render() {
    const scroll = ov.el.scrollTop;
    flags = prFlags(s);
    setChildren(body,
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('h1', {}, s.name), elapsed),
        h('button', { class: 'btn', onclick: () => ov.close() }, 'Réduire'),
        h('button', { class: 'btn primary', onclick: finish }, 'Terminer')),
      h('div', { class: 'card' },
        h('b', {}, 'Groupes ciblés'),
        muscleChips(s.muscles || [], (m) => { s.muscles = m; store.save(); render(); }),
        !cleanMuscles(s.muscles).length && h('p', { class: 'muted small' }, 'Aucun groupe choisi : ' + (groupsOfExercises(s.exercises).length ? 'ceux de tes exercices seront utilisés (' + groupLabels(groupsOfExercises(s.exercises)) + ').' : 'ils seront déduits de tes exercices.'))),
      s.exercises.map(exerciseCard),
      h('button', { class: 'btn wide', onclick: () => pickExercise((exId) => { s.exercises.push({ exId, restSec: DEFAULT_REST, targetReps: '', sets: [newSet(), newSet(), newSet()] }); store.save(); render(); }) }, '+ Ajouter un exercice'),
      h('textarea', { class: 'note', rows: 2, maxLength: NOTE_MAX, placeholder: 'Note de séance (forme du jour, sommeil…)', value: s.note || '', oninput: (e) => { if (e.target.value) s.note = e.target.value; else delete s.note; store.save(); } }),
      h('button', { class: 'btn danger wide', onclick: discard }, 'Abandonner la séance'),
      h('div', { class: 'spacer' }));
    ov.el.scrollTop = scroll;
    tick();
  }

  function finish() {
    const pending = s.exercises.reduce((n, ex) => n + ex.sets.filter((x) => !x.done).length, 0);
    const doneCount = s.exercises.reduce((n, ex) => n + ex.sets.filter((x) => x.done).length, 0);
    if (!doneCount) {
      if (confirm('Aucune série validée. Supprimer cette séance ?')) discard(true);
      return;
    }
    const msg = pending ? pending + ' série(s) non validée(s) seront ignorées. Terminer la séance ?' : 'Terminer la séance ?';
    if (!confirm(msg)) return;
    const recordExercises = new Set([...prFlags(s).keys()].map((k) => k.split(':')[0])).size;
    s.exercises.forEach((ex) => (ex.sets = ex.sets.filter((x) => x.done)));
    s.exercises = s.exercises.filter((ex) => ex.sets.length);
    s.muscles = cleanMuscles(s.muscles).length ? cleanMuscles(s.muscles) : workedGroups(s); // sans choix : groupes réellement travaillés
    s.end = Date.now();
    s.updatedAt = s.end;
    store.data.activeId = null;
    store.data.rest = null;
    store.save();
    ov.close();
    refreshView();
    toast('Séance enregistrée' + (recordExercises ? ' · 🏆 records sur ' + recordExercises + ' exercice' + (recordExercises > 1 ? 's' : '') : ''));
    syncSoon();
  }

  function discard(skipConfirm) {
    if (skipConfirm !== true && !confirm('Abandonner et supprimer cette séance ?')) return;
    store.data.sessions = store.data.sessions.filter((x) => x.id !== s.id);
    store.data.activeId = null;
    store.data.rest = null;
    store.save();
    ov.close();
    refreshView();
  }

  ov.el.append(body, restBar);
  render();
}

// ---------- Détail d'une séance passée ----------

function viewSession(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const ov = overlay();
  ov.onClose(() => refreshView()); // calendrier et historique à jour après d'éventuelles corrections
  const flags = prFlags(s);
  const busy = !!store.data.activeId;
  // les notes restent modifiables après coup ; updatedAt fait gagner la version la plus récente à la synchro
  // enregistré à chaque frappe (pas seulement à la perte de focus : sur iPhone, toucher « Fermer » ne la déclenche pas toujours)
  const noteBox = (obj, placeholder, rows) => h('textarea', { class: 'note', rows, maxLength: NOTE_MAX, placeholder, value: obj.note || '', oninput: (e) => {
    const v = e.target.value;
    if (v.trim()) obj.note = v; else delete obj.note; // le champ garde le texte tel quel (espaces compris)
    s.updatedAt = Date.now();
    store.save();
    syncSoon();
  } });
  ov.el.append(h('div', { class: 'pad' },
    h('div', { class: 'row between' }, h('div', { class: 'grow' }, h('h1', {}, s.name), h('div', { class: 'muted' }, fmtDate(s.start) + ' · ' + fmtClock((s.end - s.start) / 1000))), h('button', { class: 'btn', onclick: () => ov.close() }, 'Fermer')),
    h('p', { class: 'muted' }, 'Volume total : ' + Math.round(volume(s)) + ' kg'),
    noteBox(s, 'Note de séance…', 2),
    h('div', { class: 'card' },
      h('b', {}, 'Groupes ciblés'),
      muscleChips(sessionMuscles(s), (m) => { s.muscles = m; s.updatedAt = Date.now(); store.save(); syncSoon(); }),
      h('p', { class: 'muted small' }, 'Modifie-les pour corriger le calendrier.')),
    s.exercises.map((ex, ei) => h('div', { class: 'card' },
      h('b', {}, lib.fr(ex.exId)), h('div', { class: 'en' }, lib.en(ex.exId)),
      ex.sets.map((x, i) => [
        h('div', { class: 'histset' }, h('span', { class: 'muted' }, 'Série ' + (i + 1)), h('span', {}, fmtNum(x.kg) + ' kg × ' + x.reps + (x.rir != null ? ' · RIR ' + x.rir : ''))),
        flags.has(ei + ':' + i) && h('div', { class: 'pr small' }, '🏆 ' + prText(flags.get(ei + ':' + i), x)),
      ]),
      noteBox(ex, 'Note sur cet exercice…', 1))),
    h('button', { class: 'btn primary wide', disabled: busy, onclick: () => { ov.close(); startSession(fromSession(s)); } }, 'Refaire cette séance'),
    busy && h('p', { class: 'muted small' }, 'Termine ou abandonne la séance en cours pour en démarrer une autre.'),
    h('button', { class: 'btn wide', onclick: () => saveAsTemplate(s) }, 'Enregistrer comme modèle'),
    h('button', { class: 'btn danger wide', onclick: () => { if (confirm('Supprimer définitivement cette séance ?')) { store.data.sessions = store.data.sessions.filter((x) => x.id !== s.id); store.data.tombstones.sessions[s.id] = Date.now(); store.save(); ov.close(); refreshView(); syncSoon(); } } }, 'Supprimer la séance')));
}
