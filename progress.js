// Progression par exercice : liste des exercices pratiqués + détail (indicateurs, graphiques, tableau).

const RANGES = [['all', 'Tout', null], ['12m', '1 an', 365 * DAY], ['6m', '6 mois', 182 * DAY], ['3m', '3 mois', 91 * DAY]];
const round1 = (v) => Math.round(v * 10) / 10;
const fmtInt = (v) => Math.round(v).toLocaleString('fr-FR');
const sum = (a) => a.reduce((x, y) => x + y, 0);

// Une entrée par séance terminée où l'exercice a été fait (séries validées uniquement)
function exHistory(exId) {
  return store.data.sessions
    .filter((s) => s.end)
    .sort((a, b) => a.start - b.start)
    .flatMap((s) => {
      const sets = s.exercises.filter((e) => e.exId === exId).flatMap((e) => e.sets.filter((x) => x.done));
      if (!sets.length) return [];
      const rirs = sets.filter((x) => x.rir != null).map((x) => x.rir);
      return [{
        t: s.start, sid: s.id, sets,
        maxKg: Math.max(...sets.map((x) => x.kg || 0)),
        reps: sum(sets.map((x) => x.reps || 0)),
        vol: sum(sets.map((x) => (x.kg || 0) * (x.reps || 0))),
        rir: rirs.length ? sum(rirs) / rirs.length : null,
      }];
    });
}

// ---------- liste ----------

function renderProgressList(root) {
  const q = h('input', { type: 'search', placeholder: 'Rechercher un exercice (français ou anglais)', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, oninput: render });
  const list = h('div');
  root.replaceChildren(h('div', { class: 'pad' }, h('h1', {}, 'Progrès'), q, list));

  const rows = [...new Set(store.data.sessions.filter((s) => s.end).flatMap((s) => s.exercises.map((e) => e.exId)))]
    .map((id) => ({ id, hist: exHistory(id) }))
    .filter((r) => r.hist.length)
    .map((r) => ({ ...r, last: r.hist[r.hist.length - 1], hay: norm(lib.fr(r.id) + ' ' + lib.frDefault(r.id) + ' ' + lib.en(r.id)) }))
    .sort((a, b) => b.last.t - a.last.t);

  function render() {
    const tokens = norm(q.value).split(/\s+/).filter(Boolean);
    const res = rows.filter((r) => tokens.every((t) => r.hay.includes(t)));
    setChildren(list,
      rows.length === 0 && h('p', { class: 'muted' }, 'Termine une séance pour voir ta progression ici.'),
      rows.length > 0 && res.length === 0 && h('p', { class: 'muted' }, 'Aucun exercice trouvé.'),
      res.map((r) => h('div', { class: 'card tap', onclick: () => openProgress(r.id) },
        h('div', { class: 'row between' },
          h('div', { class: 'grow' }, h('b', {}, lib.fr(r.id)), lib.fr(r.id) !== lib.en(r.id) && h('div', { class: 'en' }, lib.en(r.id))),
          h('span', { class: 'muted' }, '›')),
        h('div', { class: 'muted small' },
          r.hist.length + ' séance' + (r.hist.length > 1 ? 's' : '') + ' · dernière : ' +
          new Date(r.last.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' +
          (r.last.maxKg ? fmtNum(round1(r.last.maxKg)) + ' kg max' : r.last.reps + ' reps')))));
  }
  render();
}

// ---------- détail ----------

function openProgress(exId) {
  const ov = overlay();
  const body = h('div', { class: 'pad' });
  ov.el.append(body);
  let range = 'all';
  const all = exHistory(exId);
  const bodyweight = all.every((p) => p.maxKg === 0);

  function tile(label, value, sub, subClass) {
    return h('div', { class: 'tile' }, h('div', { class: 'muted small' }, label), h('div', { class: 'tile-v' }, value), sub && h('div', { class: 'small ' + (subClass || 'muted') }, sub));
  }

  function render() {
    const scroll = ov.el.scrollTop;
    const cut = RANGES.find((r) => r[0] === range)[2];
    const hist = cut ? all.filter((p) => p.t >= Date.now() - cut) : all;
    const key = bodyweight ? 'reps' : 'maxKg';
    const unit = bodyweight ? 'reps' : 'kg';
    const fmt = (v) => fmtNum(round1(v));

    // indicateurs
    let tiles = null;
    if (hist.length) {
      const best = hist.reduce((b, p) => (p[key] > b[key] ? p : b), hist[0]);
      const first = hist[0][key], last = hist[hist.length - 1][key];
      const d = round1(last - first), pct = first ? Math.round(((last - first) / first) * 100) : null;
      const evo = hist.length < 2 ? tile('Évolution', '—', 'une seule séance')
        : d > 0 ? tile('Évolution', '▲ +' + fmt(d) + ' ' + unit, pct != null ? '+' + pct + ' %' : '', 'up')
        : d < 0 ? tile('Évolution', '▼ −' + fmt(-d) + ' ' + unit, pct != null ? pct + ' %' : '')
        : tile('Évolution', '= stable', '');
      tiles = h('div', { class: 'tiles' },
        tile(bodyweight ? 'Meilleure séance' : 'Charge max', fmt(best[key]) + ' ' + unit, new Date(best.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })),
        tile('Séances', String(hist.length), cut ? 'sur la période' : 'au total'),
        evo);
      if (hist.length > 1) tiles.append(h('p', { class: 'muted small tiles-note' }, 'Évolution : entre la première et la dernière séance de la période.'));
    }

    const metrics = [
      { title: 'Charge max', unit: 'kg', get: (p) => p.maxKg, fmt: (v) => fmt(v), minStep: 0.5, skip: bodyweight },
      { title: 'Répétitions totales', unit: 'reps', get: (p) => p.reps, fmt: (v) => fmtInt(v), minStep: 1 },
      { title: 'Volume (kg × reps)', unit: 'kg', get: (p) => p.vol, fmt: (v) => fmtInt(v), minStep: 1, skip: bodyweight },
    ].filter((m) => !m.skip);

    const charts = metrics.map((m) => {
      const host = h('div');
      m.host = host;
      return h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', {}, m.title), hist.length && h('span', { class: 'muted small' }, 'dernier : ' + m.fmt(m.get(hist[hist.length - 1])) + ' ' + m.unit)),
        host);
    });

    setChildren(body,
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('h1', {}, lib.fr(exId)), lib.fr(exId) !== lib.en(exId) && h('div', { class: 'en' }, lib.en(exId))),
        h('button', { class: 'btn', onclick: () => ov.close() }, 'Fermer')),
      h('div', { class: 'seg' }, RANGES.map(([k, l]) => h('button', { class: 'seg-b' + (range === k ? ' on' : ''), onclick: () => { range = k; render(); } }, l))),
      hist.length === 0 && h('p', { class: 'muted' }, 'Aucune séance sur cette période.'),
      tiles,
      bodyweight && hist.length > 0 && h('p', { class: 'muted small' }, 'Exercice au poids du corps : seules les répétitions sont suivies.'),
      hist.length > 0 && charts,
      hist.length > 0 && h('details', { class: 'card tablewrap' },
        h('summary', {}, 'Voir le tableau'),
        h('table', {},
          h('thead', {}, h('tr', {}, ['Date', bodyweight ? '' : 'Charge max', 'Reps', bodyweight ? '' : 'Volume', 'RIR moy.'].filter(Boolean).map((c) => h('th', {}, c)))),
          h('tbody', {}, [...hist].reverse().map((p) => h('tr', {},
            h('td', {}, new Date(p.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })),
            !bodyweight && h('td', {}, fmt(p.maxKg) + ' kg'),
            h('td', {}, String(p.reps)),
            !bodyweight && h('td', {}, fmtInt(p.vol)),
            h('td', {}, p.rir == null ? '—' : fmtNum(round1(p.rir)))))))));

    // les graphiques se mesurent une fois dans le document
    if (hist.length) metrics.forEach((m) => lineChart(m.host, {
      label: m.title, unit: m.unit, fmtVal: m.fmt, minStep: m.minStep,
      points: hist.map((p) => ({
        t: p.t, v: m.get(p),
        tip: ['Séries : ' + p.sets.map(setText).join(' · '), p.rir != null ? 'RIR moyen : ' + fmtNum(round1(p.rir)) : null].filter(Boolean),
      })),
    }));
    ov.el.scrollTop = scroll;
  }
  render();
}
