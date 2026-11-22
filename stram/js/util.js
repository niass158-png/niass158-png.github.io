/* STRAM Suivi — utilitaires communs */
'use strict';
const U = (() => {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  const parse = s => { if (!s) return null; if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate()); const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const today = () => iso(new Date());
  const fr = s => { const d = parse(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
  const frShort = s => { const d = parse(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : ''; };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const moisAn = s => { const d = parse(s); return `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };

  /* ---- Calendrier ouvré (jours ouvrés paramétrables + jours fériés) ---- */
  let workDays = [1, 2, 3, 4, 5, 6]; // lundi→samedi
  let holidays = new Set();
  const setCalendar = (wd, hol) => { workDays = wd && wd.length ? wd : [1, 2, 3, 4, 5, 6]; holidays = new Set(hol || []); };
  const isWork = s => { const d = parse(s); return workDays.includes(d.getDay()) && !holidays.has(iso(d)); };
  const nextWork = s => { let x = s; let g = 0; while (!isWork(x) && g++ < 400) x = addDays(x, 1); return x; };
  const prevWork = s => { let x = s; let g = 0; while (!isWork(x) && g++ < 400) x = addDays(x, -1); return x; };
  // date de fin d'une tâche de n jours ouvrés commençant le jour `s` (inclus)
  const endOf = (s, n) => { let x = nextWork(s); let k = Math.max(1, Math.round(n)) - 1; while (k > 0) { x = addDays(x, 1); if (isWork(x)) k--; } return x; };
  // ajoute n jours ouvrés (n peut être négatif)
  const addWork = (s, n) => { let x = s; let k = Math.round(n); const st = k >= 0 ? 1 : -1; while (k !== 0) { x = addDays(x, st); if (isWork(x)) k -= st; } return x; };
  // nombre de jours ouvrés entre a et b inclus
  const countWork = (a, b) => { if (!a || !b) return 0; let n = 0, x = a, g = 0; if (parse(b) < parse(a)) return 0; while (parse(x) <= parse(b) && g++ < 4000) { if (isWork(x)) n++; x = addDays(x, 1); } return n; };

  /* ---- Nombres ---- */
  const num = v => { if (v === null || v === undefined || v === '') return 0; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const fmt = (v, dec = 0) => num(v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, ' ');
  const qty = v => { const n = num(v); return Number.isInteger(n) ? fmt(n) : fmt(n, 2); };
  const money = v => fmt(Math.round(num(v))) + ' F';
  const pct = v => fmt(num(v), 0) + ' %';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const by = (k, dir = 1) => (a, b) => { const x = typeof k === 'function' ? k(a) : a[k], y = typeof k === 'function' ? k(b) : b[k]; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
  const debounce = (f, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

  return { uid, iso, parse, today, fr, frShort, addDays, diffDays, moisAn, MOIS, setCalendar, isWork, nextWork, prevWork, endOf, addWork, countWork, num, fmt, qty, money, pct, esc, norm, by, debounce };
})();
