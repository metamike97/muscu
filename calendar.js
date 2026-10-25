// Calendrier : séances passées par jour avec leurs groupes musculaires, puis aide à l'organisation
// (suggestion de prochaine séance, récupération par groupe, séries par semaine).
//
// Lecture des pastilles : chaque case jour a 4 emplacements fixes (2 × 2) — Poussée (haut gauche), Traction (haut droite),
// Jambes (bas gauche), Abdos (bas droit). Une famille travaillée allume son emplacement : l'identité passe donc par la
// POSITION autant que par la couleur (lisible même sans distinguer les couleurs).

let calMonth = null;     // { y, m } mois affiché
let calSelected = null;  // 'AAAA-MM-JJ'

const p2 = (n) => String(n).padStart(2, '0');
const dayKeyOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
// numéro de jour (insensible à l'heure d'été : on passe par UTC)
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const finishedSessions = () => store.data.sessions.filter((s) => s.end);

// Par groupe : dernier jour travaillé (numéro de jour) et séries validées sur les 7 derniers jours.
// Basé sur les exercices RÉELLEMENT faits (muscle principal), pas sur les groupes déclarés.
function groupStats() {
  const today = dayNum(dayKeyOf(Date.now()));
  const stats = Object.fromEntries(MUSCLE_IDS.map((id) => [id, { last: null, sets7: 0 }]));
  for (const s of finishedSessions()) {
    const dn = dayNum(dayKeyOf(s.start));
    for (const ex of s.exercises) {
      const n = ex.sets.filter((x) => x.done).length;
      if (!n) continue;
      for (const g of exerciseGroups(ex.exId)) {
        const st = stats[g];
        if (st.last === null || dn > st.last) st.last = dn;
        if (today - dn >= 0 && today - dn < 7) st.sets7 += n;
      }
    }
  }
  for (const id of MUSCLE_IDS) stats[id].days = stats[id].last === null ? null : today - stats[id].last;
  return stats;
}

function recoveryStatus(days) {
  if (days === null) return { icon: '·', label: 'Pas encore travaillé' };
  if (days <= 1) return { icon: '⏳', label: 'En récupération' };
  if (days <= 3) return { icon: '✓', label: 'Prêt' };
  return { icon: '↑', label: 'À travailler' };
}
const daysText = (d) => (d === null ? '—' : d === 0 ? "aujourd'hui" : d === 1 ? 'hier' : 'il y a ' + d + ' j');

// priorité d'un groupe : plus il est resté au repos, plus il est prioritaire ; en récupération = 0 ; jamais travaillé = moyen
const groupPriority = (days) => (days === null ? 5 : days < 2 ? 0 : Math.min(days, 14));

function renderCalendar(root) {
  const now = new Date();
  if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
  const todayKey = dayKeyOf(Date.now());
  const sessions = finishedSessions();

  const byDay = new Map();
  for (const s of sessions) {
    const k = dayKeyOf(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }

  // --- navigation du mois
  const monthName = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const go = (delta) => { const d = new Date(calMonth.y, calMonth.m + delta, 1); calMonth = { y: d.getFullYear(), m: d.getMonth() }; calSelected = null; renderCalendar(root); };
  const nav = h('div', { class: 'row between cal-nav' },
    h('button', { class: 'btn', 'aria-label': 'Mois précédent', onclick: () => go(-1) }, '‹'),
    h('b', { class: 'cal-title' }, monthName.charAt(0).toUpperCase() + monthName.slice(1)),
    h('button', { class: 'btn', 'aria-label': 'Mois suivant', onclick: () => go(1) }, '›'));

  // --- grille (semaine du lundi au dimanche)
  const offset = (new Date(calMonth.y, calMonth.m, 1).getDay() + 6) % 7;
  const dim = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h('div', { class: 'cal-empty' }));
  for (let d = 1; d <= dim; d++) {
    const key = calMonth.y + '-' + p2(calMonth.m + 1) + '-' + p2(d);
    const list = byDay.get(key) || [];
    const fams = familiesOf([...new Set(list.flatMap(sessionMuscles))]);
    const names = list.length ? ' : ' + [...new Set(list.flatMap(sessionMuscles))].map(groupLabel).join(', ') : '';
    cells.push(h('button', {
      class: 'cal-day' + (key === todayKey ? ' today' : '') + (key === calSelected ? ' sel' : ''),
      'aria-label': d + ' ' + monthName + (list.length ? ', ' + list.length + ' séance' + (list.length > 1 ? 's' : '') + names : ', pas de séance'),
      'aria-pressed': String(key === calSelected),
      onclick: () => { calSelected = key === calSelected ? null : key; renderCalendar(root); },
    }, h('span', { class: 'cal-n' }, d),
      h('span', { class: 'cal-dots' }, MUSCLE_FAMILIES.map((f) => h('span', { class: 'cd' + (fams.includes(f.id) ? ' on f-' + f.id : '') })))));
  }
  const grid = h('div', { class: 'cal-grid' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l) => h('div', { class: 'cal-wd' }, l)), cells);

  const legend = h('div', { class: 'cal-legend muted small' },
    MUSCLE_FAMILIES.map((f, i) => h('span', {}, h('span', { class: 'dot f-' + f.id }), ' ' + f.label)),
    h('div', {}, "Chaque famille a sa place dans la case : poussée en haut à gauche, traction en haut à droite, jambes en bas à gauche, abdos en bas à droite."));

  // --- détail du jour
  let detail = h('p', { class: 'muted small' }, 'Touche un jour pour voir ses séances.');
  if (calSelected) {
    const list = byDay.get(calSelected) || [];
    const label = new Date(dayNum(calSelected) * 864e5 + 12 * 36e5).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    detail = h('div', {},
      h('h2', {}, label.charAt(0).toUpperCase() + label.slice(1)),
      list.length === 0 && h('p', { class: 'muted' }, 'Aucune séance ce jour-là.'),
      list.sort((a, b) => a.start - b.start).map((s) => h('div', { class: 'card tap', onclick: () => viewSession(s.id) },
        h('div', { class: 'row between' }, h('b', {}, s.name), h('span', { class: 'muted' }, new Date(s.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))),
        muscleTags(sessionMuscles(s)),
        h('div', { class: 'muted small' }, s.exercises.length + ' exercice' + (s.exercises.length > 1 ? 's' : '') + ' · ' + Math.round(volume(s)) + ' kg de volume'))));
  }

  const stats = groupStats();

  root.replaceChildren(h('div', { class: 'pad' },
    h('h1', {}, 'Calendrier'),
    nav, grid, legend, detail,
    suggestionCard(stats, sessions.length),
    recoveryCard(stats),
    weeklyCard(stats)));
}

// ---------- prochaine séance suggérée ----------

function suggestionCard(stats, nSessions) {
  const active = !!store.data.activeId;
  const card = h('div', { class: 'card' }, h('b', {}, 'Prochaine séance suggérée'));
  if (!nSessions) { card.append(h('p', { class: 'muted' }, 'Termine ta première séance pour recevoir des suggestions.')); return card; }

  const prio = MUSCLE_IDS.map((id) => ({ id, days: stats[id].days, score: groupPriority(stats[id].days) }))
    .filter((g) => g.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!prio.length) { card.append(h('p', { class: 'muted' }, 'Tout est en récupération : repose-toi, ou travaille ce que tu veux.')); return card; }

  card.append(
    h('p', { class: 'muted small' }, 'À travailler en priorité (les plus longtemps au repos) :'),
    h('div', { class: 'tags' }, prio.map((g) => h('span', { class: 'tag' }, h('span', { class: 'dot f-' + groupById[g.id].family }), groupLabel(g.id) + ' · ' + daysText(g.days)))));

  // modèle qui correspond le mieux : moyenne des priorités de ses groupes
  const best = store.data.templates
    .map((t) => { const gs = templateGroups(t); return { t, gs, score: gs.length ? gs.reduce((a, id) => a + groupPriority(stats[id].days), 0) / gs.length : 0 }; })
    .filter((x) => x.score >= 2).sort((a, b) => b.score - a.score)[0];
  if (best) card.append(h('p', {}, 'Modèle conseillé : ', h('b', {}, best.t.name), h('span', { class: 'muted small' }, '  (' + groupLabels(best.gs) + ')')));

  if (active) card.append(h('p', { class: 'muted small' }, 'Termine ou abandonne la séance en cours pour en démarrer une autre.'));
  else card.append(
    best && h('button', { class: 'btn primary wide', onclick: () => startSession(fromTemplate(best.t)) }, 'Démarrer « ' + best.t.name + ' »'),
    h('button', { class: 'btn wide', onclick: () => startSession({ name: 'Séance libre', templateId: null, muscles: prio.map((g) => g.id), exercises: [] }) }, 'Séance libre sur ces groupes'));
  return card;
}

// ---------- récupération par groupe ----------

function recoveryCard(stats) {
  const rows = MUSCLE_IDS.map((id) => ({ id, days: stats[id].days }))
    .sort((a, b) => (b.days === null ? -1 : b.days) - (a.days === null ? -1 : a.days)); // les plus délaissés d'abord, jamais travaillés en dernier
  const never = rows.filter((r) => r.days === null), done = rows.filter((r) => r.days !== null);
  return h('div', { class: 'card' },
    h('b', {}, 'Récupération par groupe'),
    h('p', { class: 'muted small' }, 'Calculé d\'après les exercices réellement faits. ⏳ 0-1 jour · ✓ 2-3 jours · ↑ 4 jours et plus.'),
    [...done, ...never].map(({ id, days }) => {
      const st = recoveryStatus(days);
      return h('div', { class: 'histset' },
        h('span', {}, h('span', { class: 'dot f-' + groupById[id].family }), ' ' + groupLabel(id)),
        h('span', {}, h('span', { class: 'muted small' }, daysText(days) + '  '), st.icon + ' ' + st.label));
    }));
}

// ---------- séries par semaine ----------

const WEEK_SCALE = 20; // la barre est pleine à 20 séries
function weeklyCard(stats) {
  const rows = MUSCLE_GROUPS.map((g) => ({ g, n: stats[g.id].sets7 }));
  return h('div', { class: 'card' },
    h('b', {}, 'Séries sur les 7 derniers jours'),
    h('p', { class: 'muted small' }, 'Zone grisée : repère courant de 10 à 20 séries par groupe et par semaine (indicatif, à adapter à ton niveau).'),
    rows.map(({ g, n }) => h('div', { class: 'wk' },
      h('span', { class: 'wk-l' }, g.label),
      h('div', { class: 'wk-bar', role: 'img', 'aria-label': g.label + ' : ' + n + ' séries' }, h('div', { class: 'wk-band' }), h('div', { class: 'wk-fill', style: 'width:' + Math.min(100, (n / WEEK_SCALE) * 100) + '%' })),
      h('b', { class: 'wk-n' }, String(n)))));
}
