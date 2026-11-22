/* STRAM Suivi — composants terrain : photos, signature, QR codes, scan, PIN, PDF */
'use strict';
const UIX = (() => {
  const E = U.esc;

  /* ---------- Photos ---------- */
  // compresse une image (max 1280 px, JPEG 0,7) en data URL
  function compress(file, max = 1280, q = 0.7) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => { const img = new Image(); img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q)); }; img.onerror = () => rej(new Error('Image illisible')); img.src = r.result; };
      r.onerror = () => rej(r.error); r.readAsDataURL(file);
    });
  }
  /** Ouvre l'appareil photo (mobile) ou le sélecteur de fichiers ; rattache les photos à un élément */
  function addPhotos(cible, legende = '', onDone) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.setAttribute('capture', 'environment');
    i.onchange = async () => {
      let n = 0;
      for (const f of i.files) { try { const data = await compress(f); S.save('photos', { cible, date: U.today(), legende, data, auteur: S.user?.nom || '' }); n++; } catch (e) { UI.toast(e.message, 'err'); } }
      if (n) { S.log(`${n} photo(s) ajoutée(s)${legende ? ' — ' + legende : ''}`); UI.toast(`${n} photo(s) enregistrée(s)`); onDone && onDone(); }
    };
    i.click();
  }
  const photosOf = (col, id) => S.list('photos').filter(p => p.cible && p.cible.col === col && p.cible.id === id).sort(U.by('date'));
  function gallery(col, id, { add = true, legende = '' } = {}) {
    const box = document.createElement('div'); box.className = 'gallery';
    const draw = () => {
      const ps = photosOf(col, id);
      box.innerHTML = ps.map(p => `<button type="button" class="ph" data-id="${p.id}" title="${E(p.legende || '')} — ${U.fr(p.date)}"><img src="${p.data}" alt="${E(p.legende || 'Photo')}"></button>`).join('') +
        (add ? `<button type="button" class="ph add" title="Ajouter une photo">${APP.icon('camera', 22)}<span>Photo</span></button>` : '');
      UI.$$('.ph[data-id]', box).forEach(b => b.onclick = () => viewer(b.dataset.id, draw));
      const a = UI.$('.ph.add', box); if (a) a.onclick = () => addPhotos({ col, id }, legende, draw);
    };
    draw();
    return box;
  }
  function viewer(pid, after) {
    const p = S.get('photos', pid); if (!p) return;
    UI.modal({ title: p.legende || 'Photo', wide: true, body: `<img src="${p.data}" style="width:100%;border-radius:12px"><p class="muted small">${U.fr(p.date)}${p.auteur ? ' · ' + E(p.auteur) : ''}</p>`,
      actions: [{ label: 'Supprimer', cls: 'danger ghost', left: true, onClick: () => { S.remove('photos', pid, 'Photo supprimée'); after && after(); } }, { label: 'Fermer' }] });
  }

  /* ---------- Signature au doigt ---------- */
  function signaturePad(label = 'Signature du bénéficiaire') {
    const box = document.createElement('div'); box.className = 'sigpad';
    box.innerHTML = `<label class="lbl">${E(label)}</label><canvas width="520" height="150"></canvas><button type="button" class="btn xs ghost">Effacer</button>`;
    const c = UI.$('canvas', box), ctx = c.getContext('2d'); let drawing = false, empty = true;
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#3E3029';
    const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', e => { drawing = true; empty = false; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
    c.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
    c.addEventListener('pointerup', () => { drawing = false; });
    UI.$('button', box).onclick = () => { ctx.clearRect(0, 0, c.width, c.height); empty = true; };
    box.value = () => empty ? '' : c.toDataURL('image/png');
    return box;
  }

  /* ---------- QR codes ---------- */
  function qrSvg(text, size = 120) {
    if (typeof qrcode === 'undefined') return '';
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), s = size / (n + 8); let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${((c + 4) * s).toFixed(2)} ${((r + 4) * s).toFixed(2)}h${s.toFixed(2)}v${s.toFixed(2)}h-${s.toFixed(2)}z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;
  }
  const qrArticle = a => `STRAM:ART:${a.code}`;
  /** Scanne un QR code avec la caméra ; renvoie le texte lu */
  function scan(onText, opt = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { UI.toast('Caméra indisponible sur cet appareil', 'err'); return; }
    const body = document.createElement('div');
    body.innerHTML = `<video playsinline muted style="width:100%;border-radius:14px;background:#000"></video><p class="muted small">${opt.aide || "Placez l'étiquette QR de l'article dans le cadre."}</p><div class="field"><label>${opt.label || '… ou saisissez le code article'}</label><input id="scanManual" placeholder="${opt.ph || 'ex. ART-001'}"></div>`;
    let stream = null, stop = false;
    const m = UI.modal({ title: opt.titre || 'Scanner un article', body, actions: [{ label: 'Fermer' }, { label: 'Valider le code', cls: 'primary', onClick: () => { const v = UI.$('#scanManual', body).value.trim(); if (v) { done(); onText('STRAM:ART:' + v.toUpperCase()); } } }] });
    const done = () => { stop = true; stream && stream.getTracks().forEach(t => t.stop()); };
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { done(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
    const v = UI.$('video', body), cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
      stream = s; v.srcObject = s; v.play();
      const tick = () => {
        if (stop) return;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          cv.width = v.videoWidth; cv.height = v.videoHeight; ctx.drawImage(v, 0, 0);
          const code = window.jsQR && jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
          if (code && code.data) { done(); m.close(); onText(code.data); return; }
        }
        requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => UI.toast('Accès à la caméra refusé : saisissez le code', 'warn'));
  }

  /* ---------- PIN ---------- */
  async function hash(pin, salt = 'stram') {
    const b = new TextEncoder().encode(salt + ':' + pin);
    if (crypto && crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 0; for (const c of b) h = (h * 31 + c) >>> 0; return 'x' + h.toString(16);
  }
  function askPin(title, expectedHash, salt, onOk) {
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Code PIN</label><input type="password" inputmode="numeric" autocomplete="off" id="pinIn" maxlength="8" style="font-size:22px;letter-spacing:6px;text-align:center"></div>`;
    UI.modal({ title, body, actions: [{ label: 'Annuler' }, { label: 'Valider', cls: 'primary', onClick: () => {
      const v = UI.$('#pinIn', body).value; hash(v, salt).then(h => { if (h === expectedHash) { onOk(); } else UI.toast('Code PIN incorrect', 'err'); }); } }] });
    setTimeout(() => { const i = UI.$('#pinIn', body); i && i.addEventListener('keydown', e => { if (e.key === 'Enter') body.closest('.modal').querySelector('footer .primary').click(); }); }, 60);
  }

  /* ---------- PDF ---------- */
  function pdf(name, title, html, opt = {}) {
    if (S.host && S.host.savePDF) { S.host.savePDF(name, opt.brut ? html : UI.docHTML(title, html), opt.pied || '').then(p => p && UI.toast('PDF enregistré : ' + p)); return; }
    UI.printDoc(title, html, opt);
  }

  return { compress, addPhotos, photosOf, gallery, viewer, signaturePad, qrSvg, qrArticle, scan, hash, askPin, pdf };
})();
