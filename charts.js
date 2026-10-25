// Graphique en courbe (SVG pur, sans bibliothèque).
// Une seule série par graphique ; marques fines ; survol/toucher avec réticule et infobulle ;
// étiquettes seulement sur le dernier point et le maximum ; les valeurs sont aussi dans le tableau de l'écran.
const SVGNS = 'http://www.w3.org/2000/svg';
const DAY = 864e5;

function svgEl(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  kids.forEach((k) => el.append(k));
  return el;
}

// graduations "propres" (1, 2, 2.5, 5 × puissance de 10)
function niceTicks(min, max, count = 3, minStep = 0) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = Math.max(minStep, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

const fmtTickDefault = (v) => (v >= 1000 ? fmtNum(Math.round(v / 100) / 10) + ' k' : fmtNum(v));
const fmtAxisDate = (t, span) =>
  new Date(t).toLocaleDateString('fr-FR', span > 400 * DAY ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
const fmtFullDate = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// points : [{ t (ms), v (nombre), tip: [lignes de détail] }] triés par t
// minStep : plus petit écart entre deux graduations (1 pour des valeurs entières comme les répétitions)
function lineChart(host, { points, label, unit = '', fmtVal, fmtTick = fmtTickDefault, minStep = 0 }) {
  host.classList.add('chart');
  const holder = h('div', { class: 'ch-holder' });
  const tip = h('div', { class: 'ch-tip', hidden: true });
  host.replaceChildren(holder, tip);
  let lastW = 0;
  let current = -1;

  function draw() {
    const W = Math.max(260, Math.round(holder.clientWidth || 320)), H = 172;
    const M = { l: 40, r: 18, t: 18, b: 26 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const n = points.length;
    const ts = points.map((p) => p.t), vs = points.map((p) => p.v);
    const tmin = n > 1 ? ts[0] : ts[0] - 3.5 * DAY, tmax = n > 1 ? ts[n - 1] : ts[0] + 3.5 * DAY;
    const vmin = Math.min(...vs), vmax = Math.max(...vs);
    const pad = (vmax - vmin) * 0.15 || Math.abs(vmax) * 0.1 || 1;
    const ticks = niceTicks(vmin >= 0 ? Math.max(0, vmin - pad) : vmin - pad, vmax + pad, 3, minStep);
    const ymin = ticks[0], ymax = ticks[ticks.length - 1];
    const X = (t) => M.l + ((t - tmin) / (tmax - tmin)) * pw;
    const Y = (v) => M.t + (1 - (v - ymin) / (ymax - ymin)) * ph;
    const base = M.t + ph;

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ch-svg', tabindex: 0, role: 'img',
      'aria-label': `${label} : ${n} séance${n > 1 ? 's' : ''}, dernière valeur ${fmtVal(vs[n - 1])} ${unit}. Le détail est dans le tableau.` });

    // grille + axe Y
    for (const t of ticks) {
      svg.append(svgEl('line', { class: t === ymin ? 'ch-axis' : 'ch-grid', x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t) }));
      const lab = svgEl('text', { class: 'ch-tick', x: M.l - 6, y: Y(t) + 4, 'text-anchor': 'end' });
      lab.textContent = fmtTick(t);
      svg.append(lab);
    }
    // axe X : 3 ou 4 dates réparties
    const span = tmax - tmin;
    const nx = n === 1 ? 1 : W < 380 ? 3 : 4;
    for (let i = 0; i < nx; i++) {
      const t = n === 1 ? ts[0] : tmin + (span * i) / (nx - 1);
      const lab = svgEl('text', { class: 'ch-tick', x: X(t), y: H - 6, 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle' });
      lab.textContent = fmtAxisDate(t, span);
      svg.append(lab);
    }

    // courbe + aire (10 %)
    if (n > 1) {
      const d = points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(p.v).toFixed(1)).join('');
      svg.append(svgEl('path', { class: 'ch-area', d: d + `L${X(ts[n - 1]).toFixed(1)},${base}L${X(ts[0]).toFixed(1)},${base}Z` }));
      svg.append(svgEl('path', { class: 'ch-line', d }));
    }
    // marqueurs (anneau de la couleur de fond, puis point) ; si trop dense, seulement le dernier
    points.forEach((p, i) => {
      if (n > 30 && i !== n - 1) return;
      svg.append(svgEl('circle', { class: 'ch-ring', cx: X(p.t), cy: Y(p.v), r: 6 }));
      svg.append(svgEl('circle', { class: 'ch-dot', cx: X(p.t), cy: Y(p.v), r: 4 }));
    });
    // étiquettes : dernier point + maximum (s'il est assez loin)
    const iMax = vs.indexOf(vmax);
    const labelled = [n - 1];
    if (n > 2 && iMax !== n - 1 && vs[iMax] !== vs[n - 1] && Math.abs(X(ts[iMax]) - X(ts[n - 1])) > 64) labelled.push(iMax);
    for (const i of labelled) {
      const px = X(ts[i]), py = Y(vs[i]);
      const lab = svgEl('text', { class: 'ch-label', x: px > W - 56 ? px + 4 : px < M.l + 30 ? px - 4 : px,
        y: py - 11 < M.t - 4 ? py + 20 : py - 11, 'text-anchor': px > W - 56 ? 'end' : px < M.l + 30 ? 'start' : 'middle' });
      lab.textContent = fmtVal(vs[i]) + (unit ? ' ' + unit : '');
      svg.append(lab);
    }

    // réticule (suit le pointeur, s'accroche au point le plus proche en X)
    const vline = svgEl('line', { class: 'ch-cross', y1: M.t, y2: base });
    const cRing = svgEl('circle', { class: 'ch-ring', r: 8 });
    const cDot = svgEl('circle', { class: 'ch-dot', r: 5 });
    const cross = svgEl('g', { visibility: 'hidden' }, vline, cRing, cDot);
    svg.append(cross);

    function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; current = -1; }
    function show(i) {
      current = i;
      const p = points[i], px = X(p.t), py = Y(p.v);
      vline.setAttribute('x1', px); vline.setAttribute('x2', px);
      for (const c of [cRing, cDot]) { c.setAttribute('cx', px); c.setAttribute('cy', py); }
      cross.setAttribute('visibility', 'visible');
      setChildren(tip,
        h('div', { class: 'ch-tip-date' }, fmtFullDate(p.t)),
        h('div', { class: 'ch-tip-val' }, h('span', { class: 'ch-key' }), h('b', {}, fmtVal(p.v) + (unit ? ' ' + unit : ''))),
        (p.tip || []).map((line) => h('div', { class: 'ch-tip-more' }, line)));
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      // à côté du réticule (jamais dessus) : à gauche si le point est dans la moitié droite, sinon à droite
      tip.style.left = Math.max(0, Math.min(W - tw, px > W / 2 ? px - tw - 12 : px + 12)) + 'px';
      tip.style.top = Math.max(0, Math.min(H - th, py - th / 2)) + 'px';
    }
    function nearest(e) {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) * (W / r.width);
      let best = 0, bd = Infinity;
      points.forEach((p, i) => { const dd = Math.abs(X(p.t) - x); if (dd < bd) { bd = dd; best = i; } });
      return best;
    }
    // zone de capture = tout le tracé (bien plus grande que les points)
    const hit = svgEl('rect', { class: 'ch-hit', x: M.l - 6, y: 0, width: pw + 12, height: H });
    hit.addEventListener('pointermove', (e) => show(nearest(e)));
    hit.addEventListener('pointerdown', (e) => show(nearest(e)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.append(hit);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { show(Math.max(0, (current < 0 ? n : current) - 1)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { show(Math.min(n - 1, current + 1)); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    svg.addEventListener('blur', hide);

    holder.replaceChildren(svg);
    tip.hidden = true;
  }

  draw();
  lastW = holder.clientWidth;
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const w = holder.clientWidth;
      if (w && Math.abs(w - lastW) > 1) { lastW = w; draw(); }
    }).observe(holder);
  }
}
