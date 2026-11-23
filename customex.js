// Exercices personnels : créés dans l'app, avec les mêmes champs que la bibliothèque free-exercise-db
// (muscles principaux et secondaires, matériel, catégorie, niveau, poussée/traction, poly-articulaire/isolation, étapes).
//   store.data.customExercises = [{ id, name, primaryMuscles, secondaryMuscles, equipment, category, level, force,
//                                   mechanic, instructions:[…], hidden, createdAt, updatedAt }]
// L'id (« perso_… ») ne change jamais : les séances et modèles y font référence. Pour la même raison, un exercice
// perso ne se supprime pas : il se masque (il disparaît de la bibliothèque mais garde son nom dans l'historique).
// Synchronisé et exporté comme le reste ; à la fusion, la version modifiée le plus récemment gagne.
// Ce fichier contient aussi l'éditeur des exercices de la bibliothèque (modifications dans store.data.exerciseEdits).

const CUSTOM_PREFIX = 'perso_';
const CUSTOM_STEPS_MAX = 12, CUSTOM_STEP_LEN = 300, CUSTOM_NAME_LEN = 80;
const isCustom = (id) => typeof id === 'string' && id.startsWith(CUSTOM_PREFIX);

// données venant d'un fichier ou du dépôt : on ne garde que ce qui a la bonne forme, valeurs connues seulement
function cleanCustoms(list) {
  if (!Array.isArray(list)) return [];
  const pick = (dict, v, def) => (v != null && Object.prototype.hasOwnProperty.call(dict, v) ? v : def);
  const muscles = (a) => (Array.isArray(a) ? uniq(a.filter((m) => Object.prototype.hasOwnProperty.call(TR.muscles, m))) : []);
  const out = [], seen = new Set();
  for (const c of list) {
    if (!c || !isCustom(c.id) || c.id.length > 80 || seen.has(c.id) || typeof c.name !== 'string') continue;
    const name = c.name.trim().slice(0, CUSTOM_NAME_LEN);
    const primary = muscles(c.primaryMuscles);
    if (!name || !primary.length || !Number.isFinite(c.updatedAt)) continue;
    seen.add(c.id);
    out.push({
      id: c.id, name, primaryMuscles: primary, secondaryMuscles: muscles(c.secondaryMuscles).filter((m) => !primary.includes(m)),
      equipment: c.equipment === null ? null : pick(TR.equipment, c.equipment, null),
      category: pick(TR.category, c.category, 'strength'), level: pick(TR.level, c.level, 'beginner'),
      force: pick(TR.force, c.force, null), mechanic: pick(TR.mechanic, c.mechanic, null),
      instructions: (Array.isArray(c.instructions) ? c.instructions : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, CUSTOM_STEPS_MAX).map((x) => x.trim().slice(0, CUSTOM_STEP_LEN)),
      hidden: !!c.hidden, createdAt: Number.isFinite(c.createdAt) ? c.createdAt : c.updatedAt, updatedAt: c.updatedAt,
    });
  }
  return out;
}

// fusion (synchro, import) : par id, le plus récemment modifié gagne ; à égalité, a (local)
function mergeCustoms(a, b) {
  const map = new Map();
  for (const c of [...b, ...a]) { const cur = map.get(c.id); if (!cur || c.updatedAt >= cur.updatedAt) map.set(c.id, c); }
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
}

// Exercices de la bibliothèque modifiés : store.data.exerciseEdits = { exId: { champ modifié…, updatedAt } }
// (champs : voir EDIT_FIELDS dans library.js ; le nom reste dans nameOverrides). Une entrée sans champ = « rétabli »,
// gardée pour que le rétablissement se propage aux autres appareils.
function cleanEdits(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  const has = (dict, v) => v != null && Object.prototype.hasOwnProperty.call(dict, v);
  const muscles = (a) => (Array.isArray(a) ? uniq(a.filter((m) => has(TR.muscles, m))) : null);
  for (const [id, o] of Object.entries(obj)) {
    if (!o || typeof o !== 'object' || id.length > 120 || isCustom(id) || !Number.isFinite(o.updatedAt)) continue;
    const c = { updatedAt: o.updatedAt };
    const prim = muscles(o.primaryMuscles);
    if (prim && prim.length) c.primaryMuscles = prim;
    const sec = muscles(o.secondaryMuscles);
    if (sec) c.secondaryMuscles = sec.filter((m) => !(c.primaryMuscles || []).includes(m));
    if ('equipment' in o && (o.equipment === null || has(TR.equipment, o.equipment))) c.equipment = o.equipment === 'null' ? null : o.equipment;
    for (const [k, dict] of [['category', TR.category], ['level', TR.level]]) if (has(dict, o[k])) c[k] = o[k];
    for (const [k, dict] of [['force', TR.force], ['mechanic', TR.mechanic]]) if (k in o && (o[k] === null || has(dict, o[k]))) c[k] = o[k];
    out[id] = c;
  }
  return out;
}

// ---------- éditeur ----------

// Point d'entrée : exercice perso -> son éditeur (avec étapes) ; exercice de la bibliothèque -> modification de l'original
function editExercise(exId, onDone) {
  return isCustom(exId) ? editCustomExercise(exId, onDone) : editLibraryExercise(exId, onDone);
}

// Formulaire commun. opt : { title, d (champs, modifiés sur place), steps (texte des étapes ou null : pas d'étapes),
//   saveLabel, selfId (exclu du contrôle de doublon), onSave(name, stepsLines, ov), footer(ov) -> éléments }
function exerciseForm(opt) {
  const d = opt.d;
  const ov = overlay();
  const steps = opt.steps != null && h('textarea', { class: 'note', rows: 5, placeholder: 'Une étape par ligne.\nEx. : Allonge-toi sur le banc, pieds au sol.\nDescends la barre jusqu\'à la poitrine…', value: opt.steps });

  // pastilles des 17 muscles de la base ; les muscles principaux sont exclus des secondaires
  function muscleSet(key, other) {
    const wrap = h('div', { class: 'chips' });
    setChildren(wrap, Object.keys(TR.muscles).sort((x, y) => trMuscle(x).localeCompare(trMuscle(y), 'fr')).map((m) => {
      const on = d[key].includes(m), taken = other && d[other].includes(m);
      return h('button', {
        type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), disabled: taken,
        onclick: () => { d[key] = on ? d[key].filter((x) => x !== m) : [...d[key], m]; if (key === 'primaryMuscles') d.secondaryMuscles = d.secondaryMuscles.filter((x) => !d.primaryMuscles.includes(x)); render(); },
      }, h('span', { class: 'dot f-' + ((groupById[rawToGroup[m]] || {}).family || 'core') }), trMuscle(m));
    }));
    return wrap;
  }
  const select = (label, key, dict, allowNone) => h('label', { class: 'field' }, h('span', { class: 'muted' }, label),
    h('select', { onchange: (e) => (d[key] = e.target.value === '' ? null : e.target.value) },
      allowNone && h('option', { value: '', selected: d[key] == null }, '—'),
      Object.entries(dict).filter(([v]) => v !== 'null').map(([v, l]) => h('option', { value: v, selected: d[key] === v }, l))));

  const nameInput = h('input', { type: 'text', value: d.name, maxLength: CUSTOM_NAME_LEN, placeholder: 'Ex. : Développé couché prise serrée à la Smith', autocomplete: 'off', oninput: (e) => (d.name = e.target.value) });

  function render() {
    const scroll = ov.el.scrollTop;
    ov.el.replaceChildren(h('div', { class: 'pad' },
      h('div', { class: 'row between' }, h('h1', { class: 'grow' }, opt.title), h('button', { class: 'btn', onclick: () => ov.close() }, 'Annuler')),
      opt.subtitle && h('p', { class: 'en' }, opt.subtitle),
      h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Nom'), nameInput),
      h('div', { class: 'card' }, h('b', {}, 'Muscles principaux'), h('p', { class: 'muted small' }, 'Au moins un. Ce sont eux qui comptent pour la carte des muscles et la récupération.'), muscleSet('primaryMuscles')),
      h('div', { class: 'card' }, h('b', {}, 'Muscles secondaires'), muscleSet('secondaryMuscles', 'primaryMuscles')),
      h('div', { class: 'fields two' },
        select('Matériel', 'equipment', TR.equipment, true),
        select('Catégorie', 'category', TR.category),
        select('Niveau', 'level', TR.level),
        select('Mouvement', 'force', TR.force, true),
        select('Type', 'mechanic', TR.mechanic, true)),
      h('p', { class: 'muted small' }, 'Le matériel sert au calcul des disques (barre), au palier de progression et à l\'échauffement.'),
      steps && h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Étapes (facultatif)'), steps),
      h('button', { class: 'btn primary wide', onclick: save }, opt.saveLabel),
      opt.footer && opt.footer(ov)));
    ov.el.scrollTop = scroll;
  }

  function save() {
    const name = d.name.trim();
    if (!name) return toast('Donne un nom à l\'exercice');
    if (!d.primaryMuscles.length) return toast('Choisis au moins un muscle principal');
    const twin = lib.exercises.find((e) => e.id !== opt.selfId && norm(lib.fr(e.id)) === norm(name));
    if (twin && !confirm('« ' + lib.fr(twin.id) + ' » existe déjà dans la bibliothèque. Garder quand même ce nom ?')) return;
    opt.onSave(name, steps ? steps.value.split('\n') : null, ov);
  }

  render();
  return { ov, focusName: () => setTimeout(() => nameInput.focus(), 50) };
}

// après chaque enregistrement : bibliothèque, écran et synchro à jour
function afterExerciseChange(ov, onDone, id) {
  store.save();
  lib.refreshCustoms();
  ov.close();
  refreshView();
  syncSoon();
  if (onDone) onDone(id);
}

// exId : exercice perso à modifier, ou null pour en créer un. onDone(id) après enregistrement.
function editCustomExercise(exId, onDone) {
  const existing = exId && store.data.customExercises.find((c) => c.id === exId);
  const d = existing ? JSON.parse(JSON.stringify(existing))
    : { name: '', primaryMuscles: [], secondaryMuscles: [], equipment: null, category: 'strength', level: 'beginner', force: null, mechanic: null, instructions: [] };

  function commit(c, ov) {
    const list = store.data.customExercises;
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.push(c);
    afterExerciseChange(ov, onDone, c.id);
  }

  const form = exerciseForm({
    title: existing ? 'Modifier l\'exercice' : 'Nouvel exercice', d, steps: d.instructions.join('\n'), selfId: exId,
    saveLabel: existing ? 'Enregistrer' : 'Créer l\'exercice',
    onSave(name, lines, ov) {
      const now = Date.now();
      const c = cleanCustoms([{ ...d, name, id: existing ? existing.id : CUSTOM_PREFIX + uid(), instructions: lines, createdAt: existing ? existing.createdAt : now, updatedAt: now }])[0];
      commit(c, ov);
      toast(existing ? 'Exercice enregistré' : 'Exercice « ' + c.name + ' » créé');
    },
    footer: (ov) => existing && [
      h('button', { class: 'btn wide', onclick: () => { commit({ ...existing, hidden: !existing.hidden, updatedAt: Date.now() }, ov); toast(existing.hidden ? 'Exercice de retour dans la bibliothèque' : 'Exercice masqué'); } },
        existing.hidden ? 'Afficher à nouveau dans la bibliothèque' : 'Masquer de la bibliothèque'),
      h('p', { class: 'muted small' }, 'Un exercice perso ne se supprime pas : tes séances y font référence. Masqué, il n\'apparaît plus dans la bibliothèque mais reste dans ton historique.')],
  });
  if (!existing) form.focusName();
}

// Exercice de la bibliothèque : les modifications remplacent l'original partout (historique compris) ;
// « Rétablir l'original » efface nom et caractéristiques modifiés.
function editLibraryExercise(exId, onDone) {
  const e = lib.byId[exId];
  if (!e) return;
  const orig = e.orig || Object.fromEntries(EDIT_FIELDS.map((k) => [k, e[k]]));
  const d = { name: lib.fr(exId), ...Object.fromEntries(EDIT_FIELDS.map((k) => [k, Array.isArray(e[k]) ? [...e[k]] : e[k]])) };
  const modified = lib.edited(exId) || !!lib.override(exId);
  const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x) => b.includes(x)) : (a ?? null) === (b ?? null));

  exerciseForm({
    title: 'Modifier l\'exercice', subtitle: lib.en(exId) + ' · nom d\'origine : ' + lib.frDefault(exId), d, steps: null, selfId: exId, saveLabel: 'Enregistrer',
    onSave(name, _lines, ov) {
      const now = Date.now();
      // nom : vide ou identique à l'original = rétabli
      const origName = lib.frDefault(exId);
      const nameReset = name === origName;
      if (!nameReset || lib.override(exId)) store.data.nameOverrides[exId] = { name: nameReset ? '' : name, updatedAt: now };
      // caractéristiques : on ne garde que ce qui diffère de l'original
      const diff = { updatedAt: now };
      for (const k of EDIT_FIELDS) if (!same(d[k], orig[k])) diff[k] = d[k];
      if (Object.keys(diff).length > 1 || lib.edited(exId)) store.data.exerciseEdits[exId] = cleanEdits({ [exId]: diff })[exId];
      afterExerciseChange(ov, onDone, exId);
      toast('Exercice enregistré');
    },
    footer: (ov) => [
      modified && h('button', { class: 'btn wide', onclick: () => {
        const now = Date.now();
        if (lib.override(exId)) store.data.nameOverrides[exId] = { name: '', updatedAt: now };
        if (lib.edited(exId)) store.data.exerciseEdits[exId] = { updatedAt: now };
        afterExerciseChange(ov, onDone, exId);
        toast('Exercice d\'origine rétabli');
      } }, 'Rétablir l\'original'),
      h('p', { class: 'muted small' }, 'Tes modifications s\'appliquent partout : recherche, séances, historique, carte des muscles et récupération. Le nom anglais et le nom d\'origine restent utilisables dans la recherche.')],
  });
}

// étapes d'un exercice perso, repliables (cartes de séance)
function customSteps(exId) {
  const e = lib.byId[exId];
  if (!e || !e.custom || !e.instructions.length) return null;
  return h('details', { class: 'steps' }, h('summary', {}, 'Étapes'), h('ol', {}, e.instructions.map((x) => h('li', {}, x))));
}

// Réglages : tous les exercices perso, masqués compris
function customListCard() {
  const list = store.data.customExercises;
  return h('div', { class: 'card' },
    list.length === 0 && h('p', { class: 'muted' }, 'Aucun exercice perso pour le moment.'),
    list.map((c) => h('div', { class: 'histset' },
      h('span', {}, c.name, c.hidden && h('span', { class: 'muted small' }, '  (masqué)')),
      h('button', { class: 'linkbtn', onclick: () => editCustomExercise(c.id) }, 'Modifier'))),
    h('button', { class: 'btn wide', onclick: () => editCustomExercise(null) }, '+ Créer un exercice'));
}
