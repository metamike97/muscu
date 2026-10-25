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
lib.en = (id) => (lib.byId[id] && lib.byId[id].name) || '';
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
    // tout ce qui est cherchable : noms FR (d'origine) + EN, muscles, matériel, catégorie (FR + EN)
    baseHay: norm([
      lib.namesFr[e.id] || e.name, e.name,
      ...e.primaryMuscles.map((m) => trMuscle(m) + ' ' + m),
      trEquip(e.equipment) + ' ' + (e.equipment || ''),
      trCat(e.category) + ' ' + e.category,
    ].join(' ')),
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
      title && h('div', { class: 'row between' }, h('h1', {}, title), h('button', { class: 'btn', onclick: onClose }, 'Fermer')),
      !title && h('h1', {}, 'Exercices'),
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
          fr !== e.name && h('div', { class: 'en' }, e.name),
          h('div', { class: 'tags' }, [...e.primaryMuscles.map(trMuscle), trEquip(e.equipment)].map((t) => h('span', { class: 'tag' }, t)))
        ),
        onPick ? h('span', { class: 'plus' }, '+') : h('span', { class: 'edit', 'aria-label': 'Corriger le nom' }, '✎')
      );
      if (onPick) li.addEventListener('click', () => {
        onPick(e.id);
        const p = li.querySelector('.plus');
        p.textContent = '✓';
        setTimeout(() => (p.textContent = '+'), 900);
      });
      else li.addEventListener('click', () => editExerciseName(e.id, render));
      return li;
    }));
    more.hidden = res.length <= shown;
  }
}

// Corriger le nom français d'un exercice (synchronisé entre appareils). onDone() est appelé après enregistrement.
function editExerciseName(exId, onDone) {
  const ov = overlay();
  const original = lib.frDefault(exId);
  const hasOverride = !!lib.override(exId);
  const input = h('input', { type: 'text', value: lib.fr(exId), maxLength: 80, autocomplete: 'off', spellcheck: true });

  function commit(name) {
    // un nom vide ou identique à l'original = "rétabli" (on garde une entrée vide pour que ça se propage)
    const reset = !name || name === original;
    store.data.nameOverrides[exId] = { name: reset ? '' : name, updatedAt: Date.now() };
    store.save();
    lib.refreshOverrides();
    ov.close();
    if (onDone) onDone();
    refreshView();
    syncSoon();
    toast(reset ? "Nom d'origine rétabli" : 'Nom enregistré');
  }

  ov.el.append(h('div', { class: 'pad' },
    h('div', { class: 'row between' }, h('h1', {}, 'Corriger le nom'), h('button', { class: 'btn', onclick: () => ov.close() }, 'Annuler')),
    h('p', { class: 'en' }, lib.en(exId)),
    h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Nom affiché'), input),
    h('p', { class: 'muted' }, "Nom d'origine : " + original),
    h('button', { class: 'btn primary wide', onclick: () => commit(input.value.trim()) }, 'Enregistrer'),
    hasOverride && h('button', { class: 'btn wide', onclick: () => commit('') }, "Rétablir le nom d'origine"),
    h('p', { class: 'muted' }, "Le nom anglais et le nom d'origine restent utilisables dans la recherche.")));
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(input.value.trim()); });
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// Ouvre le sélecteur plein écran ; onPick(exId) est appelé à chaque exercice touché
function pickExercise(onPick) {
  const ov = overlay();
  mountLibrary(ov.el, { onPick, title: 'Ajouter un exercice', onClose: () => ov.close() });
}
