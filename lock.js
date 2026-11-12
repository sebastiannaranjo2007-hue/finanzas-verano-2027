// Pantalla de clave. Ojo: es un candado para la vista, no seguridad real:
// el repositorio es público y los datos se pueden leer directamente en GitHub.
(function () {
  'use strict';
  const HASH = 'aaab1d5d7c693c02003a07e89f10a6326471e03e19a259878a725a384cef667d'; // sha256('nyc-2027:' + clave)
  const KEY = 'nyc-unlock';
  const DAYS = 30;
  const root = document.documentElement;
  const ok = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.h === HASH && v.t > Date.now(); } catch (e) { return false; } };
  if (ok()) { root.classList.remove('locked'); return; }

  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function build() {
    const lock = document.getElementById('lock'); if (!lock) return;
    const dots = lock.querySelectorAll('.pin-dots i');
    const msg = lock.querySelector('.pin-msg');
    let pin = '';
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    async function check() {
      const h = await sha('nyc-2027:' + pin);
      if (h === HASH) {
        try { localStorage.setItem(KEY, JSON.stringify({h: HASH, t: Date.now() + DAYS * 864e5})); } catch (e) {}
        lock.classList.add('open');
        setTimeout(() => { root.classList.remove('locked'); lock.hidden = true; }, 260);
      } else {
        msg.textContent = 'Clave incorrecta';
        lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake');
        pin = ''; setTimeout(paint, 250);
      }
    }
    function press(k) {
      if (k === 'del') pin = pin.slice(0, -1);
      else if (/^\d$/.test(k) && pin.length < 4) pin += k;
      msg.textContent = '';
      paint();
      if (pin.length === 4) setTimeout(check, 120);
    }
    lock.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    document.addEventListener('keydown', (e) => {
      if (!root.classList.contains('locked')) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
