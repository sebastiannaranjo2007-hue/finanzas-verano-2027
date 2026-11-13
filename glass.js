/* Liquid Glass para NYC (ver glass.css).
   - Botones: la luz nace donde pones el dedo y el botón crece y rebota.
   - Barra inferior: la lente se desliza con resorte y se estira al cambiar de pestaña;
     si la arrastras con el dedo crece como una lupa y al soltar se acomoda en la pestaña más cercana.
   - Al bajar por la página la barra se encoge; al subir vuelve. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- luz desde el dedo ----------
  const PRESS = '.glass, .keypad button, .cur, .chip, .btn, .x, .add-btn, .tabs a, .seg-tipo, .seg-sm label';
  let lit = null, litAt = 0;
  const unlight = () => {
    if (!lit) return;
    const t = lit; lit = null;
    // un toque rápido igual alcanza a verse
    setTimeout(() => { if (t !== lit) t.classList.remove('lit'); }, Math.max(0, 110 - (Date.now() - litAt)));
  };
  document.addEventListener('pointerdown', (e) => {
    const q = e.target.closest('.quick a');
    const t = q ? $('.q-ic', q) : e.target.closest(PRESS);
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--px', (e.clientX - r.left) + 'px');
    t.style.setProperty('--py', (e.clientY - r.top) + 'px');
    if (lit && lit !== t) lit.classList.remove('lit');
    lit = t; litAt = Date.now(); t.classList.add('lit');
  }, {passive: true});
  ['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, unlight, {passive: true}));
  // la luz sigue al dedo mientras lo mueves dentro del mismo elemento
  window.addEventListener('pointermove', (e) => {
    if (!lit) return;
    const r = lit.getBoundingClientRect();
    lit.style.setProperty('--px', (e.clientX - r.left) + 'px');
    lit.style.setProperty('--py', (e.clientY - r.top) + 'px');
  }, {passive: true});

  // ---------- interruptores que se estiran ----------
  const morph = (el) => { if (!el || calm.matches) return; el.classList.remove('morph'); void el.offsetWidth; el.classList.add('morph'); };
  document.addEventListener('animationend', (e) => { if (e.animationName === 'thumb-stretch') e.target.classList.remove('morph'); });
  document.addEventListener('change', (e) => { if (e.target.matches('.seg-tipo input')) morph(e.target.closest('.seg-tipo')); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.cur [data-cur]');
    if (b && b.getAttribute('aria-pressed') !== 'true') morph(b.closest('.cur'));
  }, true);

  // ---------- barra inferior ----------
  const bar = $('#tabbar'); if (!bar) return;
  const nav = bar.closest('.bottomnav'), track = $('.lens-track', bar);
  const tabs = [...bar.querySelectorAll('a[data-tab]')];
  // copia de las pestañas dentro de la lente: se ve en lima y se agranda con ella
  tabs.forEach((a) => { const s = document.createElement('span'); s.className = 'lt'; s.innerHTML = a.innerHTML; track.appendChild(s); });

  let tw = 0, idx = -1, drag = null, swallow = false;
  const setX = (x) => bar.style.setProperty('--lx', x + 'px');
  const getX = () => parseFloat(bar.style.getPropertyValue('--lx')) || 0;
  const instant = (fn) => { bar.classList.add('instant'); fn(); void bar.offsetWidth; bar.classList.remove('instant'); };
  const measure = () => {
    const w = (bar.clientWidth - 8) / tabs.length; if (!w) return;
    const changed = tw && Math.abs(w - tw) > .5; tw = w;
    bar.style.setProperty('--tw', tw + 'px');
    if (idx >= 0 && !drag) (changed ? setX : (x) => instant(() => setX(x)))(idx * tw);
  };
  new ResizeObserver(measure).observe(bar); measure();

  const stretch = () => {
    if (calm.matches) return;
    bar.classList.remove('moving'); void bar.offsetWidth; bar.classList.add('moving');
  };
  bar.addEventListener('animationend', (e) => { if (e.animationName === 'lens-stretch') bar.classList.remove('moving'); });

  function sync() {
    const i = tabs.findIndex((a) => a.hasAttribute('aria-current'));
    if (drag) return;
    bar.classList.toggle('nolens', i < 0);
    if (i < 0) { idx = -1; return; }
    if (i === idx) { setX(i * tw); return; }
    if (idx < 0) instant(() => setX(i * tw));
    else { setX(i * tw); if (!swallow) stretch(); }
    idx = i;
  }
  new MutationObserver(sync).observe(bar, {subtree: true, attributes: true, attributeFilter: ['aria-current']});
  sync();

  // arrastrar la lente
  const xFor = (clientX) => Math.max(0, Math.min(clientX - drag.left - tw / 2, tw * (tabs.length - 1)));
  bar.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    drag = {x: e.clientX, lastX: e.clientX, moved: false, left: bar.getBoundingClientRect().left + 4};
    // mantener presionado también levanta la lente y la trae bajo el dedo
    drag.hold = setTimeout(() => {
      if (!drag) return;
      bar.classList.remove('nolens'); bar.classList.add('scrub', 'dragging'); setX(xFor(drag.lastX));
    }, 160);
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.lastX = e.clientX;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 7) return;
    if (!drag.moved) { drag.moved = true; bar.classList.remove('nolens', 'moving'); bar.classList.add('scrub', 'dragging'); }
    setX(xFor(e.clientX));
  }, {passive: true});
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null; clearTimeout(d.hold);
    const lifted = bar.classList.contains('scrub');
    bar.classList.remove('scrub', 'dragging');
    if (!d.moved && !lifted) return; // toque normal: el enlace cambia de pestaña y la lente lo sigue
    swallow = true; setTimeout(() => { swallow = false; }, 400);
    const i = Math.round(getX() / tw);
    setX(i * tw);
    const tab = tabs[i].dataset.tab;
    if (location.hash.slice(1) !== tab) location.hash = tab;
    else sync();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // después de arrastrar no se dispara además el clic del enlace donde se soltó
  bar.addEventListener('click', (e) => { if (swallow) e.preventDefault(); }, true);

  // ---------- encoger al bajar ----------
  let lastY = scrollY, raf = 0;
  addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = scrollY, dy = y - lastY;
      if (y < 60) { nav.classList.remove('min'); lastY = y; return; }
      if (Math.abs(dy) < 12) return;
      nav.classList.toggle('min', dy > 0);
      lastY = y;
    });
  }, {passive: true});
  addEventListener('hashchange', () => nav.classList.remove('min'));
})();
