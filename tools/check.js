// Vérifications rapides de la logique sans interface : node tools/check.js
// Charge les scripts de l'app dans un même contexte (comme le navigateur) et teste :
//   - cleanEdits : filtrage des modifications d'exercices reçues de la synchro ou d'un import
//   - moveExercise : déplacement dans un modèle ou une séance, sans jamais couper un groupe
//   - mergeDocs : fusion de la synchro (suppressions, versions les plus récentes, champs absents d'un ancien fichier)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = path.join(__dirname, '..');
// fetch ne répond jamais : la bibliothèque n'est pas chargée, seules les fonctions servent
// sync.js touche au stockage et aux événements de la page au chargement : versions vides suffisantes ici
const noop = () => {};
const ctx = vm.createContext({
  console, fetch: () => new Promise(noop),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { addEventListener: noop }, window: { addEventListener: noop },
});
for (const f of ['translations.js', 'store.js', 'library.js', 'customex.js', 'circuits.js', 'sync.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);
const moveExercise = run('moveExercise');
// résultat recopié hors du contexte : sinon assert compare aussi les prototypes, propres à chaque contexte
const cleanEdits = (x) => JSON.parse(JSON.stringify(run('cleanEdits')(x)));

// ---------- cleanEdits ----------
const e = cleanEdits({
  ok: { primaryMuscles: ['glutes', 'nope'], secondaryMuscles: ['glutes', 'calves'], equipment: 'dumbbell', level: 'expert', force: null, updatedAt: 1 },
  bad: { primaryMuscles: [], equipment: 'laser', level: 'god', mechanic: 'magic', updatedAt: 2 },
  reset: { updatedAt: 3 },
  noDate: { equipment: 'dumbbell' },
  perso_x: { equipment: 'dumbbell', updatedAt: 4 },
  nullEquip: { equipment: null, updatedAt: 5 },
});
assert.deepEqual(e.ok, { updatedAt: 1, primaryMuscles: ['glutes'], secondaryMuscles: ['calves'], equipment: 'dumbbell', level: 'expert', force: null });
assert.deepEqual(e.bad, { updatedAt: 2 }, 'valeurs inconnues et muscle principal vide refusés');
assert.deepEqual(e.reset, { updatedAt: 3 }, 'entrée vide gardée : le rétablissement se propage');
assert.equal(e.noDate, undefined, 'sans date de modification : ignorée');
assert.equal(e.perso_x, undefined, 'un exercice perso ne passe pas par exerciseEdits');
assert.deepEqual(e.nullEquip, { updatedAt: 5, equipment: null }, 'aucun matériel est une valeur valide');
assert.deepEqual(cleanEdits(null), {});
assert.deepEqual(cleanEdits([1, 2]), {});

// ---------- moveExercise ----------
// modèle : A, [B1 B2] (superset), C
const tpl = () => ({
  exercises: [{ exId: 'A' }, { exId: 'B1', gid: 'g' }, { exId: 'B2', gid: 'g' }, { exId: 'C' }],
  groups: { g: { kind: 'superset', mode: 'classique', rounds: 3, rest: 90, work: 40, minutes: 10 } },
});
const order = (t) => t.exercises.map((x) => x.exId).join(' ');
let t;
t = tpl(); moveExercise(t, 0, 1); assert.equal(order(t), 'B1 B2 A C', 'un exercice seul enjambe tout le groupe');
t = tpl(); moveExercise(t, 3, -1); assert.equal(order(t), 'A C B1 B2', 'idem vers le haut');
t = tpl(); moveExercise(t, 2, -1); assert.equal(order(t), 'A B2 B1 C', 'à l\'intérieur du groupe : simple échange');
t = tpl(); moveExercise(t, 1, -1); assert.equal(order(t), 'B1 B2 A C', 'au bord du groupe : le groupe entier se déplace');
t = tpl(); moveExercise(t, 2, 1); assert.equal(order(t), 'A C B1 B2', 'idem vers le bas');
t = tpl(); moveExercise(t, 0, -1); assert.equal(order(t), 'A B1 B2 C', 'déjà en tête : rien ne bouge');
t = tpl(); moveExercise(t, 3, 1); assert.equal(order(t), 'A B1 B2 C', 'déjà en bas : rien ne bouge');
// deux groupes côte à côte : le premier passe après le second, sans se mélanger
t = tpl(); t.exercises[3].gid = 'h'; t.exercises.push({ exId: 'D', gid: 'h' }); t.groups.h = { ...t.groups.g };
moveExercise(t, 2, 1); assert.equal(order(t), 'A C D B1 B2', 'un groupe enjambe un autre groupe d\'un bloc');

// ---------- mergeDocs (a = cet appareil, b = dépôt distant) ----------
const merge = (a, b) => JSON.parse(JSON.stringify(run('(a, b) => mergeDocs(normDoc(a), normDoc(b))')(a, b)));
const sess = (id, end, extra) => ({ id, name: 'S', start: end - 3600e3, end, exercises: [{ exId: 'Pushups', sets: [{ kg: 0, reps: 10, done: true }] }], ...extra });
const tplt = (id, updatedAt, name) => ({ id, name, updatedAt, createdAt: 1, exercises: [{ exId: 'Pushups', sets: 3, reps: '10' }] });
let m;
// une séance supprimée ici reste supprimée, même si le dépôt l'a encore (et inversement)
m = merge({ templates: [], sessions: [], tombstones: { sessions: { s1: 100 } } }, { templates: [], sessions: [sess('s1', 50)] });
assert.deepEqual(m.sessions, [], 'séance supprimée ici : ne revient pas du dépôt');
m = merge({ templates: [], sessions: [sess('s1', 50)] }, { templates: [], sessions: [], tombstones: { sessions: { s1: 100 } } });
assert.deepEqual(m.sessions, [], 'séance supprimée ailleurs : supprimée ici aussi');
// modèle : la version la plus récente gagne, dans les deux sens
m = merge({ templates: [tplt('t1', 5, 'Ici')], sessions: [] }, { templates: [tplt('t1', 9, 'Ailleurs')], sessions: [] });
assert.equal(m.templates[0].name, 'Ailleurs');
m = merge({ templates: [tplt('t1', 9, 'Ici')], sessions: [] }, { templates: [tplt('t1', 5, 'Ailleurs')], sessions: [] });
assert.equal(m.templates[0].name, 'Ici');
// modèle supprimé puis modifié ailleurs plus tard : la modification gagne (il n'est pas perdu)
m = merge({ templates: [], sessions: [], tombstones: { templates: { t1: 5 } } }, { templates: [tplt('t1', 9, 'Modifié')], sessions: [] });
assert.equal(m.templates.length, 1, 'modification postérieure à la suppression : modèle gardé');
// note de séance modifiée après coup : la plus récente gagne
m = merge({ templates: [], sessions: [sess('s2', 50, { note: 'nouvelle', updatedAt: 80 })] }, { templates: [], sessions: [sess('s2', 50, { note: 'ancienne' })] });
assert.equal(m.sessions[0].note, 'nouvelle');
m = merge({ templates: [], sessions: [sess('s2', 50, { note: 'ancienne' })] }, { templates: [], sessions: [sess('s2', 50, { note: 'nouvelle', updatedAt: 80 })] });
assert.equal(m.sessions[0].note, 'nouvelle');
// dépôt écrit par une ancienne version de l'app (sans ces champs) : rien n'est perdu ici
m = merge({ templates: [], sessions: [], exerciseEdits: { Pushups: { equipment: 'dumbbell', updatedAt: 3 } }, customExercises: [{ id: 'perso_a', name: 'Mon exo', primaryMuscles: ['chest'], updatedAt: 2 }] },
  { templates: [], sessions: [] });
assert.equal(m.exerciseEdits.Pushups.equipment, 'dumbbell', 'exercices modifiés gardés');
assert.equal(m.customExercises.length, 1, 'exercices perso gardés');
// le texte du conseil de progression n'est pas gardé dans une séance terminée
m = merge({ templates: [], sessions: [sess('s3', 50, { exercises: [{ exId: 'Pushups', why: 'texte', sugReps: 9, sets: [{ kg: 0, reps: 10, done: true }] }] })] }, { templates: [], sessions: [] });
assert.equal('why' in m.sessions[0].exercises[0] || 'sugReps' in m.sessions[0].exercises[0], false);

console.log('OK : toutes les vérifications passent');
