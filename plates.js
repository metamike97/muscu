// Matériel, disques et échauffement.
// Le matériel (poids des barres, disques possédés) est un réglage propre à CET appareil : ni synchronisé ni exporté.
//   store.data.gear = { bar, ez, plates:[kg…] } (disques en paires, nombre illimité)

const PLATES_ALL = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const GEAR_DEFAULT = { bar: 20, ez: 10, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };

function cleanGear(g) {
  const ok = (v, lo, hi, def) => (Number.isFinite(v) && v >= lo && v <= hi ? v : def);
  g = g && typeof g === 'object' ? g : {};
  const plates = Array.isArray(g.plates) ? PLATES_ALL.filter((p) => g.plates.includes(p)) : GEAR_DEFAULT.plates;
  return { bar: ok(g.bar, 0, 50, GEAR_DEFAULT.bar), ez: ok(g.ez, 0, 50, GEAR_DEFAULT.ez), plates: plates.length ? plates : GEAR_DEFAULT.plates };
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

// Séries d'échauffement pour une charge de travail : montée progressive, la dernière vers 80 %.
// À la barre : barre seule d'abord. Rien pour le poids du corps ou les charges trop légères.
function warmupSets(work, exId) {
  if (!(work > 0)) return [];
  const bar = barOf(exId), step = loadStep(exId) || 1;
  const scheme = bar != null ? [[0, 10], [0.4, 8], [0.6, 5], [0.8, 3]] : [[0.5, 8], [0.75, 4]];
  const out = [];
  for (const [pct, reps] of scheme) {
    const kg = pct === 0 ? bar : Math.max(bar || 0, Math.round((work * pct) / step) * step);
    if (kg <= 0 || kg >= work || (out.length && kg <= out[out.length - 1].kg)) continue;
    out.push({ kg, reps, done: false });
  }
  return out;
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
