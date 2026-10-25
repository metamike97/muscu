// Groupes musculaires : regroupement des 17 muscles de la base en 11 groupes lisibles, répartis en 4 familles.
// Un groupe "travaillé" = muscle PRINCIPAL de l'exercice (les muscles secondaires ne comptent pas, pour rester simple et lisible).

const MUSCLE_FAMILIES = [
  { id: 'push', label: 'Poussée' },
  { id: 'pull', label: 'Traction' },
  { id: 'legs', label: 'Jambes' },
  { id: 'core', label: 'Abdos' },
];
const MUSCLE_GROUPS = [
  { id: 'pectoraux', label: 'Pectoraux', family: 'push', raw: ['chest'] },
  { id: 'epaules', label: 'Épaules', family: 'push', raw: ['shoulders', 'neck'] },
  { id: 'triceps', label: 'Triceps', family: 'push', raw: ['triceps'] },
  { id: 'dos', label: 'Dos', family: 'pull', raw: ['lats', 'middle back', 'lower back', 'traps'] },
  { id: 'biceps', label: 'Biceps', family: 'pull', raw: ['biceps'] },
  { id: 'avantbras', label: 'Avant-bras', family: 'pull', raw: ['forearms'] },
  { id: 'quadriceps', label: 'Quadriceps', family: 'legs', raw: ['quadriceps'] },
  { id: 'ischios', label: 'Ischios', family: 'legs', raw: ['hamstrings'] },
  { id: 'fessiers', label: 'Fessiers', family: 'legs', raw: ['glutes', 'abductors', 'adductors'] },
  { id: 'mollets', label: 'Mollets', family: 'legs', raw: ['calves'] },
  { id: 'abdos', label: 'Abdos', family: 'core', raw: ['abdominals'] },
];
const MUSCLE_IDS = MUSCLE_GROUPS.map((g) => g.id);
const groupById = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g]));
const rawToGroup = {};
MUSCLE_GROUPS.forEach((g) => g.raw.forEach((r) => (rawToGroup[r] = g.id)));
const groupLabel = (id) => (groupById[id] ? groupById[id].label : id);
const groupLabels = (ids) => ids.map(groupLabel).join(', ');

// ne garde que des identifiants connus, sans doublon, dans l'ordre canonique (données venant d'un fichier ou du dépôt : non fiables)
function cleanMuscles(arr) {
  return Array.isArray(arr) ? MUSCLE_IDS.filter((id) => arr.includes(id)) : [];
}

// groupes principaux d'un exercice
function exerciseGroups(exId) {
  const e = lib.byId[exId];
  return e ? [...new Set(e.primaryMuscles.map((m) => rawToGroup[m]).filter(Boolean))] : [];
}
// groupes d'une liste d'exercices (onlyDone : seulement ceux qui ont au moins une série validée)
function groupsOfExercises(exs, onlyDone = false) {
  const out = new Set();
  for (const ex of exs) {
    if (onlyDone && !ex.sets.some((x) => x.done)) continue;
    exerciseGroups(ex.exId).forEach((g) => out.add(g));
  }
  return MUSCLE_IDS.filter((id) => out.has(id));
}
const workedGroups = (s) => groupsOfExercises(s.exercises, true);
const templateGroups = (t) => { const d = cleanMuscles(t.muscles); return d.length ? d : groupsOfExercises(t.exercises); };
// groupes ciblés déclarés, sinon ceux réellement travaillés
const sessionMuscles = (s) => { const d = cleanMuscles(s.muscles); return d.length ? d : workedGroups(s); };

// familles présentes dans une liste de groupes
const familiesOf = (ids) => MUSCLE_FAMILIES.map((f) => f.id).filter((f) => ids.some((id) => groupById[id] && groupById[id].family === f));

// Pastilles à toucher pour choisir des groupes. onChange(tableau d'identifiants) à chaque modification.
function muscleChips(initial, onChange) {
  const sel = new Set(cleanMuscles(initial));
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': 'Groupes musculaires ciblés' });
  const draw = () => setChildren(wrap, MUSCLE_GROUPS.map((g) => h('button', {
    type: 'button', class: 'chip' + (sel.has(g.id) ? ' on' : ''), 'aria-pressed': String(sel.has(g.id)),
    onclick: () => { if (sel.has(g.id)) sel.delete(g.id); else sel.add(g.id); draw(); onChange(MUSCLE_IDS.filter((id) => sel.has(id))); },
  }, h('span', { class: 'dot f-' + g.family }), g.label)));
  draw();
  return wrap;
}

// libellés en lecture seule avec le point de famille
const muscleTags = (ids) => h('div', { class: 'tags' }, ids.map((id) => h('span', { class: 'tag' }, h('span', { class: 'dot f-' + (groupById[id] ? groupById[id].family : 'core') }), groupLabel(id))));
