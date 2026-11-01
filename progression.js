// Progression automatique : charge et reps conseillées pour la prochaine séance, d'après l'historique.
// Règle choisie par exercice dans le modèle (champ `prog`) :
//   'auto' (défaut) : double progression si les reps visées sont une fourchette ("8-12"), linéaire sinon ("5")
//   'double'   : même charge jusqu'à faire le haut de la fourchette à toutes les séries, puis + palier (retour au bas)
//   'lineaire' : + palier dès que toutes les séries atteignent les reps visées
//   'aucune'   : pas de conseil (la charge du modèle reste fixe, comme avant)
// Stagnation : STALL_MAX séances de suite à la même charge sans réussir -> décharge de 10 %.
// Poids du corps (0 kg) : on progresse en reps.
// La règle l'emporte sur la charge du modèle, qui ne sert que de point de départ sans historique.
// Le palier (champ `inc`, en kg) vaut par défaut celui du matériel (voir loadStep).

const PROG_RULES = [['auto', 'Auto'], ['double', 'Double'], ['lineaire', 'Linéaire'], ['aucune', 'Aucune']];
const STALL_MAX = 3;
const DELOAD = 0.9;

// "8-12", "8 à 12", "8" -> { lo, hi } ; rien d'exploitable -> null
function parseReps(str) {
  const m = String(str || '').match(/(\d+)\s*(?:(?:-|–|à|a)\s*(\d+))?/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return a > 0 ? { lo: Math.min(a, b), hi: Math.max(a, b) } : null;
}

// séances terminées où l'exercice a été fait, de la plus récente à la plus ancienne :
// { kg: charge de travail (la plus lourde), reps: reps des séries à cette charge }
function workHistory(exId) {
  return store.data.sessions
    .filter((s) => s.end)
    .sort((a, b) => b.start - a.start)
    .flatMap((s) => {
      const sets = s.exercises.filter((e) => e.exId === exId).flatMap((e) => e.sets.filter((x) => x.done));
      if (!sets.length) return [];
      const kg = Math.max(...sets.map((x) => x.kg || 0));
      return [{ kg, reps: sets.filter((x) => (x.kg || 0) === kg).map((x) => x.reps || 0) }];
    });
}

const roundTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const kgText = (v) => fmtNum(Math.round(v * 100) / 100) + ' kg';

// rule : { prog, inc } (champs du modèle, éventuellement absents) ; targetReps : texte des reps visées ; startKg : charge du modèle
// -> { kg, reps, why } ou null (pas de conseil)
function suggestNext(exId, targetReps, rule, startKg) {
  const prog = (rule && rule.prog) || 'auto';
  if (prog === 'aucune') return null;
  const range = parseReps(targetReps);
  if (!range) return null;
  const double = prog === 'double' || (prog === 'auto' && range.hi > range.lo);
  const goal = double ? range.hi : range.lo;
  const inc = rule && rule.inc > 0 ? rule.inc : loadStep(exId);

  const hist = workHistory(exId);
  if (!hist.length) {
    return startKg != null
      ? { kg: startKg, reps: range.lo, why: 'Première fois : charge du modèle.' }
      : { kg: null, reps: range.lo, why: 'Première fois : choisis une charge où tu finis ' + range.lo + ' reps proprement.' };
  }
  const last = hist[0];
  const ok = (w) => w.reps.length > 0 && w.reps.every((r) => r >= goal);

  if (last.kg === 0) {
    const best = Math.max(...last.reps);
    return { kg: 0, reps: best + 1, why: 'Poids du corps : vise ' + (best + 1) + ' reps, 1 de plus que ton meilleur de la dernière fois.' };
  }
  if (ok(last)) {
    return { kg: roundTo(last.kg + inc, inc), reps: range.lo, why: goal + ' reps à toutes les séries la dernière fois : +' + kgText(inc) + '.' };
  }
  // séances de suite à cette charge sans réussite
  let stalls = 0;
  for (const w of hist) { if (w.kg !== last.kg || ok(w)) break; stalls++; }
  if (stalls >= STALL_MAX) {
    const kg = Math.max(0, roundTo(last.kg * DELOAD, inc));
    return { kg, reps: range.lo, why: 'Bloqué ' + stalls + ' séances à ' + kgText(last.kg) + ' : décharge de 10 % pour repartir.' };
  }
  if (double) {
    const reps = Math.min(range.hi, Math.min(...last.reps) + 1);
    return { kg: last.kg, reps, why: 'Même charge : 1 rep de plus, jusqu\'à ' + range.hi + ' partout avant d\'augmenter.' };
  }
  const hit = last.reps.filter((r) => r >= goal).length;
  return { kg: last.kg, reps: range.lo, why: hit + '/' + last.reps.length + ' séries à ' + goal + ' reps la dernière fois : on garde ' + kgText(last.kg) + '.' };
}
