// Petits outils d'interface partagés.

// h('div', {class:'x', onclick: fn}, enfant1, enfant2) -> élément DOM
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Comme el.replaceChildren(...) mais accepte tableaux, null et false
function setChildren(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

// minuscules + sans accents, pour que "epaules" trouve "Épaules"
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "57,5" -> 57.5 ; "" -> null
function parseNum(str) {
  const s = String(str).trim().replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const fmtNum = (v) => (v == null ? '' : String(v).replace('.', ','));
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) +
  ' · ' + new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h_ ? h_ + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

// Fenêtres plein écran empilables (séance, éditeur de modèle, sélecteur d'exercice…)
const overlays = [];
function overlay() {
  const el = h('div', { class: 'overlay' });
  const closers = [];
  document.body.append(el);
  overlays.push(el);
  document.body.classList.add('noscroll');
  return {
    el,
    onClose: (fn) => closers.push(fn),
    close() {
      closers.forEach((f) => f());
      el.remove();
      overlays.splice(overlays.indexOf(el), 1);
      if (!overlays.length) document.body.classList.remove('noscroll');
    },
  };
}

let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Bip de fin de repos (le son doit être "débloqué" par un tap de l'utilisateur)
let audioCtx;
function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function beep() {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!audioCtx) return;
    for (const [i, f] of [880, 1175].entries()) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.15;
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.25);
      o.stop(audioCtx.currentTime + i * 0.25 + 0.18);
    }
  } catch (e) {}
}
