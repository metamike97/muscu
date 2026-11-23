// Supersets et circuits dans une séance.
// Chaque exercice groupé porte l'identifiant de son groupe (ex.gid) ; la configuration est dans s.groups[gid] :
//   { kind: 'superset' | 'circuit', mode: 'classique' | 'hiit' | 'amrap' | 'emom',
//     rounds, rest (s), work (s), minutes,              selon le type (voir CIRCUIT_MODES)
//     timer: { startedAt, acc (ms), handled, cur:{m, reps}, ended }   état du minuteur, effacé en fin de séance
//     result: { rounds } (AMRAP) | { log:[{m, k, reps, hit}] } (EMOM) }      conservé dans l'historique
// Les membres d'un groupe sont toujours consécutifs dans s.exercises. Jamais de référence par index ou par exId
// (un même exercice peut apparaître deux fois, et ✕ ou la fin de séance retirent des exercices).
//   superset / classique : les exercices s'enchaînent, le repos démarre quand le tour est complet
//   hiit  : travail / repos chronométrés, exercice après exercice ; chaque intervalle de travail valide sa série
//   amrap : un maximum de tours en un temps donné ; « +1 tour » valide une série de chaque exercice
//   emom  : chaque minute, un exercice (à tour de rôle) avec un objectif de reps ; le compteur repart à zéro
// Les séries des circuits chronométrés (HIIT, AMRAP, EMOM) comptent dans le volume et les records,
// mais pas dans le rappel des charges ni la progression (voir inTimedCircuit).

const CIRCUIT_MODES = [
  ['classique', 'Classique', 'Les exercices s\'enchaînent, repos après chaque tour.'],
  ['hiit', 'HIIT', 'Enchaînement rapide : travail et repos chronométrés pour chaque exercice.'],
  ['amrap', 'AMRAP', 'Un maximum de tours du circuit dans le temps donné.'],
  ['emom', 'EMOM', 'Chaque minute, un exercice à tour de rôle avec un objectif de reps ; le compteur repart à zéro à chaque minute.'],
];
const TIMED_MODES = ['hiit', 'amrap', 'emom'];
const GROUP_DEFAULTS = { rounds: 3, rest: 90, work: 40, hiitRest: 20, minutes: 10 };

const groupOf = (s, ex) => (ex.gid && s.groups && s.groups[ex.gid]) || null;
const groupMembers = (s, gid) => s.exercises.filter((e) => e.gid === gid);
const isTimed = (g) => !!g && g.kind === 'circuit' && TIMED_MODES.includes(g.mode);
const inTimedCircuit = (s, ex) => isTimed(groupOf(s, ex));
// A, B, C… dans l'ordre d'apparition des groupes
function groupLetter(s, gid) {
  const order = [...new Set(s.exercises.map((e) => e.gid).filter((x) => x && s.groups && s.groups[x]))];
  return String.fromCharCode(65 + Math.max(0, order.indexOf(gid)));
}
const modeLabel = (g) => (g.kind === 'superset' ? 'Superset' : 'Circuit ' + (CIRCUIT_MODES.find((m) => m[0] === g.mode) || ['', ''])[1]);

// "3 tours · repos 90 s après chaque tour", "4 tours · 40 s de travail / 20 s de repos", "12 min" (le type est affiché à part)
function describeGroup(g) {
  const parts = [];
  if (g.kind === 'superset' || g.mode === 'classique') parts.push(g.rounds + ' tours', 'repos ' + g.rest + ' s après chaque tour');
  else if (g.mode === 'hiit') parts.push(g.rounds + ' tours', g.work + ' s de travail / ' + g.rest + ' s de repos');
  else parts.push(g.minutes + ' min');
  return parts.join(' · ');
}
// résultat d'un circuit chronométré (historique)
function groupResultText(g) {
  const r = g.result || {};
  if (g.mode === 'amrap') return (r.rounds || 0) + ' tour' + ((r.rounds || 0) > 1 ? 's' : '') + ' complet' + ((r.rounds || 0) > 1 ? 's' : '');
  if (g.mode === 'emom') { const log = r.log || []; return log.filter((x) => x.hit).length + '/' + log.length + ' minutes réussies'; }
  return '';
}

// données reçues d'un fichier / du dépôt : on ne garde que des groupes bien formés
function cleanGroups(groups) {
  const out = {};
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return out;
  const int = (v, lo, hi, def) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : def);
  for (const [gid, g] of Object.entries(groups)) {
    if (!g || typeof gid !== 'string' || gid.length > 80 || !['superset', 'circuit'].includes(g.kind)) continue;
    const mode = g.kind === 'superset' ? 'classique' : CIRCUIT_MODES.some((m) => m[0] === g.mode) ? g.mode : 'classique';
    const c = { kind: g.kind, mode, rounds: int(g.rounds, 1, 50, 3), rest: int(g.rest, 0, 900, 90), work: int(g.work, 5, 900, 40), minutes: int(g.minutes, 1, 120, 10) };
    const r = g.result;
    if (r && typeof r === 'object') {
      if (mode === 'amrap') c.result = { rounds: int(r.rounds, 0, 999, 0) };
      if (mode === 'emom' && Array.isArray(r.log)) c.result = { log: r.log.filter((x) => x && Number.isFinite(x.m)).slice(0, 200).map((x) => ({ m: int(x.m, 0, 200, 0), k: int(x.k, 0, 50, 0), reps: int(x.reps, 0, 999, 0), hit: !!x.hit })) };
    }
    if (g.timer && typeof g.timer === 'object') c.timer = g.timer; // séance en cours seulement (jamais synchronisée)
    out[gid] = c;
  }
  return out;
}

// groupes cohérents après un retrait d'exercice : superset d'au moins 2 exercices, circuit d'au moins 1
function normalizeGroups(s) {
  if (!s.groups) return;
  for (const gid of Object.keys(s.groups)) {
    const m = groupMembers(s, gid);
    if (!m.length || (s.groups[gid].kind === 'superset' && m.length < 2)) {
      m.forEach((e) => delete e.gid);
      delete s.groups[gid];
    }
  }
  s.exercises.forEach((e) => { if (e.gid && !s.groups[e.gid]) delete e.gid; });
  // membres côte à côte (un regroupement peut avoir séparé ceux d'un autre groupe) : chaque groupe à la place de son premier
  const out = [], placed = new Set();
  for (const e of s.exercises) {
    if (!e.gid) { out.push(e); continue; }
    if (placed.has(e.gid)) continue;
    placed.add(e.gid);
    out.push(...s.exercises.filter((x) => x.gid === e.gid));
  }
  s.exercises = out;
  if (!Object.keys(s.groups).length) delete s.groups;
}
// déplace l'exercice i d'un cran (dir = -1 ou 1) : à l'intérieur de son groupe, ou tout son groupe d'un bloc
// quand il en sort ou enjambe un autre groupe (un groupe n'est jamais coupé). s : séance ou modèle.
function moveExercise(s, i, dir) {
  const list = s.exercises, x = list[i], y = list[i + dir];
  if (!x || !y) return;
  if (x.gid && x.gid === y.gid) { list[i] = y; list[i + dir] = x; return; }
  const block = (e) => (e.gid && s.groups && s.groups[e.gid] ? list.filter((z) => z.gid === e.gid) : [e]);
  const mine = block(x), other = block(y);
  const rest = list.filter((z) => !mine.includes(z));
  rest.splice(rest.indexOf(other[0]) + (dir > 0 ? other.length : 0), 0, ...mine);
  s.exercises = rest;
  normalizeGroups(s);
}
// groupes recopiés dans un modèle ou une nouvelle séance : réglages seulement (ni minuteur ni résultat)
function settingsOnlyGroups(groups) {
  const out = cleanGroups(groups);
  for (const g of Object.values(out)) { delete g.timer; delete g.result; }
  return out;
}
// minuteur déjà lancé : la composition du circuit ne doit plus changer (les intervalles sont attribués par position)
const timerStarted = (g) => !!(g && g.timer && (g.timer.startedAt || g.timer.acc));

// le tour i est-il complet (série i validée pour chaque membre qui en a une) ?
const roundComplete = (s, gid, i) => groupMembers(s, gid).every((e) => !e.sets[i] || e.sets[i].done);

// temps écoulé du minuteur d'un groupe (ms)
const groupElapsed = (g) => (g.timer ? (g.timer.acc || 0) + (g.timer.startedAt ? Date.now() - g.timer.startedAt : 0) : 0);
const groupTotalSec = (g, n) => (g.mode === 'hiit' ? g.rounds * n * (g.work + g.rest) - g.rest : g.minutes * 60);
// HIIT : position dans le programme -> { j (intervalle de travail n°), round, k (membre), phase: 'work'|'rest'|'end', left (s) }
function hiitPhase(g, n, sec) {
  const cycle = g.work + g.rest, total = groupTotalSec(g, n);
  if (sec >= total) return { phase: 'end', j: g.rounds * n, left: 0 };
  const j = Math.floor(sec / cycle), into = sec - j * cycle;
  const work = into < g.work;
  return { j, round: Math.floor(j / n), k: j % n, phase: work ? 'work' : 'rest', left: work ? g.work - into : cycle - into };
}
// nombre d'intervalles de travail terminés à l'instant sec
const hiitWorkDone = (g, n, sec) => Math.min(g.rounds * n, sec < g.work ? 0 : Math.floor((sec - g.work) / (g.work + g.rest)) + 1);

// ---------- éditeur : grouper un exercice ----------

// s : séance, ou brouillon de modèle si tpl (séries = un nombre, reps visées = e.reps, ni minuteur ni résultat).
// onDone() est appelé après modification
function editGroup(s, ex, onDone, tpl) {
  const ov = overlay();
  const cur = groupOf(s, ex);
  const locked = !tpl && timerStarted(cur);
  const nSets = (e) => (tpl ? e.sets : e.sets.length);
  const st = {
    kind: cur ? cur.kind : 'none',
    mode: cur ? cur.mode : 'classique',
    rounds: cur ? cur.rounds : Math.max(GROUP_DEFAULTS.rounds, nSets(ex)),
    rest: cur ? cur.rest : ex.restSec || GROUP_DEFAULTS.rest,
    work: cur ? cur.work : GROUP_DEFAULTS.work,
    hiitRest: cur && cur.mode === 'hiit' ? cur.rest : GROUP_DEFAULTS.hiitRest,
    minutes: cur ? cur.minutes : GROUP_DEFAULTS.minutes,
    sel: new Set(cur ? groupMembers(s, ex.gid) : [ex]),
  };
  const defaultReps = (e) => { const r = parseReps(tpl ? e.reps : e.targetReps); return e.emomReps || (r ? r.lo : 10); };
  const emom = new Map(s.exercises.map((e) => [e, defaultReps(e)]));

  const seg = (opts, value, onPick) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', class: 'seg-b' + (value === v ? ' on' : ''), disabled: locked, onclick: () => onPick(v) }, l)));
  const num = (label, key, unit) => h('label', { class: 'field' }, h('span', { class: 'muted' }, label + (unit ? ' (' + unit + ')' : '')),
    h('input', { type: 'text', inputMode: 'numeric', value: st[key], disabled: locked, oninput: (e) => { const v = parseInt(e.target.value); if (v > 0) st[key] = v; } }));

  function render() {
    const others = s.exercises;
    const isEmom = st.kind === 'circuit' && st.mode === 'emom';
    ov.el.replaceChildren(h('div', { class: 'pad' },
      h('div', { class: 'row between' }, h('h1', { class: 'grow' }, 'Éditer'), h('button', { class: 'btn', onclick: () => ov.close() }, 'Annuler')),
      h('div', { class: 'card' },
        h('b', {}, lib.fr(ex.exId)), h('div', { class: 'en' }, lib.en(ex.exId)),
        h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => { ov.close(); editExercise(ex.exId, onDone); } }, '✎ Modifier l\'exercice')),

      h('h2', {}, 'Grouper'),
      seg([['none', 'Seul'], ['superset', 'Superset'], ['circuit', 'Circuit']], st.kind, (v) => { st.kind = v; render(); }),
      st.kind === 'superset' && h('p', { class: 'muted small' }, 'Deux exercices ou plus, enchaînés sans pause ; le repos démarre quand le tour est complet.'),
      st.kind === 'circuit' && [
        seg(CIRCUIT_MODES.map((m) => [m[0], m[1]]), st.mode, (v) => { st.mode = v; render(); }),
        h('p', { class: 'muted small' }, CIRCUIT_MODES.find((m) => m[0] === st.mode)[2]),
      ],
      locked && h('p', { class: 'hint' }, 'Le minuteur de ce circuit a démarré : ses réglages sont verrouillés. Tu peux encore le dégrouper.'),

      st.kind !== 'none' && [
        h('div', { class: 'card' },
          h('b', {}, 'Exercices du groupe'),
          others.map((e) => {
            const other = e !== ex && e.gid && e.gid !== ex.gid && s.groups && s.groups[e.gid];
            return h('label', { class: 'pickrow' },
              h('input', { type: 'checkbox', checked: st.sel.has(e), disabled: e === ex || locked, onchange: (ev) => { if (ev.target.checked) st.sel.add(e); else st.sel.delete(e); render(); } }),
              h('span', { class: 'grow' }, lib.fr(e.exId), other && h('span', { class: 'muted small' }, '  (quitte le ' + modeLabel(other).toLowerCase() + ' ' + groupLetter(s, e.gid) + ')')),
              isEmom && st.sel.has(e) && h('span', { class: 'row' }, h('input', { type: 'text', inputMode: 'numeric', class: 'num sm', value: emom.get(e), disabled: locked, 'aria-label': 'Objectif de reps par minute', oninput: (ev) => { const v = parseInt(ev.target.value); if (v > 0) emom.set(e, v); } }), h('span', { class: 'muted small' }, ' reps/min')));
          })),
        h('div', { class: 'fields two' },
          (st.kind === 'superset' || st.mode === 'classique') && [num('Tours', 'rounds'), num('Repos par tour', 'rest', 's')],
          st.kind === 'circuit' && st.mode === 'hiit' && [num('Tours', 'rounds'), num('Travail', 'work', 's'), num('Repos entre exercices', 'hiitRest', 's')],
          st.kind === 'circuit' && (st.mode === 'amrap' || st.mode === 'emom') && num('Durée', 'minutes', 'min')),
        isEmom && h('p', { class: 'muted small' }, 'Minute 1 : premier exercice, minute 2 : le suivant, et ainsi de suite. Fixe l\'objectif de reps de chaque minute ci-dessus.'),
      ],
      !locked && h('button', { class: 'btn primary wide', onclick: save }, 'Enregistrer'),
      cur && h('button', { class: 'btn danger wide', onclick: ungroup }, 'Dégrouper'),
    ));
  }

  function ungroup() {
    groupMembers(s, ex.gid).forEach((e) => delete e.gid);
    if (s.groups) delete s.groups[ex.gid];
    normalizeGroups(s);
    done();
  }

  function save() {
    if (st.kind === 'none') { if (cur) delete ex.gid; normalizeGroups(s); return done(); }
    const sel = s.exercises.filter((e) => st.sel.has(e));
    if (st.kind === 'superset' && sel.length < 2) return toast('Choisis au moins un autre exercice pour le superset');
    const gid = cur ? ex.gid : uid();
    // anciens membres décochés : sortent du groupe ; membres d'un autre groupe : le quittent
    groupMembers(s, gid).forEach((e) => { if (!st.sel.has(e)) delete e.gid; });
    sel.forEach((e) => { e.gid = gid; });
    // membres côte à côte, à la place du premier
    const rest = s.exercises.filter((e) => !st.sel.has(e));
    const pos = s.exercises.indexOf(sel[0]) - s.exercises.slice(0, s.exercises.indexOf(sel[0])).filter((e) => st.sel.has(e)).length;
    rest.splice(pos, 0, ...sel);
    s.exercises = rest;

    const g = { kind: st.kind, mode: st.kind === 'superset' ? 'classique' : st.mode, rounds: st.rounds, rest: st.rest, work: st.work, minutes: st.minutes };
    if (g.mode === 'hiit') g.rest = st.hiitRest;
    s.groups = s.groups || {};
    s.groups[gid] = g;
    // une série par tour (on ne retire jamais une série validée)
    if (tpl && (g.mode === 'classique' || g.mode === 'hiit')) sel.forEach((e) => (e.sets = g.rounds));
    else if (g.mode === 'classique' || g.mode === 'hiit') {
      for (const e of sel) {
        while (e.sets.length < g.rounds) e.sets.push(newSet());
        while (e.sets.length > g.rounds && !e.sets[e.sets.length - 1].done) e.sets.pop();
      }
    }
    if (isTimed(g)) sel.forEach((e) => delete e.warmup); // pas d'échauffement dans un circuit chronométré
    if (g.mode === 'emom') sel.forEach((e) => (e.emomReps = emom.get(e)));
    if (!tpl && g.mode === 'amrap') g.result = { rounds: 0 };
    if (!tpl && g.mode === 'emom') g.result = { log: [] };
    normalizeGroups(s);
    done();
  }

  function done() {
    if (!tpl) store.save(); // un modèle n'est enregistré qu'avec son bouton « Enregistrer »
    ov.close();
    if (onDone) onDone();
  }
  render();
}

// ---------- minuteurs (séance en cours) ----------

// api : { placeholders(ex, i), render(), save() } fournis par openSession.
// Retourne { panel(gid) : élément du minuteur, tick() : à appeler toutes les 250 ms, finishAll() : avant la fin de séance }
function circuitRuntime(s, api) {
  const refs = {}; // gid -> éléments mis à jour sans tout redessiner (le clavier resterait ouvert ailleurs)
  const lastKey = {}; // gid -> dernière phase vue, pour biper au changement
  let wake = null;

  // écran allumé pendant un circuit chronométré (le navigateur relâche le verrou quand l'app passe en arrière-plan)
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }
  const anyRunning = () => Object.values(s.groups || {}).some((g) => g.timer && g.timer.startedAt);
  const onVisible = () => { if (document.visibilityState === 'visible' && anyRunning()) keepAwake(true); };
  document.addEventListener('visibilitychange', onVisible);

  // valide la série i de l'exercice avec les valeurs saisies ou pré-remplies ; false si les reps sont inconnues
  function validate(e, i, reps) {
    while (e.sets.length <= i) e.sets.push(newSet());
    const st = e.sets[i];
    if (st.done) return true;
    const ph = api.placeholders(e, i);
    if (st.kg == null) st.kg = ph.kg != null ? ph.kg : 0;
    if (reps != null) st.reps = reps;
    else if (st.reps == null) st.reps = ph.reps;
    if (st.reps == null) return false;
    st.done = true;
    st.ts = Date.now();
    return true;
  }
  const nextUndone = (e) => { const i = e.sets.findIndex((x) => !x.done); return i < 0 ? e.sets.length : i; };

  function start(gid) {
    const g = s.groups[gid];
    primeAudio();
    g.timer = g.timer || { acc: 0, handled: 0 };
    if (g.timer.ended) return;
    if (g.mode === 'emom' && !g.timer.cur) g.timer.cur = { m: 0, reps: 0 };
    g.timer.startedAt = Date.now();
    store.data.rest = null;
    keepAwake(true);
    api.save();
    api.render();
  }
  function pause(gid) {
    const g = s.groups[gid];
    g.timer.acc = groupElapsed(g);
    g.timer.startedAt = null;
    if (!anyRunning()) keepAwake(false);
    api.save();
    api.render();
  }
  // fin du circuit (temps écoulé ou arrêt manuel) : la minute EMOM en cours est enregistrée
  function end(gid, silent) {
    const g = s.groups[gid];
    if (!g.timer || g.timer.ended) return;
    if (g.mode === 'emom' && g.timer.cur && g.timer.cur.m < g.minutes) closeMinute(g, gid);
    g.timer.acc = Math.min(groupElapsed(g), groupTotalSec(g, groupMembers(s, gid).length) * 1000);
    g.timer.startedAt = null;
    g.timer.ended = true;
    if (!anyRunning()) keepAwake(false);
    if (!silent) beep();
    api.save();
  }

  function closeMinute(g, gid) {
    const m = groupMembers(s, gid), c = g.timer.cur;
    const k = c.m % m.length, e = m[k];
    const target = e.emomReps || 0;
    g.result = g.result || { log: [] };
    g.result.log.push({ m: c.m, k, reps: c.reps, hit: c.reps >= target });
    if (c.reps > 0) validate(e, nextUndone(e), c.reps); // pas de série à 0 rep : la minute reste dans le journal
    g.timer.cur = { m: c.m + 1, reps: 0 };
  }

  // rattrape tout ce qui s'est passé depuis la dernière fois (app en arrière-plan, séance réduite) ; true si redessin nécessaire
  function advance(gid) {
    const g = s.groups[gid];
    if (!g.timer || !g.timer.startedAt || g.timer.ended) return false;
    const m = groupMembers(s, gid), n = m.length, sec = groupElapsed(g) / 1000;
    let changed = false;
    if (g.mode === 'hiit') {
      const doneN = hiitWorkDone(g, n, sec);
      while ((g.timer.handled || 0) < doneN) {
        const j = g.timer.handled || 0;
        validate(m[j % n], Math.floor(j / n));
        g.timer.handled = j + 1;
        changed = true;
      }
    }
    if (g.mode === 'emom') {
      while (g.timer.cur.m < Math.min(g.minutes, Math.floor(sec / 60))) { closeMinute(g, gid); changed = true; }
    }
    if (sec >= groupTotalSec(g, n)) { end(gid); return true; }
    if (changed) api.save();
    return changed;
  }

  function tick() {
    let redraw = false;
    for (const gid of Object.keys(s.groups || {})) {
      const g = s.groups[gid];
      if (!isTimed(g)) continue;
      if (advance(gid)) redraw = true;
      const r = refs[gid];
      if (!r || !r.time.isConnected) continue;
      const n = groupMembers(s, gid).length, sec = groupElapsed(g) / 1000, total = groupTotalSec(g, n);
      let key = '';
      const idle = !(g.timer && (g.timer.startedAt || g.timer.acc));
      if (g.mode === 'hiit') {
        const p = hiitPhase(g, n, sec);
        key = p.phase + p.j;
        r.time.textContent = p.phase === 'end' ? '✓' : idle ? fmtClock(total) : fmtClock(Math.ceil(p.left));
        const e = groupMembers(s, gid)[p.phase === 'rest' ? (p.k + 1) % n : p.k];
        r.label.textContent = p.phase === 'end' ? 'Circuit terminé' : idle ? 'Prêt · on commence par ' + (e ? lib.fr(e.exId) : '') : (p.phase === 'work' ? 'Travail · ' : 'Repos · ensuite ') + (e ? lib.fr(e.exId) : '');
        r.sub.textContent = p.phase === 'end' ? '' : 'Tour ' + (p.round + 1) + '/' + g.rounds;
        r.box.classList.toggle('rest', p.phase === 'rest');
      } else if (g.mode === 'amrap') {
        r.time.textContent = fmtClock(Math.ceil(total - sec));
        key = g.timer && g.timer.ended ? 'end' : 'run';
      } else if (g.mode === 'emom') {
        const c = (g.timer && g.timer.cur) || { m: 0, reps: 0 };
        const e = groupMembers(s, gid)[c.m % n];
        const target = e ? e.emomReps || 0 : 0;
        key = 'm' + c.m;
        r.time.textContent = g.timer && g.timer.ended ? '✓' : fmtClock(Math.ceil(60 - (sec % 60)));
        r.label.textContent = g.timer && g.timer.ended ? 'EMOM terminé' : 'Minute ' + Math.min(c.m + 1, g.minutes) + '/' + g.minutes + ' · ' + (e ? lib.fr(e.exId) : '');
        if (r.count) { r.count.textContent = c.reps + ' / ' + target; r.count.classList.toggle('hit', c.reps >= target && target > 0); }
      }
      if (g.timer && g.timer.startedAt && lastKey[gid] && lastKey[gid] !== key) beep();
      lastKey[gid] = key;
    }
    if (redraw) api.render();
  }

  // AMRAP : un tour de plus = une série validée pour chaque exercice
  function addRound(gid) {
    const g = s.groups[gid], m = groupMembers(s, gid);
    const missing = m.filter((e) => { const i = nextUndone(e); const st = e.sets[i]; return !(st && st.reps != null) && api.placeholders(e, i).reps == null; });
    if (missing.length) return toast('Indique les reps de : ' + missing.map((e) => lib.fr(e.exId)).join(', '));
    m.forEach((e) => validate(e, nextUndone(e)));
    g.result = { rounds: ((g.result && g.result.rounds) || 0) + 1 };
    api.save();
    api.render();
  }
  function bumpReps(gid, d) {
    const c = s.groups[gid].timer.cur;
    c.reps = Math.max(0, c.reps + d);
    api.save();
    tick();
  }

  function panel(gid) {
    const g = s.groups[gid];
    if (!isTimed(g)) return null;
    const t = g.timer || {};
    const running = !!t.startedAt, started = running || t.acc > 0, ended = !!t.ended;
    const r = { box: h('div', { class: 'ctimer' + (running ? ' on' : '') }), time: h('b', { class: 'ctimer-t' }), label: h('div', { class: 'ctimer-l' }), sub: h('div', { class: 'muted small' }) };
    refs[gid] = r;
    const controls = ended ? null : h('div', { class: 'row wrap' },
      running ? h('button', { class: 'btn sm', onclick: () => pause(gid) }, 'Pause') : h('button', { class: 'btn sm primary', onclick: () => start(gid) }, started ? 'Reprendre' : 'Démarrer'),
      started && h('button', { class: 'btn sm', onclick: () => { if (confirm('Arrêter ce circuit maintenant ?')) { end(gid, true); api.render(); } } }, 'Arrêter'));
    if (g.mode === 'amrap') {
      r.label.textContent = ended ? 'AMRAP terminé' : 'Temps restant';
      r.sub.textContent = '';
      setChildren(r.box, h('div', { class: 'row between' }, h('div', {}, r.label, r.time), h('div', { class: 'ctimer-big' }, String((g.result && g.result.rounds) || 0), h('span', { class: 'muted small' }, ' tours'))),
        started && !ended && h('button', { class: 'btn primary wide', onclick: () => addRound(gid) }, '+1 tour'),
        controls);
    } else if (g.mode === 'emom') {
      r.count = h('b', { class: 'ctimer-big' });
      setChildren(r.box, h('div', {}, r.label, r.time),
        started && !ended && h('div', { class: 'row between' },
          h('button', { class: 'btn', onclick: () => bumpReps(gid, -1) }, '−1'),
          r.count,
          h('button', { class: 'btn', onclick: () => bumpReps(gid, 1) }, '+1'),
          h('button', { class: 'btn', onclick: () => bumpReps(gid, 5) }, '+5')),
        ended && h('div', { class: 'muted small' }, groupResultText(g)),
        controls);
    } else {
      setChildren(r.box, h('div', {}, r.label, r.time, r.sub), controls);
    }
    return r.box; // rempli par le tick() qui suit chaque render()
  }

  // avant de terminer la séance : les minuteurs s'arrêtent, leur état d'exécution disparaît (le résultat reste)
  function finishAll() {
    for (const gid of Object.keys(s.groups || {})) {
      const g = s.groups[gid];
      if (isTimed(g) && g.timer && !g.timer.ended && (g.timer.startedAt || g.timer.acc)) end(gid, true);
      delete g.timer;
    }
    keepAwake(false);
  }

  return {
    panel, tick, finishAll,
    stop: () => { document.removeEventListener('visibilitychange', onVisible); keepAwake(false); },
    resume: () => { if (anyRunning()) keepAwake(true); },
  };
}
