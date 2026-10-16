const KEY = 'planner.v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function seed() {
  const id = uid();
  return { current: id, plans: [{ id, title: 'Mi primer proyecto', blocks: [
    { id: uid(), title: 'Arquitectura del proyecto', open: true, noteOpen: false, noteEdit: false,
      note: 'Anotá ideas sueltas acá, sin forzarlas a paso. Podés incluir bloques de código:\n\n```js\nconst app = createApp();\napp.listen(3000);\n```',
      notes: [
        { t: 'text', lang: '', text: 'Anotá ideas sueltas acá, sin forzarlas a paso. Podés incluir bloques de código:' },
        { t: 'code', lang: 'js', text: 'const app = createApp();\napp.listen(3000);' }
      ], steps: [
      { id: uid(), text: 'Definir capas y estructura de carpetas', done: false, noteOpen: false, note: 'Controller → Service → Repository. La lógica va en el service, las rutas sólo orquestan.' },
      { id: uid(), text: 'Elegir stack y dependencias', done: false, noteOpen: false, note: '' }] },
    { id: uid(), title: 'Decisiones de diseño', open: false, noteOpen: false, noteEdit: false, note: '', notes: [], steps: [] },
    { id: uid(), title: 'Definición de modelos', open: false, noteOpen: false, noteEdit: false, note: '', notes: [], steps: [] }
  ] }] };
}
function migrate(s) {
  (s.plans || []).forEach(p => {
    if (!Array.isArray(p.blocks)) p.blocks = [];
    p.blocks.forEach(b => {
      if (typeof b.note !== 'string') b.note = '';
      if (!Array.isArray(b.notes)) b.notes = stringToNotes(b.note);
      if (typeof b.noteOpen !== 'boolean') b.noteOpen = false;
      if (typeof b.noteEdit !== 'boolean') b.noteEdit = false;
      if (!Array.isArray(b.steps)) b.steps = [];
      b.steps.forEach(st => {
        if (typeof st.note !== 'string') st.note = '';
        if (typeof st.noteOpen !== 'boolean') st.noteOpen = false;
      });
    });
  });
  return s;
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.plans)) return migrate(s); } catch (e) {}
  return seed();
}
let state = load();
let focusSel = null, armedEl = null, armedTimer = null;
let search = '', pending = false, flashSel = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const plan = () => state.plans.find(p => p.id === state.current) || null;
const findBlock = id => plan().blocks.find(b => b.id === id);
/* Ubica plan / bloque / paso de cualquier parte del DOM (sirve en vista plan, pendientes y búsqueda) */
function locate(el) {
  const pid = el.closest('[data-p]')?.dataset.p || state.current;
  const bid = el.closest('[data-b]')?.dataset.b;
  const sid = el.closest('[data-s]')?.dataset.s;
  const p = state.plans.find(x => x.id === pid);
  const b = p?.blocks.find(x => x.id === bid);
  const s = b?.steps.find(x => x.id === sid);
  return { p, b, s };
}

function renderSide() {
  const el = document.getElementById('plans');
  const planView = !pending && !search.trim();
  el.innerHTML = state.plans.map(p => `
    <div class="plan ${planView && p.id === state.current ? 'active' : ''}" data-act="select" data-p="${p.id}">
      <span>${esc(p.title || 'Sin título')}</span>
      <button class="x" data-act="delplan" data-p="${p.id}" title="Borrar">✕</button>
    </div>`).join('');
  const pb = document.querySelector('[data-act="pending"]');
  if (pb) pb.classList.toggle('on', pending);
}
function renderMain() {
  const m = document.getElementById('main');
  if (search.trim()) return renderSearch(m);
  if (pending) return renderPending(m);
  const p = plan();
  if (!p) {
    m.innerHTML = `<div class="empty">No hay planificaciones todavía.<br><button data-act="newplan">+ Crear una</button></div>`;
    return;
  }
  const all = p.blocks.flatMap(b => b.steps), done = all.filter(s => s.done).length;
  m.innerHTML = `
    <div class="top"><input id="ptitle" value="${esc(p.title)}" placeholder="Título de la planificación" spellcheck="false"><span class="count">${done}/${all.length} pasos</span></div>
    ${p.blocks.map(b => {
      if (!Array.isArray(b.notes)) b.notes = stringToNotes(b.note);
      const d = b.steps.filter(s => s.done).length, pct = b.steps.length ? Math.round(d / b.steps.length * 100) : 0;
      const complete = b.steps.length > 0 && d === b.steps.length;
      return `<section class="block ${b.open ? 'open' : ''} ${complete ? 'complete' : ''}" data-b="${b.id}">
        <div class="block-h" data-act="toggle">
          <span class="grip" draggable="true" title="Arrastrar bloque">⋮⋮</span>
          <span class="chev">▶</span>
          <input class="btitle" value="${esc(b.title)}" placeholder="Nombre del bloque" spellcheck="false">
          ${complete ? '<span class="donecheck" title="Bloque completado">✓</span>' : ''}
          <span class="prog">${d}/${b.steps.length}</span>
          <button class="notebtn ${b.note ? 'has' : ''}" data-act="note-toggle" title="${b.note ? 'Editar nota del bloque' : 'Añadir nota libre'}">✎</button>
          <button class="x" data-act="delblock" title="Borrar bloque">✕</button>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${b.open ? `<div class="body">
          ${b.steps.map(s => `<div class="step ${s.done ? 'done' : ''}" data-s="${s.id}">
            <span class="grip" draggable="true" title="Arrastrar paso">⋮⋮</span><input type="checkbox" ${s.done ? 'checked' : ''}>
            <div class="step-main">
              <input class="stext" value="${esc(s.text)}" spellcheck="false">
              ${s.noteOpen
                ? `<textarea class="snote" placeholder="Detalle del paso… (texto libre)">${esc(s.note)}</textarea>`
                : (s.note ? `<div class="snote-preview" data-act="stepnote" data-s="${s.id}">${esc(s.note)}</div>` : '')}
            </div>
            <button class="det" data-act="stepnote" data-s="${s.id}" title="${s.noteOpen ? 'Ocultar detalle' : 'Añadir detalle'}">${s.noteOpen ? '▾' : (s.note ? '▸' : '＋')}</button>
            <button class="x" data-act="delstep" title="Borrar paso">✕</button></div>`).join('')}
          ${(b.noteOpen || b.noteEdit) ? `<div class="note">
            ${b.noteEdit
              ? `<div class="noteedit">
                  ${(b.notes.length ? b.notes : [{ t: 'text', lang: '', text: '' }]).map((seg, i) => seg.t === 'code'
                    ? `<div class="nseg nseg-code">
                        <div class="nseg-head">
                          <span class="nseg-tag">&lt;/&gt; código</span>
                          <input class="seglang" data-i="${i}" value="${esc(seg.lang)}" placeholder="lenguaje (opcional)" spellcheck="false">
                          <button class="nseg-x" data-act="note-del-seg" data-i="${i}" title="Quitar bloque de código">✕</button>
                        </div>
                        <textarea class="segcode" data-i="${i}" placeholder="Pegá o escribí tu código acá… (Ctrl+Enter guarda)" spellcheck="false">${esc(seg.text)}</textarea>
                      </div>`
                    : `<div class="nseg nseg-text">
                        <textarea class="segtext" data-i="${i}" placeholder="Texto libre… (Enter nueva nota · Shift+Enter nueva línea · Esc salir)">${esc(seg.text)}</textarea>
                        <button class="nseg-x" data-act="note-del-seg" data-i="${i}" title="Quitar texto">✕</button>
                      </div>`).join('')}
                  <div class="note-actions">
                    <button class="ghost" data-act="note-add-text">＋ Texto</button>
                    <button class="code-btn" data-act="note-add-code" title="Agregar un bloque de código">&lt;/&gt; Código</button>
                    <button class="pri-sm" data-act="note-done">Listo</button>
                  </div>
                </div>`
              : b.note
                ? `<div class="noterender" data-act="note-edit" title="Editar nota">${renderNote(b.notes, b.note)}</div>`
                : `<button class="note-add" data-act="note-edit">＋ Añadir nota (Ctrl + M)</button>`}
          </div>` : ''}
          <input class="addstep" placeholder="Añadir paso… (Enter)" spellcheck="false">
        </div>` : ''}
      </section>`;
    }).join('')}
    <div class="newblock"><div class="tpls"><span>Plantillas</span>${Object.keys(TPL).map(n => `<button data-act="tpl" data-n="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div><input id="newblock" placeholder="+ Nuevo bloque (Enter)  ·  ej: Arquitectura, Modelos…" spellcheck="false"></div>`;
}

/* ---------- Notas (texto libre + bloques de código) ---------- */
/* La nota se edita como segmentos: texto plano o código. b.note queda como
   string canónico (con fences ```) para búsqueda, render y exportación. */
function stringToNotes(s) {
  const out = [];
  String(s || '').split(/```/).forEach((part, i) => {
    if (i % 2 === 1) {
      let code = part, lang = '';
      if (code.startsWith('\n')) code = code.slice(1);
      else {
        const nl = code.indexOf('\n');
        if (nl >= 0) {
          const first = code.slice(0, nl).trim();
          if (first && /^[\w+#.-]{1,20}$/.test(first)) { lang = first; code = code.slice(nl + 1); }
        }
      }
      code = code.replace(/\n$/, '');
      out.push({ t: 'code', lang, text: code });
    } else {
      const txt = part.replace(/^\n+|\n+$/g, '');
      if (txt.trim()) out.push({ t: 'text', lang: '', text: txt });
    }
  });
  return out;
}
function notesToString(notes) {
  return (notes || []).map(seg => seg.t === 'code'
    ? '```' + (seg.lang || '') + '\n' + seg.text + '\n```'
    : seg.text).filter(x => x && String(x).trim()).join('\n\n');
}
function renderNote(notes, fallbackText = '') {
  const segs = Array.isArray(notes) ? notes : stringToNotes(notes);
  if (!segs.length) return fallbackText ? `<div class="notetext">${esc(fallbackText)}</div>` : '';
  return segs.map(seg => seg.t === 'code'
    ? `<pre class="code">${seg.lang ? `<span class="lang">${esc(seg.lang)}</span>` : ''}<code>${esc(seg.text)}</code></pre>`
    : `<div class="notetext">${esc(seg.text)}</div>`).join('');
}

/* ---------- Búsqueda global ---------- */
function hl(text, q) {
  const s = String(text || ''), ql = q.toLowerCase();
  if (!ql) return esc(s);
  const lower = s.toLowerCase();
  let out = '', i = 0;
  while (true) {
    const j = lower.indexOf(ql, i);
    if (j < 0) { out += esc(s.slice(i)); break; }
    out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + ql.length)) + '</mark>';
    i = j + ql.length;
  }
  return out;
}
function snippet(text, q, len = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const idx = s.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return s.slice(0, len) + (s.length > len ? '…' : '');
  const start = Math.max(0, idx - 40);
  return (start ? '…' : '') + s.slice(start, start + len) + (s.length > start + len ? '…' : '');
}
function searchAll(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const p of state.plans) {
    const planHit = (p.title || '').toLowerCase().includes(s);
    const hits = [];
    for (const b of p.blocks) {
      const blockHit = (b.title || '').toLowerCase().includes(s) || (b.note || '').toLowerCase().includes(s);
      const stepHits = b.steps.filter(st => (st.text || '').toLowerCase().includes(s) || (st.note || '').toLowerCase().includes(s));
      if (blockHit || stepHits.length) hits.push({ block: b, blockHit, stepHits });
    }
    if (planHit || hits.length) out.push({ plan: p, planHit, hits, planOnly: planHit && !hits.length });
  }
  return out;
}
function renderSearch(m) {
  const q = search.trim(), res = searchAll(q), total = res.reduce((n, r) => n + r.hits.reduce((a, h) => a + h.stepHits.length + (h.blockHit ? 1 : 0), 0) + (r.planOnly ? 1 : 0), 0);
  m.innerHTML = `
    <div class="view-head">
      <h2>Buscar</h2><span class="count">${total} coincidencia${total === 1 ? '' : 's'}</span>
      <button class="ghost" data-act="clear-search">Limpiar</button>
    </div>
    ${res.length ? res.map(r => `
      <div class="sres-plan">
        <div class="sres-plan-title" data-act="goto-plan" data-p="${r.plan.id}">${hl(r.plan.title || 'Sin título', q)}${r.planHit ? ' <span class="tag">planificación</span>' : ''}</div>
        ${r.planOnly ? '<div class="sres-empty">Coincide con el nombre de la planificación.</div>' : r.hits.map(h => `
          <div class="sres-block">
            <div class="sres-block-title" data-act="goto-block" data-p="${r.plan.id}" data-b="${h.block.id}">${hl(h.block.title || 'Bloque sin título', q)}</div>
            ${h.blockHit && h.block.note ? `<div class="sres-note" data-act="goto-block" data-p="${r.plan.id}" data-b="${h.block.id}">${hl(snippet(h.block.note, q), q)}</div>` : ''}
            ${h.stepHits.map(st => `<div class="sres-step" data-act="goto-step" data-p="${r.plan.id}" data-b="${h.block.id}" data-s="${st.id}">
              <span class="dot ${st.done ? 'done' : ''}"></span>${hl(st.text || '(sin título)', q)}${st.note && st.note.toLowerCase().includes(q.toLowerCase()) ? `<span class="sres-sub">${hl(snippet(st.note, q, 90), q)}</span>` : ''}
            </div>`).join('')}
          </div>`).join('')}
      </div>`).join('') : `<div class="empty">Sin resultados para “${esc(q)}”.</div>`}
  `;
}

/* ---------- Vista pendientes ---------- */
function renderPending(m) {
  const groups = state.plans.map(p => ({
    p, items: p.blocks.flatMap(b => b.steps.filter(s => !s.done).map(s => ({ b, s })))
  })).filter(g => g.items.length);
  const totalPending = groups.reduce((n, g) => n + g.items.length, 0);
  const totalDone = state.plans.reduce((n, p) => n + p.blocks.reduce((a, b) => a + b.steps.filter(s => s.done).length, 0), 0);
  m.innerHTML = `
    <div class="view-head">
      <h2>Qué me queda pendiente</h2><span class="count">${totalPending} pendiente${totalPending === 1 ? '' : 's'}</span>
      <button class="ghost" data-act="home">Volver</button>
    </div>
    ${totalPending ? groups.map(g => `
      <div class="pgroup">
        <div class="pgroup-h" data-act="goto-plan" data-p="${g.p.id}">${esc(g.p.title || 'Sin título')}<span class="prog">${g.items.length}</span></div>
        ${g.items.map(({ b, s }) => `
          <label class="pitem" data-p="${g.p.id}" data-b="${b.id}" data-s="${s.id}">
            <input type="checkbox">
            <span class="pitem-main">
              <span class="pitem-text">${esc(s.text || 'Sin título')}</span>
              <span class="pitem-meta">${esc(b.title || 'Bloque')}${s.note ? ' · con detalle' : ''}</span>
            </span>
          </label>`).join('')}
      </div>`).join('')
      : `<div class="empty">¡Todo completado! 🎉${totalDone ? `<br><span class="muted">${totalDone} pasos tachados en total.</span>` : ''}</div>`}
  `;
}

function render() {
  renderSide(); renderMain();
  if (focusSel) { const e = document.querySelector(focusSel); if (e) { e.focus(); if (e.select && e.id === 'ptitle') e.select(); } focusSel = null; }
  if (flashSel) {
    const e = document.querySelector(flashSel);
    if (e) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 1600); }
    flashSel = null;
  }
}
function goto(pid, bid, sid) {
  pending = false; search = '';
  const si = document.getElementById('search'); if (si) si.value = '';
  state.current = pid;
  const p = state.plans.find(x => x.id === pid);
  if (p && bid) { const b = p.blocks.find(x => x.id === bid); if (b) b.open = true; }
  flashSel = sid ? `[data-s="${sid}"]` : bid ? `[data-b="${bid}"]` : null;
  save(); render();
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
  Object.entries(TPL[n]).forEach(([title, steps], i) => p.blocks.push({
    id: uid(), title, open: i === 0, noteOpen: false, noteEdit: false, note: '', notes: [],
    steps: steps.map(text => ({ id: uid(), text, done: false, noteOpen: false, note: '' }))
  }));
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
const toMd = p => !p ? '' : `# ${p.title}\n\n` + p.blocks.map(b => {
  let s = `## ${b.title}\n`;
  if (b.note) s += '\n' + b.note + '\n';
  s += b.steps.map(st => {
    let line = `- [${st.done ? 'x' : ' '}] ${st.text}`;
    if (st.note) line += '\n  ' + st.note.replace(/\n/g, '\n  ');
    return line;
  }).join('\n');
  return s;
}).join('\n\n') + '\n';
const ioText = () => dlg.mode === 'json' ? JSON.stringify({ plans: state.plans }, null, 2) : toMd(plan());
const ioMsg = t => { document.getElementById('iomsg').textContent = t; };
function openIO() { dlg.mode = 'json'; document.getElementById('io').hidden = false; fillIO(); }
function closeIO() { document.getElementById('io').hidden = true; }
function fillIO() {
  const m = dlg.mode, ta = document.getElementById('iotext'), imp = m === 'import';
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  ta.value = imp ? '' : ioText(); ta.readOnly = !imp;
  ta.placeholder = 'Pegá un JSON exportado o un Markdown (# Plan, ## Bloque, - [ ] paso; texto suelto → nota)';
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
const normNotes = b => Array.isArray(b.notes)
  ? b.notes.map(s => ({ t: s.t === 'code' ? 'code' : 'text', lang: String(s.lang || ''), text: String(s.text || '') }))
  : stringToNotes(String(b.note || ''));
const norm = p => ({ id: uid(), title: String(p.title || 'Importada'), blocks: (p.blocks || []).map(b => {
  const notes = normNotes(b);
  return { id: uid(), title: String(b.title || ''), open: false, note: notesToString(notes), notes, noteOpen: false, noteEdit: false,
    steps: (b.steps || []).map(s => ({ id: uid(), text: String(s.text || ''), done: !!s.done, note: String(s.note || ''), noteOpen: false })) };
}) });
function parseMd(txt) {
  const plans = []; let p = null, b = null, curStep = null, m;
  const cur = () => { if (!p) { p = { id: uid(), title: 'Importada', blocks: [] }; plans.push(p); } return p; };
  const newBlock = title => { b = { id: uid(), title, open: false, note: '', notes: [], noteOpen: false, noteEdit: false, steps: [] }; cur().blocks.push(b); curStep = null; };
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim();
    if ((m = l.match(/^#\s+(.+)/))) { p = { id: uid(), title: m[1], blocks: [] }; plans.push(p); b = null; curStep = null; }
    else if ((m = l.match(/^##\s+(.+)/))) { newBlock(m[1]); }
    else if ((m = l.match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.+)/))) {
      if (!b) newBlock('General');
      curStep = { id: uid(), text: m[2], done: !!m[1] && m[1] !== ' ', note: '', noteOpen: false };
      b.steps.push(curStep);
    }
    else if (/^\s+\S/.test(raw) && curStep) { curStep.note = (curStep.note ? curStep.note + '\n' : '') + l; }
    else if (l && b) { b.note = (b.note ? b.note + '\n' : '') + l; }
  }
  plans.forEach(p => p.blocks.forEach(b => { b.notes = stringToNotes(b.note); }));
  return plans;
}
function doImport() {
  const txt = document.getElementById('iotext').value.trim();
  if (!txt) { ioMsg('Pegá algo primero'); return; }
  let plans = [];
  try { const d = JSON.parse(txt); plans = (d.plans || (d.blocks ? [d] : [])).map(norm); }
  catch (e) { plans = parseMd(txt); }
  if (!plans.length) { ioMsg('No se encontró ninguna planificación'); return; }
  state.plans.push(...plans); state.current = plans[0].id; pending = false; search = ''; save(); closeIO(); render();
}
document.getElementById('iofile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { document.getElementById('iotext').value = r.result; ioMsg(f.name + ' cargado'); };
  r.readAsText(f); e.target.value = '';
});

function newPlan() {
  const p = { id: uid(), title: 'Nueva planificación', blocks: [] };
  state.plans.push(p); state.current = p.id; pending = false; search = '';
  const si = document.getElementById('search'); if (si) si.value = '';
  save(); focusSel = '#ptitle'; render();
}
function select(id) {
  state.current = id; pending = false; search = '';
  const si = document.getElementById('search'); if (si) si.value = '';
  save(); render();
}
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
  else if (act === 'home') { pending = false; search = ''; const si = document.getElementById('search'); if (si) si.value = ''; render(); }
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
  else if (act === 'toggle') {
    const b = findBlock(bid);
    b.open = !b.open;
    save();
    focusSel = b.open
      ? (b.noteEdit ? `[data-b="${bid}"] .segtext, [data-b="${bid}"] .segcode` : `[data-b="${bid}"] .addstep`)
      : null;
    render();
  }
  else if (act === 'delblock') { const p = plan(); p.blocks = p.blocks.filter(b => b.id !== bid); save(); render(); }
  else if (act === 'delstep') { const b = findBlock(bid); b.steps = b.steps.filter(s => s.id !== t.closest('.step').dataset.s); save(); focusSel = `[data-b="${bid}"] .addstep`; render(); }
  else if (act === 'pending') { pending = true; search = ''; const si = document.getElementById('search'); if (si) si.value = ''; render(); }
  else if (act === 'clear-search') { search = ''; const si = document.getElementById('search'); if (si) si.value = ''; render(); }
  else if (act === 'note-toggle') {
    const b = findBlock(bid);
    if (!Array.isArray(b.notes)) b.notes = stringToNotes(b.note);
    b.open = true;
    b.noteOpen = !b.noteOpen;
    b.noteEdit = b.noteOpen;
    if (b.noteOpen && !b.note && !b.notes.length) b.notes.push({ t: 'text', lang: '', text: '' });
    if (b.noteOpen && !b.note) focusSel = `[data-b="${b.id}"] .segtext[data-i="0"]`;
    save(); render();
  }
  else if (act === 'note-edit') {
    const b = findBlock(bid);
    if (!Array.isArray(b.notes)) b.notes = stringToNotes(b.note);
    b.open = true; b.noteOpen = true; b.noteEdit = true;
    if (!b.note && !b.notes.length) b.notes.push({ t: 'text', lang: '', text: '' });
    save(); focusSel = `[data-b="${b.id}"] .segtext[data-i="0"], [data-b="${b.id}"] .segcode[data-i="0"]`; render();
  }
  else if (act === 'note-done') { const b = findBlock(bid); b.noteEdit = false; save(); render(); }
  else if (act === 'note-add-text') {
    const b = findBlock(bid), i = b.notes.push({ t: 'text', lang: '', text: '' }) - 1;
    save(); focusSel = `[data-b="${b.id}"] .segtext[data-i="${i}"]`; render();
  }
  else if (act === 'note-add-code') {
    const b = findBlock(bid), i = b.notes.push({ t: 'code', lang: '', text: '' }) - 1;
    save(); focusSel = `[data-b="${b.id}"] .segcode[data-i="${i}"]`; render();
  }
  else if (act === 'note-del-seg') {
    const b = findBlock(bid);
    b.notes.splice(+t.dataset.i, 1);
    b.note = notesToString(b.notes);
    if (!b.notes.length) { b.noteEdit = false; }
    save(); render();
  }
  else if (act === 'stepnote') {
    const b = findBlock(bid), s = b.steps.find(x => x.id === t.dataset.s);
    s.noteOpen = !s.noteOpen; if (s.noteOpen) focusSel = `[data-s="${s.id}"] .snote`;
    save(); render();
  }
  else if (act === 'goto-plan') goto(t.dataset.p, null, null);
  else if (act === 'goto-block') goto(t.dataset.p, t.dataset.b, null);
  else if (act === 'goto-step') goto(t.dataset.p, t.dataset.b, t.dataset.s);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { search = t.value; if (pending) pending = false; renderSide(); renderMain(); return; }
  if (t.id === 'ptitle') { plan().title = t.value; save(); renderSide(); }
  else if (t.classList.contains('btitle')) { const { b } = locate(t); if (b) { b.title = t.value; save(); } }
  else if (t.classList.contains('stext')) { const { s } = locate(t); if (s) { s.text = t.value; save(); } }
  else if (t.classList.contains('segtext') || t.classList.contains('segcode')) {
    const { b } = locate(t);
    if (b && b.notes[+t.dataset.i]) { b.notes[+t.dataset.i].text = t.value; b.note = notesToString(b.notes); save(); }
  }
  else if (t.classList.contains('seglang')) {
    const { b } = locate(t);
    if (b && b.notes[+t.dataset.i]) { b.notes[+t.dataset.i].lang = t.value; b.note = notesToString(b.notes); save(); }
  }
  else if (t.classList.contains('snote')) { const { s } = locate(t); if (s) { s.note = t.value; save(); } }
});
document.addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  const { s } = locate(e.target);
  if (s) { s.done = e.target.checked; save(); render(); }
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    const current = plan();
    const blockEl = t.closest?.('[data-b]');
    const b = blockEl ? findBlock(blockEl.dataset.b) : current?.blocks.find(x => x.open) || current?.blocks[0];
    if (!b) return;
    if (!Array.isArray(b.notes)) b.notes = stringToNotes(b.note);
    const i = b.notes.push({ t: 'text', lang: '', text: '' }) - 1;
    b.open = true; b.noteOpen = true; b.noteEdit = true;
    save(); focusSel = `[data-b="${b.id}"] .segtext[data-i="${i}"]`; render();
    return;
  }
  if (t.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') {
      if (t.classList.contains('segtext') || t.classList.contains('segcode')) {
        e.preventDefault();
        const { b } = locate(t);
        if (b) {
          b.note = notesToString(b.notes);
          b.notes = b.notes.filter(seg => seg.text.trim() || (seg.t === 'code' && seg.lang.trim()));
          b.note = notesToString(b.notes);
          b.noteEdit = false;
          if (!b.notes.length && !b.note) b.noteOpen = false;
          save(); render();
        }
      } else t.blur();
      return;
    }
    if (t.classList.contains('segtext') && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const { b } = locate(t);
      if (b) {
        const i = b.notes.push({ t: 'text', lang: '', text: '' }) - 1;
        b.note = notesToString(b.notes); save();
        focusSel = `[data-b="${b.id}"] .segtext[data-i="${i}"]`; render();
      }
    } else if (t.classList.contains('segcode') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const { b } = locate(t); if (b) { b.noteEdit = false; save(); render(); }
    }
    return;
  }
  if (e.key === 'Escape' && !document.getElementById('io').hidden) { closeIO(); return; }
  if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newPlan(); return; }
  if (e.altKey && e.code === 'KeyB') { e.preventDefault(); const n = document.getElementById('newblock'); if (n) n.focus(); return; }
  if (e.altKey && e.code === 'KeyF') { e.preventDefault(); const s = document.getElementById('search'); if (s) s.focus(); return; }
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
    findBlock(bid).steps.push({ id: uid(), text: v, done: false, note: '', noteOpen: false }); save();
    focusSel = `[data-b="${bid}"] .addstep`; render();
  } else if (t.id === 'newblock' && e.key === 'Enter') {
    const v = t.value.trim(); if (!v) return;
    const b = { id: uid(), title: v, open: true, note: '', notes: [], noteOpen: false, noteEdit: false, steps: [] };
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
