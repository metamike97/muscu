// Carte des muscles : silhouette de face et de dos, chaque groupe de muscles.js coloré selon une intensité.
// Dessin maison (formes simples), en SVG. Les 11 groupes sont tous visibles : face pour pectoraux, biceps, abdos,
// quadriceps ; dos pour dos, triceps, fessiers, ischios, mollets ; épaules et avant-bras des deux côtés.

const BM_E = (cx, cy, rx, ry) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>';
const BM_R = (x, y, w, hh, r) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="' + r + '"/>';
const BM_PAIR = (f, cx, ...rest) => f(cx, ...rest) + f(100 - cx, ...rest); // forme centrée en cx + son symétrique (axe x = 50)

const BM_BASE =
  '<circle cx="50" cy="15" r="10"/>' + BM_R(45, 22, 10, 10, 3) + BM_R(30, 31, 40, 66, 11) +
  BM_PAIR((cx) => BM_R(cx - 6, 34, 12, 64, 6), 23) + BM_PAIR((x) => '<circle cx="' + x + '" cy="103" r="5"/>', 23) +
  BM_R(32, 86, 36, 24, 10) + BM_PAIR((cx) => BM_R(cx - 8, 104, 16, 84, 8), 41);

// [groupe, formes] pour chaque vue
const BM_FRONT = [
  ['epaules', BM_PAIR(BM_E, 28, 40, 7, 7)],
  ['pectoraux', '<path d="M49.4 37 H37 Q32 38.5 32.6 46 Q35 53.5 49.4 53 Z M50.6 37 H63 Q68 38.5 67.4 46 Q65 53.5 50.6 53 Z"/>'],
  ['biceps', BM_PAIR(BM_E, 23, 57, 4.5, 9.5)],
  ['avantbras', BM_PAIR(BM_E, 23, 82, 4.5, 11)],
  ['abdos', BM_R(40, 56, 20, 34, 6)],
  ['quadriceps', BM_PAIR(BM_E, 41, 128, 6.5, 20)],
];
const BM_BACK = [
  ['dos', '<path d="M36 33 L64 33 L67 58 L58 86 L42 86 L33 58 Z"/>'],
  ['epaules', BM_PAIR(BM_E, 28, 40, 7, 7)],
  ['triceps', BM_PAIR(BM_E, 23, 57, 4.5, 9.5)],
  ['avantbras', BM_PAIR(BM_E, 23, 82, 4.5, 11)],
  ['fessiers', BM_PAIR(BM_E, 42, 101, 8, 8.5)],
  ['ischios', BM_PAIR(BM_E, 41, 130, 6.5, 17)],
  ['mollets', BM_PAIR(BM_E, 41, 163, 5.5, 12)],
];
// repères discrets sur les abdos (face)
const BM_ABS_LINES = '<path class="bm-line" d="M50 58 V88 M41 67 H59 M41 78 H59"/>';

// fills : { groupeId: { color, op } } (groupe absent = éteint). opts : { label, size: 'mini' | 'big' }
function bodyMap(fills, opts = {}) {
  const part = (id, shapes) => {
    const f = fills[id];
    return '<g class="bm-m"' + (f ? ' style="fill:' + f.color + ';fill-opacity:' + f.op.toFixed(2) + '"' : '') + '>' + shapes + '</g>';
  };
  const view = (ox, parts, extra) =>
    '<g transform="translate(' + ox + ' 0)"><g class="bm-base">' + BM_BASE + '</g>' + parts.map(([id, s]) => part(id, s)).join('') + (extra || '') + '</g>';
  const lit = MUSCLE_IDS.filter((id) => fills[id]);
  const wrap = h('div', {
    class: 'bodymap ' + (opts.size || 'big'), role: 'img',
    'aria-label': opts.label || (lit.length ? 'Carte des muscles : ' + groupLabels(lit) : 'Carte des muscles : aucun groupe'),
  });
  wrap.innerHTML = '<svg viewBox="0 0 210 192" aria-hidden="true">' + view(0, BM_FRONT, BM_ABS_LINES) + view(110, BM_BACK) + '</svg>' +
    (opts.size === 'mini' ? '' : '<div class="bm-cap"><span>Face</span><span>Dos</span></div>');
  return wrap;
}

// séries par groupe (muscle principal) -> intensité dans la couleur de sa famille : 1 série = pâle, 6 et plus = plein
function volumeFills(counts) {
  const out = {};
  for (const [id, n] of Object.entries(counts)) {
    if (n > 0 && groupById[id]) out[id] = { color: 'var(--f-' + groupById[id].family + ')', op: 0.3 + 0.7 * Math.min(1, n / 6) };
  }
  return out;
}
// séries par groupe d'une liste d'exercices (onlyDone : séries validées seulement ; sinon toutes les séries prévues)
function setsByGroup(exs, onlyDone) {
  const out = {};
  for (const ex of exs) {
    const n = Array.isArray(ex.sets) ? ex.sets.filter((x) => !onlyDone || x.done).length : ex.sets || 0;
    if (n) exerciseGroups(ex.exId).forEach((g) => (out[g] = (out[g] || 0) + n));
  }
  return out;
}
const sessionMap = (s, opts) => bodyMap(volumeFills(setsByGroup(s.exercises, !!s.end)), opts);
const templateMap = (t, opts) => bodyMap(volumeFills(setsByGroup(t.exercises, false)), opts);
