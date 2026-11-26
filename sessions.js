// Séances : accueil, modèles, saisie d'une séance en cours, historique.

const DEFAULT_REST = 90;
const newSet = () => ({ kg: null, reps: null, rir: null, done: false });
// série i validée : sa charge et ses reps passent aux séries suivantes pas encore faites,
// sauf celles saisies à la main (auto = valeurs reportées, remplaçables au prochain report)
function carryForward(sets, i) {
  const { kg, reps } = sets[i];
  for (const x of sets.slice(i + 1)) {
    if (x.done || !(x.auto || (x.kg == null && x.reps == null))) continue;
    Object.assign(x, { kg, reps, auto: true });
  }
}

const sessionById = (id) => store.data.sessions.find((s) => s.id === id);
const volume = (s) =>
  s.exercises.reduce((t, ex) => t + ex.sets.reduce((a, x) => a + (x.done ? (x.kg || 0) * (x.reps || 0) : 0), 0), 0);
const setText = (x) => fmtNum(x.kg) + '×' + x.reps + (x.rir != null ? ' (RIR ' + x.rir + ')' : '');

// Dernière séance terminée contenant cet exercice -> { date, sets } (hors circuits chronométrés : HIIT, AMRAP, EMOM)
function lastPerf(exId) {
  const done = store.data.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  for (const s of done) {
    const ex = s.exercises.find((e) => e.exId === exId && !inTimedCircuit(s, e));
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
// groupes (supersets, circuits) : réglages repris, sans minuteur ni résultat (voir settingsOnlyGroups)
const groupFields = (e) => ({ ...(e.gid ? { gid: e.gid } : {}), ...(e.emomReps ? { emomReps: e.emomReps } : {}) });
const fromTemplate = (t) => ({
  name: t.name, templateId: t.id, muscles: cleanMuscles(t.muscles), groups: settingsOnlyGroups(t.groups),
  exercises: t.exercises.map((te) => ({ exId: te.exId, restSec: te.restSec, targetReps: te.reps, targetKg: te.kg == null ? null : te.kg, nSets: te.sets, ...groupFields(te) })),
});
const fromSession = (s) => ({
  name: s.name, templateId: s.templateId || null, muscles: cleanMuscles(s.muscles), groups: settingsOnlyGroups(s.groups),
  exercises: s.exercises.map((ex) => ({ exId: ex.exId, restSec: ex.restSec, targetReps: ex.targetReps || repsRange(ex.sets), targetKg: null, nSets: ex.sets.length, ...groupFields(ex) })),
});

function saveAsTemplate(s) {
  const name = (prompt('Nom du modèle :', s.name) || '').trim();
  if (!name) return;
  const now = Date.now();
  const t = {
    id: uid(), name, createdAt: now, updatedAt: now, muscles: sessionMuscles(s),
    exercises: s.exercises.map((ex) => {
      const heavy = ex.sets.find((x) => x.kg > 0);
      return { exId: ex.exId, sets: Math.max(1, ex.sets.length), reps: ex.targetReps || repsRange(ex.sets), kg: heavy ? heavy.kg : null, restSec: ex.restSec == null ? DEFAULT_REST : ex.restSec, ...groupFields(ex) };
    }),
  };
  const groups = settingsOnlyGroups(s.groups);
  if (Object.keys(groups).length) { t.groups = groups; normalizeGroups(t); }
  store.data.templates.push(t);
  store.save();
  refreshView();
  syncSoon();
  toast('Modèle « ' + name + ' » créé');
}

// ---------- Accueil ----------

// Bandeau de l'accueil : séances depuis lundi, séries et volume sur 7 jours
function weekStrip(history) {
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = history.filter((s) => s.start >= monday.getTime()).length;
  const last7 = history.filter((s) => Date.now() - s.start < 7 * 864e5);
  const sets = last7.reduce((n, s) => n + s.exercises.reduce((a, ex) => a + ex.sets.filter((x) => x.done).length, 0), 0);
  const vol = last7.reduce((a, s) => a + volume(s), 0);
  const tile = (v, label) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, v), h('div', { class: 'muted small' }, label));
  return h('div', { class: 'tiles' },
    tile(String(week), 'séance' + (week > 1 ? 's' : '') + ' cette semaine'),
    tile(String(sets), 'séries sur 7 jours'),
    tile(vol >= 1000 ? fmtNum(Math.round(vol / 100) / 10) + ' t' : Math.round(vol) + ' kg', 'soulevés sur 7 jours'));
}

function renderHome(root) {
  const d = store.data;
  const active = d.activeId && sessionById(d.activeId);
  const history = d.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const exCount = (n) => n + ' exercice' + (n > 1 ? 's' : '');

  root.replaceChildren(h('div', { class: 'pad' },
    h('div', { class: 'eyebrow' }, today.charAt(0).toUpperCase() + today.slice(1)),
    h('h1', {}, 'Séances'),
    history.length > 0 && weekStrip(history),
    backupReminder(),

    active && h('div', { class: 'card banner' },
      h('div', { class: 'grow' }, h('b', {}, 'Séance en cours'), h('div', { class: 'muted' }, active.name + ' · commencée ' + fmtDate(active.start))),
      h('button', { class: 'btn primary', onclick: () => openSession(active.id) }, 'Reprendre')),

    !active && h('button', { class: 'btn primary wide', onclick: () => startSession(null) }, '+ Séance libre'),

    h('h2', {}, 'Modèles'),
    d.templates.length === 0 && h('p', { class: 'muted' }, 'Aucun modèle. Crée-en un (ex. Push, Pull, Jambes) pour démarrer vite une séance.'),
    d.templates.map((t) => h('div', { class: 'card media' },
      templateMap(t, { size: 'mini' }),
      h('div', { class: 'grow' },
        h('b', {}, t.name),
        h('div', { class: 'muted' }, exCount(t.exercises.length) + (templateGroups(t).length ? ' · ' + groupLabels(templateGroups(t)) : '')),
        h('div', { class: 'row end' },
          h('button', { class: 'btn sm', onclick: () => editTemplate(t.id) }, 'Modifier'),
          !active && h('button', { class: 'btn sm primary', onclick: () => startSession(fromTemplate(t)) }, 'Démarrer'))))),
    h('button', { class: 'btn wide', onclick: () => editTemplate(null) }, '+ Nouveau modèle'),

    h('h2', {}, 'Historique'),
    history.length === 0 && h('p', { class: 'muted' }, 'Aucune séance terminée pour le moment.'),
    history.map((s) => h('div', { class: 'card tap media', onclick: () => viewSession(s.id) },
      sessionMap(s, { size: 'mini' }),
      h('div', { class: 'grow' },
        h('div', { class: 'row between' }, h('b', {}, s.name), h('span', { class: 'muted' }, fmtDate(s.start))),
        h('div', { class: 'muted' },
          exCount(s.exercises.length) + ' · ' + Math.round(volume(s)) + ' kg de volume · ' + fmtClock((s.end - s.start) / 1000) +
          (s.note || s.exercises.some((e) => e.note) ? ' · 📝' : '')),
        sessionMuscles(s).length > 0 && h('div', { class: 'muted small' }, groupLabels(sessionMuscles(s))))))),
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

      exerciseBlocks(),

      h('button', { class: 'btn wide', onclick: () => pickExercise((exId) => { draft.exercises.push({ exId, sets: 3, reps: '8-12', kg: null, restSec: DEFAULT_REST }); render(); }) }, '+ Ajouter un exercice'),
      h('button', { class: 'btn primary wide', onclick: save }, 'Enregistrer'),
      existing && h('button', { class: 'btn danger wide', onclick: remove }, 'Supprimer le modèle'),
    ));
    ov.el.scrollTop = scroll;
  }

  // exercices, ceux d'un même groupe (superset, circuit) réunis dans un cadre avec leur lettre et leurs réglages
  function exerciseBlocks() {
    const out = [];
    hints.length = 0;
    let box = null, boxGid = null;
    draft.exercises.forEach((te, i) => {
      const g = groupOf(draft, te);
      if (!g) { box = null; boxGid = null; out.push(exerciseCard(te, i, null)); return; }
      if (te.gid !== boxGid) {
        boxGid = te.gid;
        box = h('div', { class: 'group' + (isTimed(g) ? ' timed' : '') },
          h('div', { class: 'group-h' }, h('span', { class: 'gtag' }, groupLetter(draft, te.gid)),
            h('div', { class: 'grow' }, h('b', {}, modeLabel(g)), h('div', { class: 'muted small' }, describeGroup(g)))));
        out.push(box);
      }
      box.append(exerciseCard(te, i, g));
    });
    return out;
  }

  function exerciseCard(te, i, g) {
    // dans un superset ou un circuit classique / HIIT, le nombre de séries et le repos viennent du groupe
    const byRounds = g && (g.mode === 'classique' || g.mode === 'hiit');
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('b', {}, lib.fr(te.exId)), h('div', { class: 'en' }, lib.en(te.exId))),
        h('button', { class: 'btn sm', 'aria-label': 'Monter', disabled: i === 0, onclick: () => { move(i, -1); } }, '↑'),
        h('button', { class: 'btn sm', 'aria-label': 'Descendre', disabled: i === draft.exercises.length - 1, onclick: () => { move(i, 1); } }, '↓'),
        h('button', { class: 'btn sm quiet', 'aria-label': 'Retirer', onclick: () => { draft.exercises.splice(i, 1); normalizeGroups(draft); render(); } }, '✕')),
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { class: 'btn sm', onclick: () => editGroup(draft, te, render, true) }, g ? 'Éditer le groupe' : 'Éditer · grouper')),
      h('div', { class: byRounds ? 'fields two' : 'fields' },
        !byRounds && field('Séries', h('input', { type: 'text', inputMode: 'numeric', value: te.sets, oninput: (e) => (te.sets = Math.max(1, parseInt(e.target.value) || 1)) })),
        field('Reps visées', h('input', { type: 'text', value: te.reps, placeholder: '8-12', oninput: (e) => { te.reps = e.target.value; hints[i] && hints[i](); } })),
        field(te.prog === 'aucune' ? 'Charge (kg)' : 'Départ (kg)', h('input', { type: 'text', inputMode: 'decimal', value: fmtNum(te.kg), placeholder: lastKgText(te.exId), oninput: (e) => { te.kg = parseNum(e.target.value); hints[i] && hints[i](); } })),
        !g && field('Repos (s)', h('input', { type: 'text', inputMode: 'numeric', value: te.restSec, oninput: (e) => (te.restSec = parseInt(e.target.value) || 0) }))),
      byRounds && h('p', { class: 'muted small' }, g.rounds + ' séries : une par tour du groupe.'),
      g && g.mode === 'emom' && h('p', { class: 'muted small' }, 'Objectif : ' + (te.emomReps || '?') + ' reps par minute.'),
      isTimed(g)
        ? h('p', { class: 'muted small' }, 'Circuit chronométré : pas de conseil de progression pour cet exercice.')
        : [h('div', { class: 'fields two' },
          field('Progression', h('select', { onchange: (e) => { if (e.target.value === 'auto') delete te.prog; else te.prog = e.target.value; render(); } },
            PROG_RULES.map(([v, l]) => h('option', { value: v, selected: (te.prog || 'auto') === v }, l)))),
          te.prog !== 'aucune' && field('Palier (kg)', h('input', { type: 'text', inputMode: 'decimal', value: fmtNum(te.inc), placeholder: fmtNum(loadStep(te.exId)), oninput: (e) => { const v = parseNum(e.target.value); if (v > 0) te.inc = v; else delete te.inc; hints[i] && hints[i](); } }))),
        progHint(te, i)]);
  }

  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'muted' }, label), input);
  // aperçu du conseil de progression, mis à jour pendant la saisie (sans tout redessiner : le clavier resterait ouvert ailleurs)
  const hints = [];
  function progHint(te, i) {
    const el = h('p', { class: 'hint' });
    hints[i] = () => {
      const sg = suggestNext(te.exId, te.reps, te, te.kg);
      el.textContent = sg ? 'Prochaine séance : ' + suggText(sg) + '. ' + sg.why
        : te.prog === 'aucune' ? 'Pas de conseil : la charge du modèle reste fixe.' : 'Indique les reps visées (ex. 8-12) pour recevoir un conseil.';
    };
    hints[i]();
    return el;
  }
  function move(i, dir) { moveExercise(draft, i, dir); render(); }

  function save() {
    draft.name = draft.name.trim();
    if (!draft.name) return toast('Donne un nom au modèle');
    if (!draft.exercises.length) return toast('Ajoute au moins un exercice');
    draft.muscles = cleanMuscles(draft.muscles);
    normalizeGroups(draft);
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

// "62,5 kg × 8 reps" ou "12 reps" (poids du corps ou charge à choisir)
const suggText = (sg) => (sg.kg > 0 ? kgText(sg.kg) + ' × ' : '') + sg.reps + ' reps';

// exercice de séance à partir d'un exercice de spec ; la progression (règle du modèle, s'il existe) fixe la charge visée
function planExercise(e, templateId) {
  const t = templateId && store.data.templates.find((x) => x.id === templateId);
  const te = t && t.exercises.find((x) => x.exId === e.exId);
  const ex = { exId: e.exId, restSec: e.restSec, targetReps: e.targetReps || '', targetKg: e.targetKg == null ? null : e.targetKg, sets: Array.from({ length: e.nSets }, newSet), ...groupFields(e) };
  const sg = suggestNext(e.exId, ex.targetReps, te, te ? te.kg : ex.targetKg);
  if (sg) {
    if (sg.kg != null) ex.targetKg = sg.kg;
    ex.sugReps = sg.reps;
    ex.why = sg.why;
  }
  return ex;
}

// spec : null (séance libre) ou fromTemplate(...) / fromSession(...)
function startSession(spec) {
  const s = {
    id: uid(),
    name: spec ? spec.name : 'Séance libre',
    templateId: spec ? spec.templateId : null,
    muscles: spec ? cleanMuscles(spec.muscles) : [],
    start: Date.now(),
    end: null,
    exercises: spec ? spec.exercises.map((e) => planExercise(e, spec.templateId)) : [],
  };
  // groupes du modèle ou de la séance refaite : résultats des circuits chronométrés remis à zéro
  const groups = spec ? settingsOnlyGroups(spec.groups) : {};
  if (Object.keys(groups).length) {
    for (const g of Object.values(groups)) {
      if (g.mode === 'amrap') g.result = { rounds: 0 };
      if (g.mode === 'emom') g.result = { log: [] };
    }
    s.groups = groups;
    normalizeGroups(s);
  } else s.exercises.forEach((e) => delete e.gid);
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
  const head = h('div', { class: 'sess-head' });
  const body = h('div', { class: 'pad' });
  const elapsed = h('span', {});

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
    circuits.tick(); // avant le chrono de repos, qui s'arrête tôt quand il n'y a pas de repos en cours
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
  ov.onClose(() => { clearInterval(timer); circuits.stop(); });

  // --- pré-remplissages
  //   charge : si le modèle en fixe une -> la série précédente de cette séance, sinon la charge du modèle ;
  //            sans charge dans le modèle -> même série de la dernière séance, puis série précédente
  //   reps   : conseil de progression, puis même série de la dernière séance, puis série précédente, puis reps visées
  //   (la charge visée vient elle-même du conseil de progression quand il y en a un : voir planExercise)
  function placeholders(ex, i, prev) {
    const ps = prev && (prev.sets[i] || prev.sets[prev.sets.length - 1]);
    const before = ex.sets.slice(0, i).reverse().find((x) => x.done);
    let kg;
    if (ex.targetKg != null) kg = before ? before.kg : ex.targetKg;
    else kg = ps && ps.kg != null ? ps.kg : before ? before.kg : null;
    let reps = ex.sugReps != null ? ex.sugReps : ps && ps.reps != null ? ps.reps : before ? before.reps : null;
    if (reps == null) { const m = (ex.targetReps || '').match(/\d+/); if (m) reps = +m[0]; }
    return { kg, reps };
  }

  // supersets et circuits : minuteurs (circuits.js), avec les pré-remplissages de cette séance
  const circuits = circuitRuntime(s, { placeholders: (ex, i) => placeholders(ex, i, lastPerf(ex.exId)), render: () => render(), save: () => store.save() });
  circuits.resume();

  // repos après une série : dans un superset ou un circuit classique, seulement quand le tour est complet ;
  // jamais dans un circuit chronométré (le minuteur du circuit s'en charge)
  function restAfter(ex, i) {
    const g = groupOf(s, ex);
    if (!g) return startRest(ex.restSec);
    if (isTimed(g)) return;
    if (roundComplete(s, ex.gid, i)) startRest(g.rest);
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
    delete st.auto;
    carryForward(ex.sets, i);
    primeAudio();
    store.save();
    restAfter(ex, i);
    const rec = prFlags(s).get(s.exercises.indexOf(ex) + ':' + i);
    if (rec) toast('🏆 ' + prText(rec, st));
    render();
  }

  // sugg : la valeur affichée en couleur est une suggestion (rappel ou conseil), reprise telle quelle par ✓
  function numInput(st, key, placeholder, integer, sugg) {
    return h('input', {
      type: 'text', inputMode: integer ? 'numeric' : 'decimal', class: 'num' + (sugg && placeholder != null ? ' sugg' : ''),
      placeholder: placeholder == null ? '' : fmtNum(placeholder),
      value: fmtNum(st[key]),
      oninput: (e) => {
        const n = parseNum(e.target.value);
        st[key] = n == null ? null : integer ? Math.round(n) : n;
        delete st.auto; // saisie à la main : plus remplacée par les reports
        store.save();
      },
    });
  }

  // échauffement : liste à part (ex.warmup), jamais comptée dans le volume, les records ni la progression ; effacée à la fin
  // nombre de séries d'échauffement demandé : celui de l'exercice, sinon celui de la séance, sinon le réglage (0 = auto)
  const warmCount = (ex) => (ex.warmN != null ? ex.warmN : s.warmN != null ? s.warmN : store.data.gear.warmup);
  const warmFor = (ex, prev) => (ex.sets.length ? warmupSets(workKg(ex, prev), ex.exId, warmCount(ex)) : []);
  function warmupBlock(ex, prev) {
    const w = ex.warmup;
    if (!w || !w.length) return null;
    const touched = w.some((x) => x.done);
    const setN = (n) => { ex.warmN = Math.max(0, Math.min(WARMUP_MAX, n)); ex.warmup = warmFor(ex, prev); store.save(); render(); };
    const n = warmCount(ex) || w.length; // en automatique : le nombre obtenu sert de point de départ
    return h('div', { class: 'warm' },
      h('div', { class: 'row between' }, h('span', { class: 'muted small' }, 'Échauffement'),
        !touched && h('span', { class: 'stepper' },
          h('button', { class: 'btn sm', 'aria-label': 'Une série d\'échauffement de moins', disabled: n <= 1, onclick: () => setN(n - 1) }, '−'),
          h('span', { class: 'small' }, warmLabel(w.length)),
          h('button', { class: 'btn sm', 'aria-label': 'Une série d\'échauffement de plus', disabled: n >= WARMUP_MAX, onclick: () => setN(n + 1) }, '+')),
        h('button', { class: 'linkbtn', onclick: () => { delete ex.warmup; store.save(); render(); } }, 'Retirer')),
      w.map((x, i) => h('div', { class: 'setrow warmrow' + (x.done ? ' done' : '') },
        h('span', { class: 'idx' }, 'É' + (i + 1)),
        h('span', { class: 'wv' }, fmtNum(x.kg) + ' kg'),
        h('span', { class: 'wv' }, '× ' + x.reps),
        h('span', {}),
        h('button', { class: 'check' + (x.done ? ' on' : ''), 'aria-label': 'Valider la série d\'échauffement', onclick: () => { x.done = !x.done; store.save(); render(); } }, '✓'))));
  }
  // charge de la première série de travail (saisie ou pré-remplie)
  const workKg = (ex, prev) => (ex.sets[0].kg != null ? ex.sets[0].kg : placeholders(ex, 0, prev).kg);
  // disques de la prochaine série à faire (échauffement compris), pour les exercices à la barre
  function platesLine(ex, prev) {
    if (barOf(ex.exId) == null) return null;
    const w = (ex.warmup || []).find((x) => !x.done);
    let kg = w && w.kg;
    if (!w) {
      const i = ex.sets.findIndex((x) => !x.done);
      if (i < 0) return null;
      kg = ex.sets[i].kg != null ? ex.sets[i].kg : placeholders(ex, i, prev).kg;
    }
    const txt = kg > 0 && plateText(kg, ex.exId);
    return txt ? h('div', { class: 'plates' }, h('span', { class: 'plates-k' }, fmtNum(kg) + ' kg'), txt) : null;
  }

  let flags = new Map();
  // d'où viennent les valeurs en couleur des champs vides : conseil de progression ou rappel de la dernière séance
  function sourceLine(ex, prev) {
    if (inTimedCircuit(s, ex)) return null;
    if (ex.why) return h('div', { class: 'hint' }, h('b', {}, 'Conseil : ' + suggText({ kg: ex.targetKg, reps: ex.sugReps }) + '. '), ex.why, h('div', { class: 'muted small' }, 'En couleur dans les champs : touche ✓ pour valider tel quel.'));
    if (prev && ex.targetKg == null) return h('div', { class: 'hint recall' }, h('b', {}, '↺ Rappel du ' + new Date(prev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' : '), prev.sets.map(setText).join(' · '), h('div', { class: 'muted small' }, 'En couleur dans les champs : touche ✓ pour reprendre la même charge.'));
    return null;
  }

  function exerciseCard(ex, ei) {
    const prev = lastPerf(ex.exId);
    const g = groupOf(s, ex);
    const canWarm = !ex.warmup && !isTimed(g) && ex.sets.length && !ex.sets[0].done && warmFor(ex, prev).length > 0;
    const tag = g && groupLetter(s, ex.gid) + (groupMembers(s, ex.gid).indexOf(ex) + 1);
    return h('div', { class: 'card' + (g ? ' in-group' : '') },
      h('div', { class: 'row between' },
        tag && h('span', { class: 'gtag' }, tag),
        h('div', { class: 'grow' }, h('b', {}, lib.fr(ex.exId)), h('div', { class: 'en' }, lib.en(ex.exId)), customSteps(ex.exId)),
        h('button', { class: 'btn sm', 'aria-label': 'Monter', disabled: ei === 0, onclick: () => move(ei, -1) }, '↑'),
        h('button', { class: 'btn sm', 'aria-label': 'Descendre', disabled: ei === s.exercises.length - 1, onclick: () => move(ei, 1) }, '↓'),
        h('button', { class: 'btn sm quiet', 'aria-label': 'Retirer', onclick: () => {
          if (isTimed(g) && timerStarted(g) && !g.timer.ended) return toast('Arrête le circuit avant d\'en retirer un exercice');
          if (confirm('Retirer cet exercice de la séance ?')) { s.exercises.splice(ei, 1); normalizeGroups(s); store.save(); render(); }
        } }, '✕')),
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { class: 'btn sm', onclick: () => editGroup(s, ex, render) }, 'Éditer'),
        h('button', { class: 'btn sm', onclick: () => replaceExercise(ex) }, '⇄ Remplacer')),
      prev && ex.targetKg != null && h('div', { class: 'muted small' }, 'Dernière fois (' + new Date(prev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ') : ' + prev.sets.map(setText).join(' · ')),
      prev && prev.note && h('div', { class: 'muted small' }, 'Note précédente : ' + prev.note),
      (ex.targetReps || ex.targetKg != null) && h('div', { class: 'muted small' }, 'Objectif : ' + ex.sets.length + ' × ' + (ex.targetReps || '?') + (ex.targetKg != null ? ' @ ' + fmtNum(ex.targetKg) + ' kg' : '')),
      g && g.mode === 'emom' && h('div', { class: 'muted small' }, 'Objectif EMOM : ' + (ex.emomReps || 0) + ' reps par minute'),
      sourceLine(ex, prev),

      warmupBlock(ex, prev),
      h('div', { class: 'setrow head' }, h('span', {}, 'Série'), h('span', {}, 'kg'), h('span', {}, 'Reps'), h('span', {}, 'RIR'), h('span', {})),
      ex.sets.map((st, i) => {
        const ph = placeholders(ex, i, prev);
        const rec = flags.get(ei + ':' + i);
        return [
          h('div', { class: 'setrow' + (st.done ? ' done' : '') },
            h('span', { class: 'idx' }, i + 1),
            numInput(st, 'kg', ph.kg, false, !st.done),
            numInput(st, 'reps', ph.reps, true, !st.done),
            numInput(st, 'rir', null, true),
            h('button', { class: 'check' + (st.done ? ' on' : ''), 'aria-label': 'Valider la série', onclick: () => toggleDone(ex, i, prev) }, '✓')),
          rec && h('div', { class: 'pr small' }, '🏆 ' + prText(rec, st)),
        ];
      }),
      platesLine(ex, prev),
      h('textarea', { class: 'note', rows: 1, maxLength: NOTE_MAX, placeholder: 'Note (sensations, réglage de machine…)', value: ex.note || '', oninput: (e) => { if (e.target.value) ex.note = e.target.value; else delete ex.note; store.save(); } }),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: () => { ex.sets.push(newSet()); store.save(); render(); } }, '+ Série'),
        h('button', { class: 'btn sm', disabled: ex.sets.length <= 1, onclick: () => { const last = ex.sets[ex.sets.length - 1]; if (last.done && !confirm('Supprimer la dernière série (déjà validée) ?')) return; ex.sets.pop(); store.save(); render(); } }, '− Série'),
        canWarm && h('button', { class: 'btn sm', onclick: () => { ex.warmup = warmFor(ex, prev); store.save(); render(); } }, '+ Échauffement'),
        h('span', { class: 'grow' }),
        !g && h('label', { class: 'rest' }, h('span', { class: 'muted small' }, 'Repos '), h('input', { type: 'text', inputMode: 'numeric', class: 'num sm', value: ex.restSec, oninput: (e) => { ex.restSec = parseInt(e.target.value) || 0; store.save(); } }), h('span', { class: 'muted small' }, ' s'))));
  }

  // ordre des exercices : comme dans l'éditeur de modèle ; un circuit chronométré lancé garde son ordre interne
  function move(ei, dir) {
    const x = s.exercises[ei], y = s.exercises[ei + dir], g = groupOf(s, x);
    if (y && x.gid && x.gid === y.gid && isTimed(g) && timerStarted(g) && !g.timer.ended) return toast('Circuit en cours : son ordre ne peut plus changer');
    moveExercise(s, ei, dir);
    store.save();
    render();
  }

  // remplacer un exercice pas encore commencé : mêmes séries, reps visées, repos et groupe ; charge et conseil recalculés
  function replaceExercise(ex) {
    if (ex.sets.some((x) => x.done)) return toast('Des séries sont déjà validées : ajoute plutôt un nouvel exercice');
    const pick = overlay();
    mountLibrary(pick.el, {
      title: 'Remplacer ' + lib.fr(ex.exId), onClose: () => pick.close(),
      onPick: (exId) => {
        pick.close();
        const i = s.exercises.indexOf(ex);
        if (i < 0) return;
        s.exercises[i] = { ...planExercise({ exId, restSec: ex.restSec, targetReps: ex.targetReps, targetKg: null, nSets: ex.sets.length }, s.templateId), ...groupFields(ex) };
        store.save();
        render();
      },
    });
  }

  // exercice ajouté pendant la séance : autant de séries et le même repos que la dernière fois (les charges sont rappelées)
  function addExercise(exId) {
    const prev = lastPerf(exId);
    const last = prev && store.data.sessions.filter((x) => x.end).sort((a, b) => b.start - a.start).flatMap((x) => x.exercises).find((e) => e.exId === exId);
    s.exercises.push({ exId, restSec: last && last.restSec != null ? last.restSec : DEFAULT_REST, targetReps: '', sets: Array.from({ length: prev ? Math.max(1, prev.sets.length) : 3 }, newSet) });
    store.save();
    render();
  }

  // exercices dans l'ordre, les groupes (superset, circuit) réunis dans un cadre avec leur minuteur
  function exerciseBlocks() {
    const out = [];
    s.exercises.forEach((ex, ei) => {
      const g = groupOf(s, ex);
      const first = g && s.exercises.findIndex((e) => e.gid === ex.gid) === ei;
      if (!g) return out.push(exerciseCard(ex, ei));
      if (first) out.push(h('div', { class: 'group' + (isTimed(g) ? ' timed' : '') },
        h('div', { class: 'group-h' }, h('span', { class: 'gtag' }, groupLetter(s, ex.gid)), h('div', { class: 'grow' }, h('b', {}, modeLabel(g)), h('div', { class: 'muted small' }, describeGroup(g)))),
        circuits.panel(ex.gid)));
      out[out.length - 1].append(exerciseCard(ex, ei));
    });
    return out;
  }

  // montée en charge automatique : échauffement pour tous les exercices dont la première série n'est pas faite
  function autoWarmCard() {
    const eligible = s.exercises.filter((ex) => !ex.warmup && ex.sets.length && !ex.sets[0].done && !inTimedCircuit(s, ex));
    if (!eligible.length) return null;
    const n = s.warmN != null ? s.warmN : store.data.gear.warmup;
    const setN = (v) => { s.warmN = Math.max(0, Math.min(WARMUP_MAX, v)); store.save(); render(); };
    function apply() {
      const added = [], skipped = [];
      for (const ex of eligible) {
        const w = warmFor(ex, lastPerf(ex.exId));
        if (w.length) { ex.warmup = w; added.push(ex); } else skipped.push(ex);
      }
      store.save();
      render();
      toast((added.length ? 'Échauffement ajouté à ' + added.length + ' exercice' + (added.length > 1 ? 's' : '') : 'Aucun échauffement ajouté') +
        (skipped.length ? ' · sans charge visée : ' + skipped.map((e) => lib.fr(e.exId)).join(', ') : ''));
    }
    return h('div', { class: 'card warmcard' },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('b', {}, 'Montée en charge'), h('div', { class: 'muted small' }, 'Séries d\'échauffement d\'après la charge visée de chaque exercice.')),
        h('span', { class: 'stepper' },
          h('button', { class: 'btn sm', 'aria-label': 'Moins de séries', disabled: n === 0, onclick: () => setN(n - 1) }, '−'),
          h('span', { class: 'small' }, warmLabel(n)),
          h('button', { class: 'btn sm', 'aria-label': 'Plus de séries', disabled: n >= WARMUP_MAX, onclick: () => setN(n + 1) }, '+'))),
      h('button', { class: 'btn primary wide', onclick: apply }, 'Monter en charge automatiquement'));
  }

  function render() {
    const scroll = ov.el.scrollTop;
    flags = prFlags(s);
    const total = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
    const done = s.exercises.reduce((n, ex) => n + ex.sets.filter((x) => x.done).length, 0);
    setChildren(head,
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('h1', {}, s.name), h('div', { class: 'muted' }, elapsed, ' · ' + done + '/' + total + ' séries')),
        h('button', { class: 'btn', onclick: () => ov.close() }, 'Réduire'),
        h('button', { class: 'btn primary', onclick: finish }, 'Terminer')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': 'Séries validées' },
        h('div', { style: 'width:' + (total ? (done / total) * 100 : 0) + '%' })));
    setChildren(body,
      h('div', { class: 'card' },
        h('b', {}, 'Groupes ciblés'),
        s.exercises.length > 0 && sessionMap(s),
        muscleChips(s.muscles || [], (m) => { s.muscles = m; store.save(); render(); }),
        !cleanMuscles(s.muscles).length && h('p', { class: 'muted small' }, 'Aucun groupe choisi : ' + (groupsOfExercises(s.exercises).length ? 'ceux de tes exercices seront utilisés (' + groupLabels(groupsOfExercises(s.exercises)) + ').' : 'ils seront déduits de tes exercices.'))),
      autoWarmCard(),
      exerciseBlocks(),
      h('button', { class: 'btn wide', onclick: () => pickExercise(addExercise) }, '+ Ajouter un exercice'),
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
    circuits.finishAll(); // minuteurs arrêtés (la minute EMOM en cours est enregistrée), résultats conservés
    s.exercises.forEach((ex) => { ex.sets = ex.sets.filter((x) => x.done); delete ex.warmup; delete ex.warmN; });
    s.exercises = s.exercises.filter((ex) => ex.sets.length);
    normalizeGroups(s);
    delete s.warmN;
    s.muscles = cleanMuscles(s.muscles).length ? cleanMuscles(s.muscles) : workedGroups(s); // sans choix : groupes réellement travaillés
    s.end = Date.now();
    s.updatedAt = s.end;
    dropLiveFields(s);
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

  ov.el.append(head, body, restBar);
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
      sessionMap(s),
      muscleChips(sessionMuscles(s), (m) => { s.muscles = m; s.updatedAt = Date.now(); store.save(); syncSoon(); }),
      h('p', { class: 'muted small' }, 'Modifie-les pour corriger le calendrier.')),
    s.exercises.map((ex, ei) => [
      groupOf(s, ex) && s.exercises.findIndex((e) => e.gid === ex.gid) === ei && h('div', { class: 'group-h done' },
        h('span', { class: 'gtag' }, groupLetter(s, ex.gid)),
        h('div', { class: 'grow' }, h('b', {}, modeLabel(groupOf(s, ex))), h('div', { class: 'muted small' }, describeGroup(groupOf(s, ex)) + (groupResultText(groupOf(s, ex)) ? ' · ' + groupResultText(groupOf(s, ex)) : '')))),
      h('div', { class: 'card' + (groupOf(s, ex) ? ' in-group' : '') },
      h('b', {}, (groupOf(s, ex) ? groupLetter(s, ex.gid) + (groupMembers(s, ex.gid).indexOf(ex) + 1) + ' · ' : '') + lib.fr(ex.exId)), h('div', { class: 'en' }, lib.en(ex.exId)),
      ex.sets.map((x, i) => [
        h('div', { class: 'histset' }, h('span', { class: 'muted' }, 'Série ' + (i + 1)), h('span', {}, fmtNum(x.kg) + ' kg × ' + x.reps + (x.rir != null ? ' · RIR ' + x.rir : ''))),
        flags.has(ei + ':' + i) && h('div', { class: 'pr small' }, '🏆 ' + prText(flags.get(ei + ':' + i), x)),
      ]),
      noteBox(ex, 'Note sur cet exercice…', 1))]),
    h('button', { class: 'btn primary wide', disabled: busy, onclick: () => { ov.close(); startSession(fromSession(s)); } }, 'Refaire cette séance'),
    busy && h('p', { class: 'muted small' }, 'Termine ou abandonne la séance en cours pour en démarrer une autre.'),
    h('button', { class: 'btn wide', onclick: () => saveAsTemplate(s) }, 'Enregistrer comme modèle'),
    h('button', { class: 'btn danger wide', onclick: () => { if (confirm('Supprimer définitivement cette séance ?')) { store.data.sessions = store.data.sessions.filter((x) => x.id !== s.id); store.data.tombstones.sessions[s.id] = Date.now(); store.save(); ov.close(); refreshView(); syncSoon(); } } }, 'Supprimer la séance')));
}
