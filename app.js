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
  const load = (name) => fetch('data/' + name + '.csv', {cache: 'no-store'}).then((r) => {
    if (!r.ok) throw new Error(name + ': ' + r.status);
    return r.text();
  }).then(parseCSV);

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
    bar.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1) + '%';
    bar.style.background = color || '';
  }

  function renderResumen(t) {
    setText('v-tasa', t.tasa.toLocaleString('es-CO', {minimumFractionDigits: 2}));
    setText('v-tasa-fecha', t.fecha_tasa ? fDate(t.fecha_tasa) : '—');
    ['v-ahorro', 'v-ahorro-take'].forEach((id) => setText(id, cop(t.ahorrado_cop)));
    ['v-meta', 'v-meta-take'].forEach((id) => setText(id, cop(t.meta_cop)));
    setText('v-avance', pct(t.avance));
    setText('v-dif-a', cop(Math.abs(t.dif)));
    setText('v-dif-b', cop(Math.abs(t.dif)));
    $('s-ahead').hidden = !(t.dif > 0);
    $('s-behind').hidden = !(t.dif < 0);
    $('s-even').hidden = t.dif !== 0;
    const d = $('v-dif'); d.textContent = (t.dif > 0 ? '+' : '') + cop(t.dif); d.className = 'fz-big ' + (t.dif >= 0 ? 'pos' : 'neg');
    setText('v-esperado', cop(t.esperado));
    setText('v-fondo', usd(t.fondo_restante));
    setText('v-fondo-ini', usd(t.fondo_inicial));
    setText('v-fondo-usado', usd(t.fondo_usado));
    setText('v-gastado-nyc', usd(t.gastado_nyc));
    setText('v-pres-nyc', usd(t.presupuesto_nyc));
    ['v-deuda', 'v-deuda-take'].forEach((id) => setText(id, usd(t.gastado_papa)));
    ['v-pres-papa', 'v-pres-papa-take'].forEach((id) => setText(id, usd(t.presupuesto_papa)));
    meter('m-ahorro', t.avance);
    meter('m-fondo', t.fondo_inicial ? t.fondo_restante / t.fondo_inicial : 0, t.fondo_restante < t.fondo_inicial * 0.25 ? 'var(--coral)' : '');
    meter('m-nyc', t.presupuesto_nyc ? t.gastado_nyc / t.presupuesto_nyc : 0);
    meter('m-papa', t.presupuesto_papa ? t.gastado_papa / t.presupuesto_papa : 0);
  }

  const ORDEN = ['Préstamo', 'Nueva York', 'Sueldo en Cedar Point'];
  const TITULO = {'Préstamo': 'Préstamo · Cedar Point', 'Nueva York': 'Tu plata · Nueva York', 'Sueldo en Cedar Point': 'Sueldo en Cedar Point'};
  const COLOR = {'Préstamo': 'var(--grape)', 'Nueva York': 'var(--coral)', 'Sueldo en Cedar Point': 'var(--sun)'};
  const PILL = {'Te pasaste': 'bad', 'Del fondo': 'warn', 'Pagado': 'ok', 'En curso': 'ok'};

  function renderPresupuesto(filas) {
    const tb = $('t-presupuesto'); tb.replaceChildren();
    const bolsas = [...new Set(filas.map((f) => f.bolsa))].sort((a, b) => (ORDEN.indexOf(a) + 99) % 99 - (ORDEN.indexOf(b) + 99) % 99);
    bolsas.forEach((b) => {
      const fs = filas.filter((f) => f.bolsa === b);
      const hr = el('tr', 'grp'); const th = el('th'); th.colSpan = 5; th.scope = 'colgroup';
      th.style.setProperty('--c', COLOR[b] || 'var(--mint)');
      th.textContent = (TITULO[b] || b) + ' · ' + usd(fs.reduce((s, f) => s + f.gastado_usd, 0)) + ' de ' + usd(fs.reduce((s, f) => s + f.presupuesto_usd, 0));
      hr.appendChild(th); tb.appendChild(hr);
      fs.forEach((f) => {
        const tr = el('tr');
        const c0 = el('td', null, f.concepto); if (f.nota) c0.appendChild(el('div', 'sub', f.nota)); tr.appendChild(c0);
        tr.appendChild(el('td', 'num', usd(f.presupuesto_usd)));
        tr.appendChild(el('td', 'num', f.gastado_usd ? usd(f.gastado_usd) : '—'));
        tr.appendChild(el('td', 'num' + (f.restante_usd < 0 ? ' neg' : ''), usd(f.restante_usd)));
        const ce = el('td'); ce.appendChild(el('span', 'fz-pill ' + (PILL[f.estado] || ''), f.estado)); tr.appendChild(ce);
        tb.appendChild(tr);
      });
    });
  }

  function renderMovimientos(movimientos) {
    const tb = $('t-movimientos'); tb.replaceChildren();
    if (!movimientos.length) { const tr = el('tr'); const c = el('td', 'empty', 'Todavía no hay movimientos.'); c.colSpan = 6; tr.appendChild(c); tb.appendChild(tr); return; }
    const tipos = {gasto: 'Gasto', ahorro: 'Ahorro'};
    movimientos.slice().sort((a, b) => (b.fecha + String(b.id).padStart(6, '0')).localeCompare(a.fecha + String(a.id).padStart(6, '0'))).forEach((m) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, fDate(m.fecha)));
      tr.appendChild(el('td', null, tipos[m.tipo] || m.tipo));
      tr.appendChild(el('td', null, m.concepto));
      tr.appendChild(el('td', null, m.detalle || ''));
      tr.appendChild(el('td', 'num ' + (m.tipo === 'gasto' ? 'neg' : 'pos'), usd(n(m.usd))));
      tr.appendChild(el('td', 'num', cop(n(m.cop))));
      tb.appendChild(tr);
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

  // ---------- arranque ----------
  Promise.all(['presupuesto', 'movimientos', 'plan', 'parametros'].map(load)).then(([presupuesto, movimientos, plan, parametros]) => {
    const filas = porConcepto(presupuesto, movimientos);
    const serie = serieAhorro(movimientos);
    renderResumen(totales(filas, movimientos, plan, parametros));
    renderPresupuesto(filas);
    renderMovimientos(movimientos);
    renderChart(serie, plan);
    let w = $('chart').clientWidth;
    window.addEventListener('resize', () => { const nw = $('chart').clientWidth; if (nw !== w) { w = nw; renderChart(serie, plan); } });
  }).catch((err) => { console.error(err); $('error').hidden = false; });
})();
