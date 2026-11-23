// Vérifications rapides de la logique sans interface : node tools/check.js
// Charge les scripts de l'app dans un même contexte (comme le navigateur) et teste :
//   - cleanEdits : filtrage des modifications d'exercices reçues de la synchro ou d'un import
//   - moveExercise : déplacement dans un modèle ou une séance, sans jamais couper un groupe
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = path.join(__dirname, '..');
// fetch ne répond jamais : la bibliothèque n'est pas chargée, seules les fonctions servent
const ctx = vm.createContext({ console, fetch: () => new Promise(() => {}) });
for (const f of ['translations.js', 'store.js', 'library.js', 'customex.js', 'circuits.js']) {
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

console.log('OK : toutes les vérifications passent');
