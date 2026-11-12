// Finanzas Verano 2027: lee los CSV de data/, hace las cuentas y dibuja la página.
(function () {
  'use strict';

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const cop = (v) => (v < 0 ? '−' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('es-CO');
  const usd = (v) => (v < 0 ? '−' : '') + 'US$' + Math.abs(v).toLocaleString('es-CO', {maximumFractionDigits: Math.abs(v) < 100 && v % 1 ? 2 : 0});
  const pct = (v) => Math.round(v * 100) + ' %';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const toTime = (s) => Date.parse(s + 'T00:00:00Z');
  const fDate = (s) => { const d = new Date(toTime(s)); return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const setText = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };

  // CSV con comillas
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
    const [head, ...body] = rows;
    return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
  }
  // Busca cada CSV en data/ y, si no está ahí, junto a index.html.
  const get = (path) => fetch(path, {cache: 'no-store'}).then((r) => { if (!r.ok) throw new Error(path + ': ' + r.status); return r.text(); });
  const load = (name) => get('data/' + name + '.csv').catch(() => get(name + '.csv')).then(parseCSV);

  // ---------- cuentas ----------
  // Reparte el gasto de cada cuenta entre sus conceptos en orden:
  // en los vuelos, los primeros US$800 van al préstamo y el resto a Nueva York.
  function porConcepto(presupuesto, movimientos) {
    const porCuenta = new Map();
    movimientos.filter((m) => m.tipo === 'gasto').forEach((m) => porCuenta.set(m.concepto, (porCuenta.get(m.concepto) || 0) + n(m.usd)));
    const filas = presupuesto.map((p) => ({bolsa: p.bolsa, orden: n(p.orden), concepto: p.concepto, cuenta: p.cuenta || p.concepto, presupuesto_usd: n(p.presupuesto_usd), nota: p.nota || ''}))
      .sort((a, b) => a.orden - b.orden);
    porCuenta.forEach((v, c) => { if (!filas.some((f) => f.cuenta === c)) filas.push({bolsa: 'Nueva York', orden: 999, concepto: c, cuenta: c, presupuesto_usd: 0, nota: 'Sin presupuesto: sale del fondo'}); });
    const resto = new Map(porCuenta);
    return filas.map((f, i) => {
      const ultima = !filas.slice(i + 1).some((o) => o.cuenta === f.cuenta);
      const disp = resto.get(f.cuenta) || 0;
      const g = r2(ultima ? disp : Math.min(disp, f.presupuesto_usd));
      resto.set(f.cuenta, disp - g);
      const sobre = Math.max(0, r2(g - f.presupuesto_usd));
      let estado = 'Pendiente';
      if (g > 0) estado = f.presupuesto_usd === 0 ? 'Del fondo' : (sobre > 0 ? 'Te pasaste' : (g >= f.presupuesto_usd ? 'Pagado' : 'En curso'));
      return {...f, gastado_usd: g, restante_usd: r2(f.presupuesto_usd - g), sobrecosto_usd: sobre, estado};
    });
  }

  function serieAhorro(movimientos) {
    const porDia = new Map();
    movimientos.filter((m) => m.tipo === 'ahorro').forEach((m) => porDia.set(m.fecha, (porDia.get(m.fecha) || 0) + n(m.cop)));
    let acc = 0;
    return [...porDia.keys()].sort().map((fecha) => { acc += porDia.get(fecha); return {fecha, acumulado_cop: Math.round(acc)}; });
  }

  function totales(filas, movimientos, plan, parametros) {
    const ahorros = movimientos.filter((m) => m.tipo === 'ahorro');
    const ahorrado_cop = Math.round(ahorros.reduce((s, m) => s + n(m.cop), 0));
    const hitos = plan.map((p) => ({t: toTime(p.fecha), v: n(p.meta_acumulada_cop)})).sort((a, b) => a.t - b.t);
    const hoy = Date.now();
    let esperado = hitos.length ? hitos[0].v : 0;
    for (let i = 1; i < hitos.length; i++) {
      const a = hitos[i - 1], b = hitos[i];
      if (hoy >= b.t) esperado = b.v;
      else if (hoy > a.t) { esperado = a.v + (b.v - a.v) * (hoy - a.t) / (b.t - a.t); break; }
    }
    const meta_cop = hitos.length ? hitos[hitos.length - 1].v : 0;
    const p0 = parametros[0] || {};
    const tasa = n(p0.tasa_cop_usd);
    const suma = (bolsa, campo) => r2(filas.filter((f) => f.bolsa === bolsa).reduce((s, f) => s + n(f[campo]), 0));
    const presupuesto_nyc = suma('Nueva York', 'presupuesto_usd');
    // Fondo = ahorro planeado (en dólares) + almuerzos invitados − presupuesto de Nueva York
    const fondo_inicial = r2((tasa ? meta_cop / tasa : 0) + n(p0.ahorro_almuerzos_usd) - presupuesto_nyc);
    const fondo_usado = r2(suma('Nueva York', 'sobrecosto_usd') + suma('Sueldo en Cedar Point', 'sobrecosto_usd'));
    return {
      tasa, fecha_tasa: p0.fecha_tasa, ahorrado_cop, meta_cop,
      avance: meta_cop ? ahorrado_cop / meta_cop : 0,
      esperado: Math.round(esperado), dif: Math.round(ahorrado_cop - esperado),
      fondo_inicial, fondo_usado, fondo_restante: r2(fondo_inicial - fondo_usado),
      presupuesto_nyc, gastado_nyc: suma('Nueva York', 'gastado_usd'),
      presupuesto_papa: suma('Préstamo', 'presupuesto_usd'), gastado_papa: suma('Préstamo', 'gastado_usd')
    };
  }


  // ---------- dibujo ----------
  function meter(id, ratio, color) {
    const bar = $(id); if (!bar) return;
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1) + '%';
      bar.style.background = color || '';
    }));
  }
  const ORDEN = ['Nueva York', 'Préstamo', 'Sueldo en Cedar Point'];
  const TITULO = {'Préstamo': 'Préstamo · Cedar Point', 'Nueva York': 'Tu plata · Nueva York', 'Sueldo en Cedar Point': 'Sueldo en Cedar Point'};
  const CORTO = {'Préstamo': 'Préstamo', 'Nueva York': 'Nueva York', 'Sueldo en Cedar Point': 'Sueldo'};
  const NOTA = {
    'Préstamo': 'Cedar Point se paga con el préstamo: lo que cueste no toca tu plata. Lo usado es lo que devuelves.',
    'Nueva York': 'Tu plata. De los vuelos, lo que pase de US$800 va aquí. Si te pasas en un concepto, sale del fondo para imprevistos.',
    'Sueldo en Cedar Point': 'Gastos de vida durante el trabajo. Lo que te pases, y todo gasto de almuerzo, sale del fondo para imprevistos.'
  };
  const COLOR = {'Préstamo': 'var(--grape)', 'Nueva York': 'var(--coral)', 'Sueldo en Cedar Point': 'var(--sun)'};
  const PILL = {'Te pasaste': 'bad', 'Del fondo': 'warn', 'Pagado': 'ok', 'En curso': 'ok'};
  const TIPOS = {gasto: 'Gasto', ahorro: 'Ahorro'};
  const state = {bolsa: 'Nueva York', filtro: 'todos', data: null};

  function renderResumen(t) {
    setText('v-tasa', t.tasa.toLocaleString('es-CO', {minimumFractionDigits: 2}));
    setText('v-tasa-fecha', t.fecha_tasa ? fDate(t.fecha_tasa) : '—');
    ['v-ahorro', 'v-ahorro-take', 'a-ahorro'].forEach((id) => setText(id, cop(t.ahorrado_cop)));
    ['v-meta', 'a-meta'].forEach((id) => setText(id, cop(t.meta_cop)));
    setText('v-avance', pct(t.avance)); setText('a-avance', pct(t.avance));
    setText('v-dif-a', cop(Math.abs(t.dif))); setText('v-dif-b', cop(Math.abs(t.dif)));
    $('s-ahead').hidden = !(t.dif > 0); $('s-behind').hidden = !(t.dif < 0); $('s-even').hidden = t.dif !== 0;
    const d = $('v-dif'); d.textContent = (t.dif > 0 ? '+' : '') + cop(t.dif); d.className = 'fz-big ' + (t.dif >= 0 ? 'pos' : 'neg');
    setText('v-esperado', cop(t.esperado));
    setText('v-fondo', usd(t.fondo_restante)); setText('v-fondo-ini', usd(t.fondo_inicial)); setText('v-fondo-usado', usd(t.fondo_usado));
    setText('v-gastado-nyc', usd(t.gastado_nyc)); setText('v-pres-nyc', usd(t.presupuesto_nyc));
    setText('v-deuda', usd(t.gastado_papa)); setText('v-pres-papa', usd(t.presupuesto_papa));
  }
  function animateMeters(view) {
    const t = state.data && state.data.t; if (!t) return;
    if (view === 'resumen') {
      meter('m-ahorro', t.avance);
      meter('m-fondo', t.fondo_inicial ? t.fondo_restante / t.fondo_inicial : 0, t.fondo_restante < t.fondo_inicial * 0.25 ? 'var(--coral)' : '');
      meter('m-nyc', t.presupuesto_nyc ? t.gastado_nyc / t.presupuesto_nyc : 0);
      meter('m-papa', t.presupuesto_papa ? t.gastado_papa / t.presupuesto_papa : 0);
    }
    if (view === 'ahorro') meter('a-meter', t.avance);
  }

  function itemMov(m, i) {
    const card = el('div', 'item pop'); card.style.animationDelay = Math.min(i, 10) * 30 + 'ms';
    card.appendChild(el('div', 'it-date', fDate(m.fecha)));
    const side = el('div', 'it-side'); side.appendChild(el('span', 'fz-pill ' + (m.tipo === 'gasto' ? 'info' : 'ok'), TIPOS[m.tipo] || m.tipo)); card.appendChild(side);
    const tt = el('div', 'it-full it-title', m.concepto); if (m.detalle) tt.appendChild(el('span', 'it-sub', m.detalle)); card.appendChild(tt);
    card.appendChild(el('div', 'it-amount ' + (m.tipo === 'gasto' ? 'neg' : 'pos'), (m.tipo === 'gasto' ? '−' : '+') + usd(n(m.usd))));
    card.appendChild(el('div', 'it-cop', cop(n(m.cop))));
    return card;
  }
  const ordenMov = (arr) => arr.slice().sort((a, b) => (b.fecha + String(b.id).padStart(6, '0')).localeCompare(a.fecha + String(a.id).padStart(6, '0')));

  function renderRecientes(movimientos) {
    const box = $('l-recientes'); box.replaceChildren();
    const lst = ordenMov(movimientos).slice(0, 3);
    if (!lst.length) { box.appendChild(el('div', 'empty', 'Todavía no hay movimientos.')); return; }
    lst.forEach((m, i) => box.appendChild(itemMov(m, i)));
  }

  function renderMovimientos() {
    const box = $('l-movimientos'); box.replaceChildren();
    const lst = ordenMov(state.data.movimientos).filter((m) => state.filtro === 'todos' || m.tipo === state.filtro);
    if (!lst.length) { box.appendChild(el('div', 'empty', 'No hay movimientos de este tipo todavía.')); return; }
    lst.forEach((m, i) => box.appendChild(itemMov(m, i)));
    document.querySelectorAll('#chips-mov .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.f === state.filtro)));
  }

  function renderHitos(plan, t) {
    const box = $('l-hitos'); box.replaceChildren();
    plan.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((p, i) => {
      const meta = n(p.meta_acumulada_cop), ok = t.ahorrado_cop >= meta;
      const card = el('div', 'item pop' + (ok ? ' done' : '')); card.style.animationDelay = i * 40 + 'ms';
      const tt = el('div', 'it-title', p.hito); tt.appendChild(el('span', 'it-sub', 'Para el ' + fDate(p.fecha))); card.appendChild(tt);
      const side = el('div', 'it-side'); side.appendChild(el('span', 'fz-pill ' + (ok ? 'ok' : ''), ok ? 'Cumplida' : 'Pendiente')); card.appendChild(side);
      const s1 = el('div', 'it-stat'); s1.appendChild(el('small', null, 'Meta acumulada')); s1.appendChild(document.createTextNode(cop(meta))); card.appendChild(s1);
      const s2 = el('div', 'it-stat ' + (ok ? 'pos' : '')); s2.appendChild(el('small', null, ok ? 'Superada por' : 'Te falta')); s2.appendChild(document.createTextNode(cop(Math.abs(meta - t.ahorrado_cop)))); card.appendChild(s2);
      box.appendChild(card);
    });
  }

  function renderChips(filas) {
    const box = $('chips-bolsa'); box.replaceChildren();
    ORDEN.forEach((b) => {
      const fs = filas.filter((f) => f.bolsa === b); if (!fs.length) return;
      const c = el('button', 'chip'); c.type = 'button'; c.style.setProperty('--c', COLOR[b]);
      c.setAttribute('aria-pressed', String(b === state.bolsa));
      c.appendChild(document.createTextNode(CORTO[b]));
      c.appendChild(el('small', null, usd(fs.reduce((s, f) => s + f.presupuesto_usd, 0))));
      c.addEventListener('click', () => { state.bolsa = b; renderBolsa(); });
      box.appendChild(c);
    });
  }

  function renderBolsa() {
    const filas = state.data.filas, b = state.bolsa;
    renderChips(filas);
    const fs = filas.filter((f) => f.bolsa === b);
    const pres = fs.reduce((s, f) => s + f.presupuesto_usd, 0), gas = fs.reduce((s, f) => s + f.gastado_usd, 0);
    const card = $('bolsa-resumen'); card.style.setProperty('--c', COLOR[b]);
    setText('b-titulo', TITULO[b]); setText('b-gastado', usd(gas)); setText('b-presupuesto', usd(pres)); setText('b-queda', usd(pres - gas)); setText('b-nota', NOTA[b] || '');
    meter('b-meter', pres ? gas / pres : 0);
    const box = $('l-presupuesto'); box.replaceChildren();
    fs.forEach((f, i) => {
      const it = el('div', 'item pop'); it.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
      const tt = el('div', 'it-title', f.concepto); if (f.nota) tt.appendChild(el('span', 'it-sub', f.nota)); it.appendChild(tt);
      const side = el('div', 'it-side'); side.appendChild(el('span', 'fz-pill ' + (PILL[f.estado] || ''), f.estado)); it.appendChild(side);
      [['Presupuesto', usd(f.presupuesto_usd), ''], ['Gastado', f.gastado_usd ? usd(f.gastado_usd) : '—', ''], ['Queda', usd(f.restante_usd), f.restante_usd < 0 ? 'neg' : '']].forEach(([l, v, cls]) => {
        const s = el('div', 'it-stat ' + cls); s.appendChild(el('small', null, l)); s.appendChild(document.createTextNode(v)); it.appendChild(s);
      });
      box.appendChild(it);
    });
  }

  // Gráfico en SVG puro
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

  function renderChart(serie, plan) {
    const box = $('chart'); box.replaceChildren();
    const W = Math.max(280, box.clientWidth || 600), H = 260, m = {t: 18, r: 18, b: 30, l: 58};
    const real = serie.map((d) => ({t: toTime(d.fecha), v: d.acumulado_cop, fecha: d.fecha}));
    const pl = plan.map((d) => ({t: toTime(d.fecha), v: n(d.meta_acumulada_cop), fecha: d.fecha, hito: d.hito}));
    const all = real.concat(pl); if (!all.length) return;
    const DAY = 864e5;
    const t0 = Math.min(...all.map((d) => d.t)) - 7 * DAY, t1 = Math.max(...all.map((d) => d.t)) + 7 * DAY;
    const maxV = Math.max(...all.map((d) => d.v)) * 1.06; const step = niceStep(maxV / 4); const yMax = Math.ceil(maxV / step) * step;
    const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
    const y = (v) => H - m.b - v / yMax * (H - m.t - m.b);
    const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Ahorro acumulado en pesos frente al plan de ahorro'}, box);
    for (let v = 0; v <= yMax + 1; v += step) {
      svgEl('line', {x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid'}, svg);
      const tx = svgEl('text', {x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'axis'}, svg);
      tx.textContent = '$' + (v / 1e6).toLocaleString('es-CO', {maximumFractionDigits: 1}) + ' M';
    }
    const months = []; const s = new Date(t0); let d = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1);
    while (d <= t1) { months.push(d); const dd = new Date(d); d = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1); }
    const every = (W - m.l - m.r) / months.length < 60 ? 2 : 1;
    months.forEach((mt, i) => {
      if (i % every) return;
      const dd = new Date(mt); const tx = svgEl('text', {x: x(mt), y: H - m.b + 18, 'text-anchor': 'middle', class: 'axis'}, svg);
      tx.textContent = MESES[dd.getUTCMonth()] + (dd.getUTCMonth() === 0 || i === 0 ? ' ' + dd.getUTCFullYear() : '');
    });
    svgEl('path', {d: 'M' + pl.map((p) => x(p.t) + ',' + y(p.v)).join('L'), fill: 'none', stroke: 'var(--sky)', 'stroke-width': 2, 'stroke-dasharray': '6 5'}, svg);
    if (real.length) {
      const pts = real.slice(); const today = Date.now();
      if (today > pts[pts.length - 1].t && today < t1) pts.push({t: today, v: pts[pts.length - 1].v});
      let line = 'M' + x(pts[0].t) + ',' + y(pts[0].v);
      for (let i = 1; i < pts.length; i++) line += 'H' + x(pts[i].t) + 'V' + y(pts[i].v);
      const area = line + 'V' + y(0) + 'H' + x(pts[0].t) + 'Z';
      svgEl('path', {d: area, fill: 'color-mix(in srgb, var(--mint) 16%, transparent)'}, svg);
      svgEl('path', {d: line, fill: 'none', stroke: 'var(--mint)', 'stroke-width': 3}, svg);
      const last = real[real.length - 1];
      const lt = svgEl('text', {x: x(last.t) + 8, y: y(last.v) + 18, class: 'axis', fill: 'var(--mint)'}, svg); lt.textContent = cop(last.v); lt.style.fill = 'var(--mint)';
    }
    const goal = pl[pl.length - 1];
    if (goal) { const gt = svgEl('text', {x: x(goal.t), y: y(goal.v) - 10, 'text-anchor': 'end', class: 'axis'}, svg); gt.textContent = 'Meta ' + cop(goal.v); }

    const tip = el('div', 'fz-tip'); tip.hidden = true; box.appendChild(tip);
    const show = (ev, lines) => {
      tip.replaceChildren(); lines.forEach(([a, b]) => { const r = el('div'); r.appendChild(el('span', null, a + ' ')); r.appendChild(document.createTextNode(b)); tip.appendChild(r); });
      tip.hidden = false;
      const bb = box.getBoundingClientRect(); const px = ev.clientX - bb.left, py = ev.clientY - bb.top;
      tip.style.left = Math.max(0, Math.min(bb.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
      tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + 'px';
    };
    const hide = () => { tip.hidden = true; };
    pl.forEach((p) => {
      const c = svgEl('circle', {cx: x(p.t), cy: y(p.v), r: 5, fill: 'var(--panel)', stroke: 'var(--sky)', 'stroke-width': 2}, svg);
      c.addEventListener('pointerenter', (e) => show(e, [['Plan', fDate(p.fecha)], ['Meta acumulada', cop(p.v)], ['', p.hito]]));
      c.addEventListener('pointerleave', hide);
    });
    real.forEach((p) => {
      const c = svgEl('circle', {cx: x(p.t), cy: y(p.v), r: 6, fill: 'var(--mint)', stroke: 'var(--panel)', 'stroke-width': 2}, svg);
      c.addEventListener('pointerenter', (e) => show(e, [['Ahorrado al', fDate(p.fecha)], ['Acumulado', cop(p.v)]]));
      c.addEventListener('pointerleave', hide);
    });
  }

  // ---------- ruta ----------
  const MODOS = {walk: ['A pie', 'walking'], metro: ['Metro', 'transit'], ferry: ['Ferry', 'transit'], car: ['Taxi o bus', 'driving']};
  const ruta = {data: null, dia: 0};
  const maps = (c) => 'https://www.google.com/maps/search/?api=1&query=' + c[0] + ',' + c[1];
  const dir = (a, b, m) => 'https://www.google.com/maps/dir/?api=1&origin=' + a[0] + ',' + a[1] + '&destination=' + b[0] + ',' + b[1] + '&travelmode=' + m;
  function renderRuta() {
    const R = ruta.data; if (!R) return;
    setText('r-fechas', R.fechas); setText('r-hotel', R.hotel);
    const chips = $('chips-dia'); chips.replaceChildren();
    R.dias.forEach((d, i) => {
      const c = el('button', 'chip'); c.type = 'button'; c.style.setProperty('--c', 'var(--coral)');
      c.setAttribute('aria-pressed', String(i === ruta.dia));
      c.appendChild(document.createTextNode(d.dia + ' ' + d.num)); c.appendChild(el('small', null, d.corto || ''));
      c.addEventListener('click', () => { ruta.dia = i; renderRuta(); });
      chips.appendChild(c);
    });
    const d = R.dias[ruta.dia];
    setText('d-nombre', d.nombre); setText('d-titulo', d.titulo);
    const lugares = d.paradas.filter((p) => !p.comida).length;
    setText('d-resumen', lugares + ' paradas · de ' + d.paradas[0].hora + ' a ' + d.paradas[d.paradas.length - 1].hora);
    const ol = $('l-ruta'); ol.replaceChildren();
    let prev = null;
    d.paradas.forEach((p, i) => {
      const li = el('li', 'stop pop' + (p.comida ? ' meal' : '')); li.style.animationDelay = Math.min(i, 12) * 35 + 'ms';
      li.appendChild(el('div', 'stop-time', p.hora));
      const rail = el('div', 'stop-rail'); rail.appendChild(el('span', 'stop-dot')); li.appendChild(rail);
      const body = el('div', 'stop-body');
      body.appendChild(el('div', 'stop-name', p.lugar));
      if (p.modo && MODOS[p.modo]) body.appendChild(el('span', 'mode', MODOS[p.modo][0]));
      if (p.nota) body.appendChild(el('div', 'stop-note', p.nota));
      if (p.coord) {
        const links = el('div', 'stop-links');
        const a1 = el('a', null, 'Ver en mapa'); a1.href = maps(p.coord); a1.target = '_blank'; a1.rel = 'noopener'; links.appendChild(a1);
        if (prev && p.modo && MODOS[p.modo]) { const a2 = el('a', 'dir', 'Cómo llegar'); a2.href = dir(prev, p.coord, MODOS[p.modo][1]); a2.target = '_blank'; a2.rel = 'noopener'; links.appendChild(a2); }
        body.appendChild(links);
        prev = p.coord;
      }
      li.appendChild(body); ol.appendChild(li);
    });
  }
  fetch('data/ruta.json', {cache: 'no-store'}).then((r) => r.ok ? r.json() : Promise.reject(r.status)).then((R) => {
    ruta.data = R;
    const hoy = new Date(); const iso = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    const idx = {'2027-08-04': 0, '2027-08-05': 1, '2027-08-06': 2, '2027-08-07': 3}[iso];
    if (idx != null && idx < R.dias.length) ruta.dia = idx;
    renderRuta();
  }).catch((e) => console.error('ruta', e));

  // ---------- navegación ----------
  const VIEWS = ['resumen', 'ahorro', 'presupuesto', 'ruta', 'movimientos'];
  function show(view, first) {
    if (!VIEWS.includes(view)) view = 'resumen';
    document.querySelectorAll('.view').forEach((v) => {
      const on = v.dataset.view === view;
      v.hidden = !on;
      v.classList.toggle('enter', on && !first);
    });
    const tab = view === 'movimientos' ? 'resumen' : view;
    document.querySelectorAll('[data-tab]').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!first) window.scrollTo({top: 0, behavior: 'instant' in window ? 'instant' : 'auto'});
    if (state.data) {
      if (view === 'ahorro') renderChart(state.data.serie, state.data.plan);
      animateMeters(view);
    }
  }
  const current = () => (location.hash || '#resumen').slice(1);
  window.addEventListener('hashchange', () => show(current()));
  document.querySelectorAll('a[data-bolsa]').forEach((a) => a.addEventListener('click', () => { state.bolsa = a.dataset.bolsa; if (state.data) renderBolsa(); }));
  document.querySelectorAll('#chips-mov .chip').forEach((c) => c.addEventListener('click', () => { state.filtro = c.dataset.f; renderMovimientos(); }));
  show(current(), true);

  // ---------- arranque ----------
  Promise.all(['presupuesto', 'movimientos', 'plan', 'parametros'].map(load)).then(([presupuesto, movimientos, plan, parametros]) => {
    const filas = porConcepto(presupuesto, movimientos);
    const serie = serieAhorro(movimientos);
    const t = totales(filas, movimientos, plan, parametros);
    state.data = {filas, serie, plan, movimientos, t};
    renderResumen(t);
    renderRecientes(movimientos);
    renderHitos(plan, t);
    renderBolsa();
    renderMovimientos();
    show(current(), true);
    let w = 0;
    window.addEventListener('resize', () => { const c = $('chart'); if (!c || c.offsetParent === null) return; if (c.clientWidth !== w) { w = c.clientWidth; renderChart(serie, plan); } });
  }).catch((err) => { console.error(err); $('error').hidden = false; });
})();
