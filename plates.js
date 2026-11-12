// Matériel, disques et échauffement.
// Le matériel (poids des barres, disques possédés) est un réglage propre à CET appareil : ni synchronisé ni exporté.
//   store.data.gear = { bar, ez, plates:[kg…], warmup } (disques en paires, nombre illimité ;
//   warmup : nombre de séries d'échauffement par défaut, 0 = automatique selon la charge)

const PLATES_ALL = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const GEAR_DEFAULT = { bar: 20, ez: 10, plates: [25, 20, 15, 10, 5, 2.5, 1.25], warmup: 0 };
const WARMUP_MAX = 6;

function cleanGear(g) {
  const ok = (v, lo, hi, def) => (Number.isFinite(v) && v >= lo && v <= hi ? v : def);
  g = g && typeof g === 'object' ? g : {};
  const plates = Array.isArray(g.plates) ? PLATES_ALL.filter((p) => g.plates.includes(p)) : GEAR_DEFAULT.plates;
  return {
    bar: ok(g.bar, 0, 50, GEAR_DEFAULT.bar), ez: ok(g.ez, 0, 50, GEAR_DEFAULT.ez), plates: plates.length ? plates : GEAR_DEFAULT.plates,
    warmup: Number.isInteger(g.warmup) ? ok(g.warmup, 0, WARMUP_MAX, 0) : 0,
  };
}

const equipOf = (exId) => (lib.byId[exId] && lib.byId[exId].equipment) || null;
// poids de la barre si l'exercice se fait à la barre, sinon null
function barOf(exId) {
  const eq = equipOf(exId), g = store.data.gear;
  return eq === 'barbell' ? g.bar : eq === 'e-z curl bar' ? g.ez : null;
}
// plus petit écart de charge réalisable : une paire du plus petit disque à la barre, sinon un pas courant du matériel
function loadStep(exId) {
  if (barOf(exId) != null) return 2 * Math.min(...store.data.gear.plates);
  const eq = equipOf(exId);
  return eq === 'body only' ? 0 : eq === 'dumbbell' ? 2 : eq === 'kettlebells' ? 4 : 2.5;
}

// disques d'UN côté pour atteindre total (plus gros d'abord) -> { side:[…], kg: charge réellement obtenue } ou null
function plateSplit(total, bar) {
  if (total == null || bar == null || total < bar) return null;
  let rest = (total - bar) / 2;
  const side = [];
  for (const p of store.data.gear.plates) {
    while (rest >= p - 1e-9) { side.push(p); rest -= p; }
  }
  return { side, kg: bar + 2 * side.reduce((a, b) => a + b, 0) };
}
// "Barre 20 kg + 20 · 10 · 1,25 par côté"
function plateText(total, exId) {
  const bar = barOf(exId);
  const sp = plateSplit(total, bar);
  if (!sp) return '';
  const head = 'Barre ' + fmtNum(bar) + ' kg';
  const body = sp.side.length ? head + ' + ' + sp.side.map(fmtNum).join(' · ') + ' par côté' : head + ' seule';
  return Math.abs(sp.kg - total) > 1e-6 ? body + ' (≈ ' + fmtNum(sp.kg) + ' kg)' : body;
}

// Nombre de séries d'échauffement cohérent avec la charge de travail (réglage « Auto ») :
// plus la charge est lourde, plus la montée est longue. Les haltères se comptent par main.
function autoWarmCount(work, exId) {
  const eq = equipOf(exId);
  const steps = eq === 'dumbbell' || eq === 'kettlebells' ? [12, 25] : barOf(exId) != null ? [40, 70, 110, 150] : [40, 80];
  return 1 + steps.filter((t) => work >= t).length;
}
const warmLabel = (n) => (n ? n + ' série' + (n > 1 ? 's' : '') : 'Auto');

// Séries d'échauffement pour une charge de travail : n séries (0 ou absent = automatique), montée de ~40 à ~85 %,
// répétitions décroissantes de 8 à 3. À la barre (dès 3 séries) : barre seule d'abord. Les charges en double sont fusionnées,
// donc une charge légère donne moins de séries que demandé. Rien pour le poids du corps.
function warmupSets(work, exId, n) {
  if (!(work > 0)) return [];
  n = n > 0 ? n : autoWarmCount(work, exId);
  const bar = barOf(exId), step = loadStep(exId) || 1;
  const withBar = bar != null && n >= 3;
  const k = withBar ? n - 1 : n; // séries en pourcentage
  const pcts = k === 1 ? [0.6] : Array.from({ length: k }, (_, i) => 0.4 + (0.45 * i) / (k - 1));
  const reps = (i) => (k === 1 ? 5 : Math.round(8 - (5 * i) / (k - 1))); // de 8 à 3 reps
  const scheme = (withBar ? [[0, 10]] : []).concat(pcts.map((p, i) => [p, reps(i)]));
  const out = [];
  for (const [pct, reps] of scheme) {
    const kg = pct === 0 ? bar : Math.max(bar || 0, Math.round((work * pct) / step) * step);
    if (kg <= 0 || kg >= work || (out.length && kg <= out[out.length - 1].kg)) continue;
    out.push({ kg, reps, done: false });
  }
  return out;
}

// Réglages : carte « Échauffement » (nombre de séries par défaut)
function warmupCard() {
  const g = store.data.gear;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Séries d\'échauffement par défaut' });
  const draw = () => setChildren(chips, Array.from({ length: WARMUP_MAX + 1 }, (_, n) => h('button', {
    type: 'button', class: 'chip' + (g.warmup === n ? ' on' : ''), 'aria-pressed': String(g.warmup === n),
    onclick: () => { g.warmup = n; store.save(); draw(); },
  }, n ? String(n) : 'Auto')));
  draw();
  return h('div', { class: 'card' },
    h('b', {}, 'Séries d\'échauffement par défaut'),
    chips,
    h('p', { class: 'muted small' }, 'Auto : selon la charge visée (1 série pour une charge légère, jusqu\'à 5 pour un squat lourd). Modifiable aussi pendant la séance. Réglage propre à cet appareil.'));
}

// Réglages : carte « Matériel »
function gearCard() {
  const g = store.data.gear;
  const barInput = (key) => h('input', { type: 'text', inputMode: 'decimal', value: fmtNum(g[key]), oninput: (e) => { const v = parseNum(e.target.value); if (v != null && v >= 0 && v <= 50) { g[key] = v; store.save(); } } });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Disques disponibles' });
  const draw = () => setChildren(chips, PLATES_ALL.map((p) => h('button', {
    type: 'button', class: 'chip' + (g.plates.includes(p) ? ' on' : ''), 'aria-pressed': String(g.plates.includes(p)),
    onclick: () => {
      const next = g.plates.includes(p) ? g.plates.filter((x) => x !== p) : PLATES_ALL.filter((x) => x === p || g.plates.includes(x));
      if (!next.length) return toast('Garde au moins un disque');
      g.plates = next; store.save(); draw();
    },
  }, fmtNum(p) + ' kg')));
  draw();
  return h('div', { class: 'card' },
    h('div', { class: 'wform' },
      h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Barre droite (kg)'), barInput('bar')),
      h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Barre EZ (kg)'), barInput('ez'))),
    h('p', { class: 'muted small' }, 'Disques disponibles (par paires) :'),
    chips,
    h('p', { class: 'muted small' }, 'Sert au calcul des disques, au palier de progression à la barre et à l\'échauffement. Réglage propre à cet appareil (ni synchronisé ni exporté).'));
}
