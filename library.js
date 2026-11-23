// Bibliothèque d'exercices : chargement + écran de recherche (aussi utilisé comme sélecteur).
const PAGE = 100;

const lib = { exercises: [], byId: {}, namesFr: {}, ready: null };

const uniq = (a) => [...new Set(a)];
const trMuscle = (m) => TR.muscles[m] || m;
const trEquip = (v) => TR.equipment[v === null ? 'null' : v] || v;
const trCat = (v) => TR.category[v] || v;
// nom d'origine (traduction automatique), puis nom affiché (avec la correction éventuelle de l'utilisateur)
lib.frDefault = (id) => lib.namesFr[id] || (lib.byId[id] && lib.byId[id].name) || id;
lib.override = (id) => {
  const o = store.data && store.data.nameOverrides && store.data.nameOverrides[id];
  return o && o.name ? o.name : null;
};
lib.fr = (id) => lib.override(id) || lib.frDefault(id);
lib.en = (id) => (lib.byId[id] && !lib.byId[id].custom && lib.byId[id].name) || ''; // les exercices perso n'ont pas de nom anglais
// texte cherchable d'un exercice : noms FR (d'origine) + EN, muscles, matériel, catégorie (FR + EN)
const hayOf = (e) => norm([
  lib.namesFr[e.id] || e.name, e.name,
  ...e.primaryMuscles.map((m) => trMuscle(m) + ' ' + m),
  trEquip(e.equipment) + ' ' + (e.equipment || ''),
  trCat(e.category) + ' ' + e.category,
  e.custom ? 'perso' : '',
].join(' '));

// Exercices de la bibliothèque modifiés par l'utilisateur (store.data.exerciseEdits) : les champs modifiés remplacent
// ceux d'origine directement dans lib.byId, donc partout (recherche, filtres, carte des muscles, récupération, disques).
// L'original est gardé dans e.orig pour pouvoir le rétablir.
const EDIT_FIELDS = ['primaryMuscles', 'secondaryMuscles', 'equipment', 'category', 'level', 'force', 'mechanic'];
lib.edited = (id) => {
  const o = store.data && store.data.exerciseEdits && store.data.exerciseEdits[id];
  return !!(o && EDIT_FIELDS.some((k) => k in o));
};
lib.applyEdits = () => {
  const edits = (store.data && store.data.exerciseEdits) || {};
  for (const e of Object.values(lib.byId)) {
    if (e.custom) continue;
    if (!e.orig) e.orig = Object.fromEntries(EDIT_FIELDS.map((k) => [k, e[k]]));
    const o = edits[e.id] || {};
    for (const k of EDIT_FIELDS) e[k] = k in o ? o[k] : e.orig[k];
    e.baseHay = hayOf(e);
  }
};

// données de l'utilisateur à appliquer à la bibliothèque (au démarrage, après une synchro, un import ou une modification) :
// exercices modifiés, puis exercices perso (customex.js) en tête de liste ; les masqués restent connus (byId) pour l'historique
lib.refreshCustoms = () => {
  lib.applyEdits();
  lib.exercises = lib.exercises.filter((e) => !e.custom);
  const customs = (store.data && store.data.customExercises) || [];
  for (const c of customs) {
    const e = { ...c, custom: true };
    lib.namesFr[e.id] = e.name;
    e.baseHay = hayOf(e);
    lib.byId[e.id] = e;
  }
  lib.exercises = [...customs.filter((c) => !c.hidden).map((c) => lib.byId[c.id]), ...lib.exercises];
  lib.refreshOverrides();
};

// la recherche trouve le nom d'origine, l'anglais ET le nom corrigé
lib.refreshOverrides = () => {
  for (const e of lib.exercises) {
    const o = lib.override(e.id);
    e.haystack = e.baseHay + (o ? ' ' + norm(o) : '');
  }
};

lib.ready = (async () => {
  const [ex, fr] = await Promise.all([
    fetch('data/exercises_slim.json').then((r) => r.json()),
    fetch('data/noms_fr.json').then((r) => r.json()),
  ]);
  lib.namesFr = fr;
  lib.exercises = ex.map((e) => ({
    ...e,
    baseHay: hayOf(e),
  }));
  lib.exercises.forEach((e) => (lib.byId[e.id] = e));
  lib.refreshOverrides(); // (store.data peut ne pas être chargé : alors rien à ajouter, app.js rappellera)
})();

// Menu déroulant : "Français (english)" pour retrouver l'anglais aussi
function filterSelect(allLabel, dict, values, onchange) {
  const sel = h('select', { onchange, 'aria-label': allLabel }, h('option', { value: '' }, allLabel));
  values
    .map((v) => ({ v, label: dict[v] || v }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    .forEach(({ v, label }) => sel.append(h('option', { value: v }, v === 'null' ? label : label + ' (' + v + ')')));
  return sel;
}

// options : onPick(id) -> mode sélecteur ; title + onClose -> barre de titre
function mountLibrary(root, { onPick, title, onClose } = {}) {
  let shown = PAGE;
  const q = h('input', { type: 'search', placeholder: 'Rechercher (français ou anglais)', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, oninput: reset });
  const count = h('p', { class: 'muted' });
  const list = h('ul');
  const more = h('button', { class: 'btn wide', hidden: true, onclick: () => { shown += PAGE; render(); } }, 'Afficher plus');
  let fMuscle, fEquip, fCat;

  const head = h('div', { class: 'libhead' });
  root.replaceChildren(head, h('div', { class: 'pad' }, list, more));

  lib.ready.then(() => {
    fMuscle = filterSelect('Muscle', TR.muscles, uniq(lib.exercises.flatMap((e) => e.primaryMuscles)), reset);
    fEquip = filterSelect('Matériel', TR.equipment, uniq(lib.exercises.map((e) => (e.equipment === null ? 'null' : e.equipment))), reset);
    fCat = filterSelect('Catégorie', TR.category, uniq(lib.exercises.map((e) => e.category)), reset);
    head.append(
      title ? h('div', { class: 'row between' }, h('h1', {}, title), h('button', { class: 'btn', onclick: onClose }, 'Fermer')) : h('h1', {}, 'Exercices'),
      h('button', { class: 'btn sm newex', onclick: () => editCustomExercise(null, (id) => { if (onPick) onPick(id); reset(); }) }, '+ Créer un exercice'),
      q,
      h('div', { class: 'filters' }, fMuscle, fEquip, fCat),
      count
    );
    render();
  });

  function reset() { shown = PAGE; render(); }

  function filtered() {
    const tokens = norm(q.value).split(/\s+/).filter(Boolean);
    const muscle = fMuscle.value, equip = fEquip.value, cat = fCat.value;
    return lib.exercises.filter((e) =>
      (!muscle || e.primaryMuscles.includes(muscle)) &&
      (!equip || (e.equipment === null ? 'null' : e.equipment) === equip) &&
      (!cat || e.category === cat) &&
      tokens.every((t) => e.haystack.includes(t))
    );
  }

  function render() {
    const res = filtered();
    count.textContent = res.length + ' exercice' + (res.length > 1 ? 's' : '');
    list.replaceChildren(...res.slice(0, shown).map((e) => {
      const fr = lib.fr(e.id);
      const li = h('li', { class: onPick ? 'pick' : '' },
        h('div', { class: 'grow' },
          h('div', { class: 'fr' }, fr),
          fr !== e.name && !e.custom && h('div', { class: 'en' }, e.name),
          h('div', { class: 'tags' }, e.custom && h('span', { class: 'tag perso' }, 'Perso'), !e.custom && (lib.edited(e.id) || lib.override(e.id)) && h('span', { class: 'tag perso' }, 'Modifié'), [...e.primaryMuscles.map(trMuscle), trEquip(e.equipment)].map((t) => h('span', { class: 'tag' }, t)))
        ),
        onPick ? h('span', { class: 'plus' }, '+') : h('span', { class: 'edit', 'aria-label': 'Modifier l\'exercice' }, '✎')
      );
      if (onPick) li.addEventListener('click', () => {
        onPick(e.id);
        const p = li.querySelector('.plus');
        p.textContent = '✓';
        setTimeout(() => (p.textContent = '+'), 900);
      });
      else li.addEventListener('click', () => editExercise(e.id, render));
      return li;
    }));
    more.hidden = res.length <= shown;
  }
}

// Ouvre le sélecteur plein écran ; onPick(exId) est appelé à chaque exercice touché
function pickExercise(onPick) {
  const ov = overlay();
  mountLibrary(ov.el, { onPick, title: 'Ajouter un exercice', onClose: () => ov.close() });
}
