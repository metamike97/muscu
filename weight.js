// Poids de corps : saisie, courbe, historique. Un seul poids par jour (ressaisir le même jour remplace la valeur).
// Entrée : { id, t (midi local du jour de la mesure), kg, updatedAt } ; synchronisée comme le reste.

const WEIGHT_MIN = 20, WEIGHT_MAX = 400;
let weightRange = 'all';

const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const dayNoon = (str) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };

// -> null si OK, sinon le message d'erreur
function saveWeight(dateStr, kg) {
  if (kg == null || kg < WEIGHT_MIN || kg > WEIGHT_MAX) return 'Poids invalide (entre ' + WEIGHT_MIN + ' et ' + WEIGHT_MAX + ' kg)';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Date invalide';
  const t = dayNoon(dateStr);
  if (t > Date.now() + 864e5) return 'La date ne peut pas être dans le futur';
  const day = new Date(t).toDateString();
  const same = store.data.bodyweight.find((w) => new Date(w.t).toDateString() === day);
  const now = Date.now();
  if (same) { same.kg = kg; same.updatedAt = now; }
  else store.data.bodyweight.push({ id: uid(), t, kg, updatedAt: now });
  store.data.bodyweight.sort((a, b) => a.t - b.t);
  store.save();
  syncSoon();
  return null;
}

function deleteWeight(id) {
  store.data.bodyweight = store.data.bodyweight.filter((w) => w.id !== id);
  store.data.tombstones.weights[id] = Date.now();
  store.save();
  syncSoon();
}

function renderWeight(container) {
  const fmt = (v) => fmtNum(Math.round(v * 10) / 10);
  const all = [...store.data.bodyweight].sort((a, b) => a.t - b.t);
  const cut = RANGES.find((r) => r[0] === weightRange)[2];
  const hist = cut ? all.filter((w) => w.t >= Date.now() - cut) : all;

  const date = h('input', { type: 'date', value: todayStr(), max: todayStr(), 'aria-label': 'Date' });
  const kg = h('input', { type: 'text', inputMode: 'decimal', placeholder: 'Poids (kg)', autocomplete: 'off', 'aria-label': 'Poids en kg' });
  const submit = () => {
    const err = saveWeight(date.value || todayStr(), parseNum(kg.value));
    if (err) return toast(err);
    toast('Poids enregistré');
    renderWeight(container);
  };
  kg.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  let tiles = null;
  if (hist.length) {
    const last = hist[hist.length - 1], first = hist[0];
    const d = Math.round((last.kg - first.kg) * 10) / 10;
    const pct = Math.round(((last.kg - first.kg) / first.kg) * 1000) / 10;
    tiles = h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'muted small' }, 'Actuel'), h('div', { class: 'tile-v' }, fmt(last.kg) + ' kg'), h('div', { class: 'small muted' }, shortDate(last.t))),
      h('div', { class: 'tile' }, h('div', { class: 'muted small' }, 'Évolution'),
        h('div', { class: 'tile-v' }, hist.length < 2 ? '—' : d === 0 ? '= stable' : (d > 0 ? '▲ +' : '▼ −') + fmt(Math.abs(d)) + ' kg'),
        h('div', { class: 'small muted' }, hist.length < 2 ? 'une seule pesée' : (pct > 0 ? '+' : pct < 0 ? '−' : '') + fmtNum(Math.abs(pct)) + ' %')),
      h('div', { class: 'tile' }, h('div', { class: 'muted small' }, 'Pesées'), h('div', { class: 'tile-v' }, String(hist.length)), h('div', { class: 'small muted' }, cut ? 'sur la période' : 'au total')));
  }

  const host = h('div');
  setChildren(container,
    h('div', { class: 'card' },
      h('b', {}, 'Ajouter une pesée'),
      h('div', { class: 'wform' }, date, kg, h('button', { class: 'btn primary', onclick: submit }, 'Enregistrer')),
      h('p', { class: 'muted small' }, 'Une pesée par jour : ressaisir le même jour remplace la valeur.')),
    all.length === 0 && h('p', { class: 'muted' }, 'Aucune pesée pour le moment.'),
    all.length > 0 && h('div', { class: 'seg' }, RANGES.map(([k, l]) => h('button', { class: 'seg-b' + (weightRange === k ? ' on' : ''), onclick: () => { weightRange = k; renderWeight(container); } }, l))),
    all.length > 0 && hist.length === 0 && h('p', { class: 'muted' }, 'Aucune pesée sur cette période.'),
    tiles,
    hist.length > 0 && h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('b', {}, 'Poids de corps'), h('span', { class: 'muted small' }, 'dernier : ' + fmt(hist[hist.length - 1].kg) + ' kg')),
      host),
    all.length > 0 && h('details', { class: 'card tablewrap' },
      h('summary', {}, 'Historique des pesées'),
      h('table', {}, h('tbody', {}, [...all].reverse().map((w) => h('tr', {},
        h('td', {}, shortDate(w.t)), h('td', {}, fmt(w.kg) + ' kg'),
        h('td', {}, h('button', { class: 'btn sm danger', 'aria-label': 'Supprimer cette pesée', onclick: () => { if (confirm('Supprimer cette pesée ?')) { deleteWeight(w.id); renderWeight(container); } } }, '✕'))))))));

  if (hist.length) lineChart(host, {
    label: 'Poids de corps', unit: 'kg', fmtVal: fmt, minStep: 0.5,
    points: hist.map((w, i) => ({ t: w.t, v: w.kg, tip: i ? ['Écart avec la pesée précédente : ' + (w.kg - hist[i - 1].kg >= 0 ? '+' : '−') + fmt(Math.abs(w.kg - hist[i - 1].kg)) + ' kg'] : [] })),
  });
}
