/* STRAM Suivi — composants d'interface : tableaux, formulaires, fenêtres, exports */
'use strict';
const UI = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const E = U.esc;

  /* ---------- Notifications ---------- */
  function toast(msg, type = 'ok') {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
  }

  /* ---------- Fenêtre modale ---------- */
  function modal({ title, body, wide, actions = [] }) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><header><h3>${E(title)}</h3><button class="icon-btn x" title="Fermer">✕</button></header><div class="mbody"></div><footer></footer></div>`;
    const mb = $('.mbody', ov); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
    const ft = $('footer', ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.onclick = () => { if (a.onClick && a.onClick() === false) return; if (!a.keep) close(); }; if (a.left) b.style.marginRight = 'auto'; ft.appendChild(b); });
    $('.x', ov).onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(ov);
    setTimeout(() => { const f = $('input:not([type=hidden]),select,textarea', mb); f && f.focus(); }, 50);
    return { el: ov, body: mb, close };
  }
  const confirm = (msg, onYes, label = 'Confirmer') => modal({ title: 'Confirmation', body: `<p>${E(msg)}</p>`, actions: [{ label: 'Annuler' }, { label, cls: 'danger', onClick: onYes }] });

  /* ---------- Formulaire générique ---------- */
  // fields: {k, label, type: text|number|date|time|select|textarea|checkbox|datalist, options:[{v,l}]|[str], required, full, hint, step}
  function form({ title, fields, value = {}, onSave, onDelete, wide, extra }) {
    const f = document.createElement('form'); f.className = 'grid-form'; f.noValidate = true;
    f.innerHTML = fields.map(fd => {
      if (fd.type === 'section') return `<div class="full fsection">${E(fd.label)}</div>`;
      const v = value[fd.k] ?? fd.default ?? '';
      const id = 'f_' + fd.k;
      let input;
      const opts = (fd.options || []).map(o => typeof o === 'object' ? o : { v: o, l: o });
      if (fd.type === 'select') input = `<select id="${id}" name="${fd.k}">${fd.required ? '' : '<option value="">—</option>'}${opts.map(o => `<option value="${E(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${E(o.l)}</option>`).join('')}</select>`;
      else if (fd.type === 'textarea') input = `<textarea id="${id}" name="${fd.k}" rows="${fd.rows || 3}">${E(v)}</textarea>`;
      else if (fd.type === 'checkbox') input = `<label class="chk"><input type="checkbox" id="${id}" name="${fd.k}" ${v ? 'checked' : ''}> ${E(fd.text || '')}</label>`;
      else if (fd.type === 'datalist') input = `<input id="${id}" name="${fd.k}" list="${id}_l" value="${E(v)}" autocomplete="off"><datalist id="${id}_l">${opts.map(o => `<option value="${E(o.v)}">`).join('')}</datalist>`;
      else input = `<input id="${id}" name="${fd.k}" type="${fd.type || 'text'}" value="${E(v)}" ${fd.step ? `step="${fd.step}"` : (fd.type === 'number' ? 'step="any"' : '')} ${fd.min !== undefined ? `min="${fd.min}"` : ''} ${fd.max !== undefined ? `max="${fd.max}"` : ''} ${fd.placeholder ? `placeholder="${E(fd.placeholder)}"` : ''}>`;
      return `<div class="field ${fd.full ? 'full' : ''}"><label for="${id}">${E(fd.label)}${fd.required ? ' <b class="req">*</b>' : ''}</label>${input}${fd.hint ? `<small>${E(fd.hint)}</small>` : ''}</div>`;
    }).join('');
    if (extra) { const x = document.createElement('div'); x.className = 'full'; x.appendChild(extra); f.appendChild(x); }
    const read = () => {
      const out = {};
      fields.forEach(fd => {
        if (fd.type === 'section') return;
        const el = f.elements[fd.k]; if (!el) return;
        out[fd.k] = fd.type === 'checkbox' ? el.checked : fd.type === 'number' ? (el.value === '' ? '' : U.num(el.value)) : el.value.trim();
      });
      return out;
    };
    const actions = [];
    if (onDelete) actions.push({ label: 'Supprimer', cls: 'danger ghost', left: true, onClick: () => { confirm('Supprimer définitivement cet élément ?', () => { onDelete(); m.close(); }, 'Supprimer'); return false; } });
    actions.push({ label: 'Annuler' });
    actions.push({ label: 'Enregistrer', cls: 'primary', onClick: () => {
      const v = read();
      const miss = fields.filter(fd => fd.required && (v[fd.k] === '' || v[fd.k] === undefined));
      $$('.field', f).forEach(x => x.classList.remove('err'));
      if (miss.length) { miss.forEach(fd => f.elements[fd.k]?.closest('.field').classList.add('err')); toast('Champs obligatoires manquants : ' + miss.map(m => m.label).join(', '), 'err'); return false; }
      let r; try { r = onSave(v, f); } catch (e) { toast(e.message, 'err'); if (!e.droits) console.error(e); return false; } if (r === false) return false;
    } });
    f.addEventListener('submit', e => e.preventDefault());
    const m = modal({ title, body: f, wide, actions });
    return { modal: m, form: f, read };
  }

  /* ---------- Tableau triable / filtrable ---------- */
  // cols: {k, label, render(row) -> html, sort(row) -> value, cls, sum(rows) -> html, w}
  function table(host, { cols, rows, onRow, empty = 'Aucun élément.', sortKey, sortDir = 1, footer, rowCls, id }) {
    const st = table._state[id] || { k: sortKey, d: sortDir }; table._state[id] = st;
    const col = cols.find(c => c.k === st.k);
    let data = [...rows];
    if (col) { const g = col.sort || (r => r[col.k]); data.sort((a, b) => { const x = g(a), y = g(b); return ((x ?? '') > (y ?? '') ? 1 : (x ?? '') < (y ?? '') ? -1 : 0) * st.d; }); }
    const wrap = document.createElement('div'); wrap.className = 'tbl-wrap';
    wrap.innerHTML = `<table class="tbl"><thead><tr>${cols.map(c => `<th data-k="${c.k}" class="${c.cls || ''} ${c.nosort ? '' : 'sortable'} ${st.k === c.k ? (st.d > 0 ? 'asc' : 'desc') : ''}" ${c.w ? `style="width:${c.w}"` : ''}>${E(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${data.length ? data.map((r, i) => `<tr data-i="${i}" class="${onRow ? 'click' : ''} ${rowCls ? rowCls(r) || '' : ''}">${cols.map(c => `<td class="${c.cls || ''}">${c.render ? c.render(r) : E(r[c.k])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">${E(empty)}</td></tr>`}</tbody>
      ${footer || cols.some(c => c.sum) ? `<tfoot><tr>${cols.map(c => `<td class="${c.cls || ''}">${c.sum ? c.sum(data) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    $$('th.sortable', wrap).forEach(th => th.onclick = () => { const k = th.dataset.k; if (st.k === k) st.d = -st.d; else { st.k = k; st.d = 1; } table(host, arguments[1]); });
    if (onRow) $$('tbody tr[data-i]', wrap).forEach(tr => tr.onclick = e => { if (e.target.closest('button,a,input')) return; onRow(data[+tr.dataset.i]); });
    host.innerHTML = ''; host.appendChild(wrap);
    return data;
  }
  table._state = {};

  /* ---------- Petits éléments ---------- */
  const badge = (t, c = '') => `<span class="badge ${c}">${E(t)}</span>`;
  const bar = (v, c = '', label) => `<div class="pbar ${c}" title="${label ?? Math.round(v) + ' %'}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i><span>${label ?? Math.round(v) + ' %'}</span></div>`;
  const kpi = (label, value, sub = '', cls = '', icon = '') => `<div class="kpi ${cls}"><div class="kl">${icon ? `<span class="ki">${icon}</span>` : ''}${E(label)}</div><div class="kv ${String(value).replace(/<[^>]+>/g, '').length > 11 ? 'long' : ''}">${value}</div><div class="ks">${sub}</div></div>`;
  const opts = (rows, label = 'nom') => rows.map(r => ({ v: r.id, l: typeof label === 'function' ? label(r) : r[label] }));

  /* ---------- Exports ---------- */
  function download(name, content, mime = 'application/json') {
    if (S.host && S.host.saveFile && typeof content === 'string') { S.host.saveFile(name, content).then(p => p && toast('Fichier enregistré : ' + p)); return; }
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(name, sheets) { // sheets: {Nom: [[...],[...]]}
    if (!window.XLSX) { toast('Module Excel indisponible', 'err'); return; }
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([n, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = (rows[0] || []).map((_, j) => ({ wch: Math.min(60, Math.max(10, ...rows.slice(0, 200).map(r => String(r[j] ?? '').length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
    });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (S.host && S.host.saveBinary) { blob.arrayBuffer().then(b => S.host.saveBinary(name, new Uint8Array(b))).then(p => p && toast('Fichier enregistré : ' + p)); return; }
    download(name, blob);
  }
  function pickFile(accept, cb) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(r.result, f); if (/\.xlsx?$/.test(f.name)) r.readAsArrayBuffer(f); else r.readAsText(f); };
    i.click();
  }
  /* impression d'un document (bon de commande, bon de sortie, décompte…) */
  function docHTML(title, html) {
    const p = S.data.projet;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${E(title)}</title><style>
      @font-face{font-family:Jakarta;src:url('${location.href.replace(/[^/]*$/, '')}fonts/jakarta-400.woff2')}
      @font-face{font-family:Jakarta;font-weight:700;src:url('${location.href.replace(/[^/]*$/, '')}fonts/jakarta-700.woff2')}
      body{font-family:Jakarta,Aptos,'Segoe UI',Arial,sans-serif;color:#303337;margin:26px;font-size:11.5px}
      .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #555A61;padding-bottom:10px;margin-bottom:16px}
      .ph b{font-size:17px;color:#494D53}.logo{width:130px;height:46px;border:1px dashed #78A3C8;display:flex;align-items:center;justify-content:center;color:#A2A5AA;font-size:9px}
      h1{font-size:19px;color:#494D53;margin:0 0 12px}h2{font-size:14px;color:#494D53;margin:18px 0 8px;border-bottom:1px solid #C1D4E6;padding-bottom:4px}h3{font-size:12.5px;color:#494D53;margin:12px 0 6px}
      table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#555A61;color:#fff;text-align:left;font-weight:700}
      th,td{border:1px solid #D3D5D7;padding:5px 7px;vertical-align:top}.r{text-align:right}.sig{display:flex;gap:16px;margin-top:26px}.sig div{flex:1;border:1px solid #D3D5D7;min-height:90px;padding:6px}
      .muted{color:#6A717A}.kp{display:flex;gap:10px;margin:8px 0 4px}.kp div{flex:1;border:1px solid #D3D5D7;border-radius:8px;padding:8px 10px}.kp b{display:block;font-size:17px;color:#494D53}
      .bad{color:#A9593F;font-weight:700}.ok{color:#5E8A68;font-weight:700}.photos{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.photos img{width:100%;height:110px;object-fit:cover;border-radius:6px}
      .scurve{width:100%;height:auto}.scurve .prev{fill:none;stroke:#9A9DA2;stroke-width:2.5;stroke-dasharray:6 4}.scurve .reel{fill:none;stroke:#555A61;stroke-width:3}.scurve .area{fill:rgba(120,163,200,.18)}.scurve text{font-size:11px;fill:#6A717A}.scurve .grid{stroke:#C8D9E8}.scurve .today{stroke:#C6826A;stroke-width:1.5}
      .photos figure{margin:0}.photos figcaption{font-size:9px;color:#6A717A}.bar{height:9px;background:#CBDCEA;border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:#8D9197}
      @page{margin:12mm}@media print{body{margin:0}}</style></head><body>
      <div class="ph"><div class="logo">LOGO</div><div style="text-align:center"><b>${E(p.intitule || 'Projet ' + p.nom)}</b><br><span class="muted">${E(p.localisation || '')}</span></div><div class="logo">LOGO</div></div>
      <h1>${E(title)}</h1>${html}<p class="muted" style="margin-top:22px">Édité le ${U.fr(U.today())}${S.user ? ' par ' + E(S.user.nom) : ''} — STRAM Suivi</p></body></html>`;
  }
  function printDoc(title, html, opt = {}) {
    const doc = opt.brut ? html : docHTML(title, html);
    if (S.host && S.host.printHTML) { S.host.printHTML(doc); return; }
    const w = window.open('', '_blank'); if (!w) { toast('Autorisez les fenêtres pour imprimer', 'err'); return; }
    w.document.write(doc); w.document.close(); setTimeout(() => w.print(), 400);
  }

  return { docHTML, $, $$, toast, modal, confirm, form, table, badge, bar, kpi, opts, download, xlsx, pickFile, printDoc };
})();
