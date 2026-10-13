const KEY = 'planner.v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function seed() {
  const id = uid();
  return { current: id, plans: [{ id, title: 'Mi primer proyecto', blocks: [
    { id: uid(), title: 'Arquitectura del proyecto', open: true, steps: [
      { id: uid(), text: 'Definir capas y estructura de carpetas', done: false },
      { id: uid(), text: 'Elegir stack y dependencias', done: false }] },
    { id: uid(), title: 'Decisiones de diseño', open: false, steps: [] },
    { id: uid(), title: 'Definición de modelos', open: false, steps: [] }
  ] }] };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.plans)) return s; } catch (e) {}
  return seed();
}
let state = load();
let focusSel = null, armedEl = null, armedTimer = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const plan = () => state.plans.find(p => p.id === state.current) || null;
const findBlock = id => plan().blocks.find(b => b.id === id);

function renderSide() {
  const el = document.getElementById('plans');
  el.innerHTML = state.plans.map(p => `
    <div class="plan ${p.id === state.current ? 'active' : ''}" data-act="select" data-p="${p.id}">
      <span>${esc(p.title || 'Sin título')}</span>
      <button class="x" data-act="delplan" data-p="${p.id}" title="Borrar">✕</button>
    </div>`).join('');
}
function renderMain() {
  const m = document.getElementById('main'), p = plan();
  if (!p) {
    m.innerHTML = `<div class="empty">No hay planificaciones todavía.<br><button data-act="newplan">+ Crear una</button></div>`;
    return;
  }
  const all = p.blocks.flatMap(b => b.steps), done = all.filter(s => s.done).length;
  m.innerHTML = `
    <div class="top"><input id="ptitle" value="${esc(p.title)}" placeholder="Título de la planificación" spellcheck="false"><span class="count">${done}/${all.length} pasos</span></div>
    ${p.blocks.map(b => {
      const d = b.steps.filter(s => s.done).length, pct = b.steps.length ? Math.round(d / b.steps.length * 100) : 0;
      return `<section class="block ${b.open ? 'open' : ''}" data-b="${b.id}">
        <div class="block-h" data-act="toggle">
          <span class="grip" draggable="true" title="Arrastrar bloque">⋮⋮</span>
          <span class="chev">▶</span>
          <input class="btitle" value="${esc(b.title)}" placeholder="Nombre del bloque" spellcheck="false">
          <span class="prog">${d}/${b.steps.length}</span>
          <button class="x" data-act="delblock" title="Borrar bloque">✕</button>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${b.open ? `<div class="body">
          ${b.steps.map(s => `<div class="step ${s.done ? 'done' : ''}" data-s="${s.id}">
            <span class="grip" draggable="true" title="Arrastrar paso">⋮⋮</span><input type="checkbox" ${s.done ? 'checked' : ''}>
            <input class="stext" value="${esc(s.text)}" spellcheck="false">
            <button class="x" data-act="delstep" title="Borrar paso">✕</button></div>`).join('')}
          <input class="addstep" placeholder="Añadir paso… (Enter)" spellcheck="false">
        </div>` : ''}
      </section>`;
    }).join('')}
    <div class="newblock"><div class="tpls"><span>Plantillas</span>${Object.keys(TPL).map(n => `<button data-act="tpl" data-n="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div><input id="newblock" placeholder="+ Nuevo bloque (Enter)  ·  ej: Arquitectura, Modelos…" spellcheck="false"></div>`;
}
function render() {
  renderSide(); renderMain();
  if (focusSel) { const e = document.querySelector(focusSel); if (e) { e.focus(); if (e.select && e.id === 'ptitle') e.select(); } focusSel = null; }
}

/* ---------- Plantillas ---------- */
const TPL = {
  'Backend API': {
    'Arquitectura del proyecto': ['Definir capas (Controller → Service → Repository)', 'Estructura de carpetas', 'Configuración y variables de entorno'],
    'Definición de modelos': ['Listar entidades y relaciones', 'Esquemas y validaciones', 'Índices y campos únicos'],
    'Endpoints y rutas': ['Listar recursos y verbos', 'Middlewares (auth, errores, validación)', 'Documentar la API'],
    'Testing': ['Tests unitarios de servicios', 'Tests de integración de endpoints'],
    'Deploy': ['Elegir hosting', 'Variables de entorno y base de datos', 'Revisar logs en producción']
  },
  'Frontend': {
    'Arquitectura del proyecto': ['Estructura de carpetas y componentes', 'Ruteo', 'Manejo de estado'],
    'Decisiones de diseño': ['Paleta y tipografía', 'Componentes base reutilizables', 'Responsive'],
    'Consumo de la API': ['Cliente HTTP y manejo de errores', 'Autenticación y rutas protegidas'],
    'Deploy': ['Variables de entorno', 'Build y publicación']
  },
  'General': {
    'Idea y alcance': ['Qué problema resuelve', 'Funcionalidades mínimas (MVP)', 'Qué queda fuera por ahora'],
    'Arquitectura del proyecto': ['Stack', 'Estructura general'],
    'Decisiones de diseño': ['Estilo visual', 'Flujos principales'],
    'Definición de modelos': ['Entidades principales', 'Relaciones'],
    'Lanzamiento': ['Checklist final', 'Documentar en el README']
  }
};
function addTemplate(n) {
  const p = plan(); if (!p || !TPL[n]) return;
  Object.entries(TPL[n]).forEach(([title, steps], i) => p.blocks.push({ id: uid(), title, open: i === 0, steps: steps.map(text => ({ id: uid(), text, done: false })) }));
  save(); render();
}

/* ---------- Drag & drop ---------- */
let drag = null;
function clearDrop() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-in,.dragging').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in', 'dragging'));
}
function dropTarget(e) {
  const after = el => { const r = el.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  const bOf = el => el.closest('[data-b]')?.dataset.b;
  if (drag.t === 'b') {
    const el = e.target.closest('.block'); if (!el || el.dataset.b === drag.id) return null;
    const a = after(el); return { el, cls: a ? 'drop-after' : 'drop-before', kind: 'b', id: el.dataset.b, after: a };
  }
  const st = e.target.closest('.step');
  if (st) {
    if (st.dataset.s === drag.id) return null;
    const a = after(st); return { el: st, cls: a ? 'drop-after' : 'drop-before', kind: 's', id: st.dataset.s, b: bOf(st), after: a };
  }
  const end = e.target.closest('.addstep,.block-h');
  return end ? { el: end, cls: 'drop-in', kind: 'end', b: bOf(end) } : null;
}
document.addEventListener('dragstart', e => {
  const g = e.target.closest?.('.grip'); if (!g) return;
  const step = g.closest('.step'), sec = g.closest('[data-b]');
  drag = step ? { t: 's', id: step.dataset.s, b: sec.dataset.b } : { t: 'b', id: sec.dataset.b };
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x');
  e.dataTransfer.setDragImage(step || sec, 12, 12);
  setTimeout(() => (step || sec).classList.add('dragging'), 0);
});
document.addEventListener('dragover', e => {
  if (!drag) return;
  const t = dropTarget(e); clearDrop();
  if (t) { e.preventDefault(); t.el.classList.add(t.cls); }
});
document.addEventListener('drop', e => {
  if (!drag) return;
  const t = dropTarget(e); if (!t) { drag = null; clearDrop(); return; }
  e.preventDefault();
  const p = plan();
  if (drag.t === 'b') {
    const [b] = p.blocks.splice(p.blocks.findIndex(x => x.id === drag.id), 1);
    const i = p.blocks.findIndex(x => x.id === t.id); p.blocks.splice(t.after ? i + 1 : i, 0, b);
  } else {
    const src = findBlock(drag.b), [s] = src.steps.splice(src.steps.findIndex(x => x.id === drag.id), 1), dst = findBlock(t.b);
    if (t.kind === 'end') { dst.steps.push(s); dst.open = true; }
    else { const i = dst.steps.findIndex(x => x.id === t.id); dst.steps.splice(t.after ? i + 1 : i, 0, s); }
  }
  drag = null; clearDrop(); save(); render();
});
document.addEventListener('dragend', () => { drag = null; clearDrop(); });

/* ---------- Exportar / Importar ---------- */
const dlg = { mode: 'json' };
const toMd = p => !p ? '' : `# ${p.title}\n\n` + p.blocks.map(b => `## ${b.title}\n` + b.steps.map(s => `- [${s.done ? 'x' : ' '}] ${s.text}`).join('\n')).join('\n\n') + '\n';
const ioText = () => dlg.mode === 'json' ? JSON.stringify({ plans: state.plans }, null, 2) : toMd(plan());
const ioMsg = t => { document.getElementById('iomsg').textContent = t; };
function openIO() { dlg.mode = 'json'; document.getElementById('io').hidden = false; fillIO(); }
function closeIO() { document.getElementById('io').hidden = true; }
function fillIO() {
  const m = dlg.mode, ta = document.getElementById('iotext'), imp = m === 'import';
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  ta.value = imp ? '' : ioText(); ta.readOnly = !imp;
  ta.placeholder = 'Pegá un JSON exportado o un Markdown (# Plan, ## Bloque, - [ ] paso)';
  ['iocopy', 'iodl'].forEach(id => document.getElementById(id).hidden = imp);
  ['iodo', 'iopick'].forEach(id => document.getElementById(id).hidden = !imp);
  ioMsg(''); ta.focus();
}
async function copyIO() {
  const ta = document.getElementById('iotext');
  try { await navigator.clipboard.writeText(ta.value); ioMsg('Copiado ✓'); }
  catch (e) { ta.select(); try { document.execCommand('copy'); ioMsg('Copiado ✓'); } catch (_) { ioMsg('Seleccioná el texto y copialo con Ctrl+C'); } }
}
function dlIO() {
  const slug = (plan()?.title || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ioText()], { type: 'text/plain' }));
    a.download = dlg.mode === 'json' ? 'planner.json' : slug + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    ioMsg('Descarga iniciada. Si no aparece, usá Copiar.');
  } catch (e) { ioMsg('No se pudo descargar; usá Copiar.'); }
}
const norm = p => ({ id: uid(), title: String(p.title || 'Importada'), blocks: (p.blocks || []).map(b => ({ id: uid(), title: String(b.title || ''), open: false, steps: (b.steps || []).map(s => ({ id: uid(), text: String(s.text || ''), done: !!s.done })) })) });
function parseMd(txt) {
  const plans = []; let p = null, b = null, m;
  const cur = () => { if (!p) { p = { id: uid(), title: 'Importada', blocks: [] }; plans.push(p); } return p; };
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim();
    if ((m = l.match(/^#\s+(.+)/))) { p = { id: uid(), title: m[1], blocks: [] }; plans.push(p); b = null; }
    else if ((m = l.match(/^##\s+(.+)/))) { b = { id: uid(), title: m[1], open: false, steps: [] }; cur().blocks.push(b); }
    else if ((m = l.match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.+)/))) {
      if (!b) { b = { id: uid(), title: 'General', open: false, steps: [] }; cur().blocks.push(b); }
      b.steps.push({ id: uid(), text: m[2], done: !!m[1] && m[1] !== ' ' });
    }
  }
  return plans;
}
function doImport() {
  const txt = document.getElementById('iotext').value.trim();
  if (!txt) { ioMsg('Pegá algo primero'); return; }
  let plans = [];
  try { const d = JSON.parse(txt); plans = (d.plans || (d.blocks ? [d] : [])).map(norm); }
  catch (e) { plans = parseMd(txt); }
  if (!plans.length) { ioMsg('No se encontró ninguna planificación'); return; }
  state.plans.push(...plans); state.current = plans[0].id; save(); closeIO(); render();
}
document.getElementById('iofile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { document.getElementById('iotext').value = r.result; ioMsg(f.name + ' cargado'); };
  r.readAsText(f); e.target.value = '';
});

function newPlan() {
  const p = { id: uid(), title: 'Nueva planificación', blocks: [] };
  state.plans.push(p); state.current = p.id; save(); focusSel = '#ptitle'; render();
}
function select(id) { state.current = id; save(); render(); }
function arm(btn) {
  disarm(); armedEl = btn; btn.dataset.t = btn.textContent; btn.textContent = '¿Borrar?'; btn.classList.add('armed');
  armedTimer = setTimeout(disarm, 2500);
}
function disarm() {
  clearTimeout(armedTimer);
  if (armedEl && armedEl.isConnected) { armedEl.textContent = armedEl.dataset.t; armedEl.classList.remove('armed'); }
  armedEl = null;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) { disarm(); return; }
  if (t.dataset.act === 'toggle' && e.target.closest('input,button,.grip')) return;
  const act = t.dataset.act, bid = t.closest('[data-b]')?.dataset.b;
  if (['delplan', 'delblock'].includes(act) && armedEl !== t) { e.stopPropagation(); arm(t); return; }
  disarm();
  if (act === 'newplan') newPlan();
  else if (act === 'select') select(t.dataset.p);
  else if (act === 'delplan') {
    const i = state.plans.findIndex(p => p.id === t.dataset.p);
    state.plans.splice(i, 1);
    if (state.current === t.dataset.p) state.current = (state.plans[i] || state.plans[i - 1] || {}).id || null;
    save(); render();
  }
  else if (act === 'tpl') addTemplate(t.dataset.n);
  else if (act === 'io-open') openIO();
  else if (act === 'io-close') closeIO();
  else if (act === 'io-mode') { dlg.mode = t.dataset.m; fillIO(); }
  else if (act === 'io-copy') copyIO();
  else if (act === 'io-dl') dlIO();
  else if (act === 'io-do') doImport();
  else if (act === 'io-pick') document.getElementById('iofile').click();
  else if (act === 'toggle') { const b = findBlock(bid); b.open = !b.open; save(); focusSel = b.open ? `[data-b="${bid}"] .addstep` : null; render(); }
  else if (act === 'delblock') { const p = plan(); p.blocks = p.blocks.filter(b => b.id !== bid); save(); render(); }
  else if (act === 'delstep') { const b = findBlock(bid); b.steps = b.steps.filter(s => s.id !== t.closest('.step').dataset.s); save(); focusSel = `[data-b="${bid}"] .addstep`; render(); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'ptitle') { plan().title = t.value; save(); renderSide(); }
  else if (t.classList.contains('btitle')) { findBlock(t.closest('[data-b]').dataset.b).title = t.value; save(); }
  else if (t.classList.contains('stext')) {
    const b = findBlock(t.closest('[data-b]').dataset.b);
    b.steps.find(s => s.id === t.closest('.step').dataset.s).text = t.value; save();
  }
});
document.addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  const b = findBlock(e.target.closest('[data-b]').dataset.b);
  b.steps.find(s => s.id === e.target.closest('.step').dataset.s).done = e.target.checked; save(); render();
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Escape' && !document.getElementById('io').hidden) { closeIO(); return; }
  if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newPlan(); return; }
  if (e.altKey && e.code === 'KeyB') { e.preventDefault(); const n = document.getElementById('newblock'); if (n) n.focus(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const i = state.plans.findIndex(p => p.id === state.current), j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (state.plans[j]) select(state.plans[j].id); return;
  }
  if (!t.matches || !t.matches('input')) return;
  if (e.key === 'Escape') { t.blur(); return; }
  const sec = t.closest('[data-b]'), bid = sec?.dataset.b;

  if (t.classList.contains('addstep') && e.key === 'Enter') {
    const v = t.value.trim(); if (!v) return;
    findBlock(bid).steps.push({ id: uid(), text: v, done: false }); save();
    focusSel = `[data-b="${bid}"] .addstep`; render();
  } else if (t.id === 'newblock' && e.key === 'Enter') {
    const v = t.value.trim(); if (!v) return;
    const b = { id: uid(), title: v, open: true, steps: [] };
    plan().blocks.push(b); save(); focusSel = `[data-b="${b.id}"] .addstep`; render();
  } else if ((t.id === 'ptitle' || t.classList.contains('btitle')) && e.key === 'Enter') {
    t.blur();
  } else if (t.classList.contains('stext')) {
    if (e.key === 'Enter') { e.preventDefault(); sec.querySelector('.addstep').focus(); }
    else if (e.key === 'Backspace' && !t.value) {
      e.preventDefault();
      const b = findBlock(bid); b.steps = b.steps.filter(s => s.id !== t.closest('.step').dataset.s);
      save(); focusSel = `[data-b="${bid}"] .addstep`; render();
    }
  }
  if (sec && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && (t.classList.contains('stext') || t.classList.contains('addstep'))) {
    e.preventDefault();
    const f = [...sec.querySelectorAll('.stext,.addstep')], i = f.indexOf(t), n = f[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) n.focus();
  }
});

render();
