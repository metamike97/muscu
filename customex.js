// Exercices personnels : créés dans l'app, avec les mêmes champs que la bibliothèque free-exercise-db
// (muscles principaux et secondaires, matériel, catégorie, niveau, poussée/traction, poly-articulaire/isolation, étapes).
//   store.data.customExercises = [{ id, name, primaryMuscles, secondaryMuscles, equipment, category, level, force,
//                                   mechanic, instructions:[…], hidden, createdAt, updatedAt }]
// L'id (« perso_… ») ne change jamais : les séances et modèles y font référence. Pour la même raison, un exercice
// perso ne se supprime pas : il se masque (il disparaît de la bibliothèque mais garde son nom dans l'historique).
// Synchronisé et exporté comme le reste ; à la fusion, la version modifiée le plus récemment gagne.

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

// ---------- éditeur ----------

// exId : exercice perso à modifier, ou null pour en créer un. onDone(id) après enregistrement.
function editCustomExercise(exId, onDone) {
  const existing = exId && store.data.customExercises.find((c) => c.id === exId);
  const d = existing ? JSON.parse(JSON.stringify(existing))
    : { name: '', primaryMuscles: [], secondaryMuscles: [], equipment: null, category: 'strength', level: 'beginner', force: null, mechanic: null, instructions: [] };
  const ov = overlay();
  const steps = h('textarea', { class: 'note', rows: 5, placeholder: 'Une étape par ligne.\nEx. : Allonge-toi sur le banc, pieds au sol.\nDescends la barre jusqu\'à la poitrine…', value: d.instructions.join('\n') });

  // pastilles des 17 muscles de la base ; les muscles principaux sont exclus des secondaires
  function muscleSet(key, other) {
    const wrap = h('div', { class: 'chips' });
    const draw = () => setChildren(wrap, Object.keys(TR.muscles).sort((x, y) => trMuscle(x).localeCompare(trMuscle(y), 'fr')).map((m) => {
      const on = d[key].includes(m), taken = other && d[other].includes(m);
      return h('button', {
        type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), disabled: taken,
        onclick: () => { d[key] = on ? d[key].filter((x) => x !== m) : [...d[key], m]; if (key === 'primaryMuscles') d.secondaryMuscles = d.secondaryMuscles.filter((x) => !d.primaryMuscles.includes(x)); render(); },
      }, h('span', { class: 'dot f-' + ((groupById[rawToGroup[m]] || {}).family || 'core') }), trMuscle(m));
    }));
    draw();
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
      h('div', { class: 'row between' }, h('h1', { class: 'grow' }, existing ? 'Modifier l\'exercice' : 'Nouvel exercice'), h('button', { class: 'btn', onclick: () => ov.close() }, 'Annuler')),
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
      h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Étapes (facultatif)'), steps),
      h('button', { class: 'btn primary wide', onclick: save }, existing ? 'Enregistrer' : 'Créer l\'exercice'),
      existing && h('button', { class: 'btn wide', onclick: toggleHidden }, existing.hidden ? 'Afficher à nouveau dans la bibliothèque' : 'Masquer de la bibliothèque'),
      existing && h('p', { class: 'muted small' }, 'Un exercice perso ne se supprime pas : tes séances y font référence. Masqué, il n\'apparaît plus dans la bibliothèque mais reste dans ton historique.')));
    ov.el.scrollTop = scroll;
  }

  function commit(c) {
    const list = store.data.customExercises;
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.push(c);
    store.save();
    lib.refreshCustoms();
    ov.close();
    refreshView();
    syncSoon();
    if (onDone) onDone(c.id);
  }

  function save() {
    const name = d.name.trim();
    if (!name) return toast('Donne un nom à l\'exercice');
    if (!d.primaryMuscles.length) return toast('Choisis au moins un muscle principal');
    const twin = lib.exercises.find((e) => e.id !== exId && norm(lib.fr(e.id)) === norm(name));
    if (twin && !confirm('« ' + lib.fr(twin.id) + ' » existe déjà dans la bibliothèque. Créer quand même cet exercice ?')) return;
    const now = Date.now();
    const c = cleanCustoms([{ ...d, name, id: existing ? existing.id : CUSTOM_PREFIX + uid(), instructions: steps.value.split('\n'), createdAt: existing ? existing.createdAt : now, updatedAt: now }])[0];
    commit(c);
    toast(existing ? 'Exercice enregistré' : 'Exercice « ' + c.name + ' » créé');
  }

  function toggleHidden() {
    commit({ ...existing, hidden: !existing.hidden, updatedAt: Date.now() });
    toast(existing.hidden ? 'Exercice de retour dans la bibliothèque' : 'Exercice masqué');
  }

  render();
  if (!existing) setTimeout(() => nameInput.focus(), 50);
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
