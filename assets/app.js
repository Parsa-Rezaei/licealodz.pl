/* Kalkulator Punktów do Liceum w Łodzi – logika aplikacji.
   Plik ładowany z tej samej domeny (Content-Security-Policy: script-src 'self'). */
(() => {
'use strict';

/* =========================================================================
   OCHRONA PRZED OSADZANIEM W RAMCE (clickjacking)
   Gdy strona jest wyświetlana w <iframe> na obcej stronie, ukrywamy jej treść.
   ========================================================================= */
if (window.top !== window.self) {
  document.body.replaceChildren();
  const p = document.createElement('p');
  p.style.cssText = 'font:16px system-ui,sans-serif;padding:24px';
  const a = document.createElement('a');
  a.href = window.location.href.split('#')[0];
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Otwórz Kalkulator Liceum Łódź w nowym oknie';
  p.appendChild(a);
  document.body.appendChild(p);
  return;
}

/* =========================================================================
   KONFIGURACJA – edytuj tylko tę sekcję (instrukcja w README.md)
   ========================================================================= */
const CONFIG = deepFreeze({
  siteName: 'Kalkulator Liceum Łódź',
  siteUrl: 'https://kalkulator-liceum-lodz.pl/',
  dataYearLabel: 'rekrutacji 2026 (rok szkolny 2026/2027)',
  dataUpdated: '24.10.2026',
  // Adres formularza Formspree, np. 'https://formspree.io/f/abcdwxyz'.
  // Inny dostawca wymaga też zmiany "connect-src" w index.html i _headers.
  leadEndpoint: '',
  // Zapasowo: gdy leadEndpoint jest pusty, formularz otworzy program pocztowy z wiadomością na ten adres.
  leadEmail: '',
  // Dane administratora do polityki prywatności i stopki.
  ownerName: '[uzupełnij: imię i nazwisko lub nazwa firmy]',
  ownerEmail: '[uzupełnij: adres e-mail]',
  // Usługa, przez którą wysyłany jest formularz (do polityki prywatności).
  formProcessor: 'Formspree, Inc. (USA)',
  // Partnerzy (szkoły korepetycji). Adres strony musi zaczynać się od https://
  // { name: 'Szkoła X', desc: 'Kurs ósmoklasisty z matematyki, Śródmieście i online', url: 'https://example.pl', phone: '+48 600 000 000' }
  partners: [],
});

const PDFMAKE_SRC = 'vendor/pdfmake/pdfmake.min.js';
const VFS_SRC = 'vendor/pdfmake/vfs_fonts.js';
const STORAGE_KEY = 'kalkulator-liceum-lodz-v1';
const LEAD_KEY = 'kalkulator-liceum-lodz-lead';
const LEAD_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_FILL_MS = 4000;
const pageOpenedAt = Date.now();

function deepFreeze(obj) {
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(obj);
}

/* =========================================================================
   ZASADY PUNKTACJI (Dz. U. 2025 poz. 464)
   ========================================================================= */
const GRADE_POINTS = Object.freeze({ 6: 18, 5: 17, 4: 14, 3: 8, 2: 2 });
const GRADE_NAMES = Object.freeze({ 6: 'celujący', 5: 'bardzo dobry', 4: 'dobry', 3: 'dostateczny', 2: 'dopuszczający' });
const GRADES = [6, 5, 4, 3, 2];
const EXTRA_MAX_KONKURSY = 18;

// w = waga w setnych częściach punktu na 1 punkt procentowy (0,35 → 35)
const EXAMS = [
  { id: 'pol', name: 'Język polski', short: 'polski', w: 35 },
  { id: 'mat', name: 'Matematyka', short: 'matematyka', w: 35 },
  { id: 'obcy', name: 'Język obcy nowożytny', short: 'j. obcy', w: 30 },
];

const SUBJECTS = [
  { id: 'pol', name: 'Język polski', short: 'j. polski', core: true },
  { id: 'mat', name: 'Matematyka', short: 'matematyka', core: true },
  { id: 'ang', name: 'Język angielski', short: 'j. angielski' },
  { id: 'fiz', name: 'Fizyka', short: 'fizyka' },
  { id: 'bio', name: 'Biologia', short: 'biologia' },
  { id: 'che', name: 'Chemia', short: 'chemia' },
  { id: 'geo', name: 'Geografia', short: 'geografia' },
  { id: 'his', name: 'Historia', short: 'historia' },
  { id: 'wos', name: 'Wiedza o społeczeństwie (WOS)', short: 'WOS' },
  { id: 'inf', name: 'Informatyka', short: 'informatyka' },
];
const SUBJ = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));
const EXTRA_SUBJECTS = SUBJECTS.filter(s => !s.core).map(s => s.id);

// Typowe układy przedmiotów punktowanych w danym profilu. Kalkulator wybiera najkorzystniejszy.
const PROFILES = [
  { id: 'mat-fiz', name: 'Mat-Fiz', full: 'matematyczno-fizyczny (politechniczny)', variants: [['fiz', 'ang'], ['fiz', 'inf']] },
  { id: 'mat-inf', name: 'Mat-Inf', full: 'matematyczno-informatyczny', variants: [['inf', 'ang'], ['inf', 'fiz']] },
  { id: 'biol-chem', name: 'Biol-Chem', full: 'biologiczno-chemiczny (medyczny)', variants: [['bio', 'che']] },
  { id: 'mat-geo', name: 'Mat-Geo', full: 'matematyczno-geograficzny (ekonomiczny)', variants: [['geo', 'ang'], ['geo', 'inf']] },
  { id: 'hum-praw', name: 'Hum-Prawniczy', full: 'humanistyczno-prawniczy', variants: [['his', 'wos'], ['his', 'ang']] },
];
const PROFILE_IDS = ['auto', 'custom', 'max', ...PROFILES.map(p => p.id)];

/* =========================================================================
   BAZA 32 LICEÓW W ŁODZI – progi: najniższy i najwyższy próg oddziałów (pkt)
   ========================================================================= */
const SCHOOLS_RAW = [
  ['Publiczne LO Politechniki Łódzkiej', 'Publiczne Liceum Ogólnokształcące Politechniki Łódzkiej', 170.90, 196.55],
  ['I LO im. M. Kopernika', 'I Liceum Ogólnokształcące im. Mikołaja Kopernika', 169.85, 183.35],
  ['XXVI LO im. K.K. Baczyńskiego', 'XXVI Liceum Ogólnokształcące im. Krzysztofa Kamila Baczyńskiego', 160.25, 171.25],
  ['XXI LO im. B. Prusa', 'XXI Liceum Ogólnokształcące im. Bolesława Prusa', 155.85, 173.25],
  ['III LO im. T. Kościuszki', 'III Liceum Ogólnokształcące im. Tadeusza Kościuszki', 155.85, 168.00],
  ['IV LO im. E. Sczanieckiej', 'IV Liceum Ogólnokształcące im. Emilii Sczanieckiej', 150.85, 161.85],
  ['XXIX LO im. J. Bytnara „Rudego”', 'XXIX Liceum Ogólnokształcące im. Janka Bytnara „Rudego”', 150.55, 159.70],
  ['XII LO im. S. Wyspiańskiego', 'XII Liceum Ogólnokształcące im. Stanisława Wyspiańskiego', 149.55, 164.60],
  ['XXV LO im. S. Żeromskiego', 'XXV Liceum Ogólnokształcące im. Stefana Żeromskiego', 149.20, 166.20],
  ['XIII LO im. M. Piotrowiczowej', 'XIII Liceum Ogólnokształcące im. Marii Piotrowiczowej', 146.30, 163.35],
  ['Publiczne LO Uniwersytetu Łódzkiego', 'Publiczne Liceum Ogólnokształcące Uniwersytetu Łódzkiego', 138.55, 171.80],
  ['XXXI LO im. L. Zamenhofa', 'XXXI Liceum Ogólnokształcące im. Ludwika Zamenhofa', 135.05, 167.25],
  ['XV LO im. J. Kasprowicza', 'XV Liceum Ogólnokształcące im. Jana Kasprowicza', 133.30, 147.30],
  ['VIII LO im. A. Asnyka', 'VIII Liceum Ogólnokształcące im. Adama Asnyka', 132.40, 154.25],
  ['IX LO im. J. Dąbrowskiego', 'IX Liceum Ogólnokształcące im. Jarosława Dąbrowskiego', 119.90, 138.40],
  ['XXXII LO im. H. Poświatowskiej', 'XXXII Liceum Ogólnokształcące im. Haliny Poświatowskiej', 114.90, 145.20],
  ['VI LO im. J. Lelewela', 'VI Liceum Ogólnokształcące im. Joachima Lelewela', 112.75, 133.20],
  ['II LO im. G. Narutowicza', 'II Liceum Ogólnokształcące im. Gabriela Narutowicza', 108.65, 142.35],
  ['XX LO im. J. Słowackiego', 'XX Liceum Ogólnokształcące im. Juliusza Słowackiego', 103.30, 116.60],
  ['Katolickie LO SPSK', 'Katolickie Liceum Ogólnokształcące SPSK', 90.50, 172.65],
  ['XXXIII LO im. Armii Krajowej', 'XXXIII Liceum Ogólnokształcące im. Armii Krajowej', 75.85, 165.00],
  ['XXX LO im. I. Krasickiego', 'XXX Liceum Ogólnokształcące im. Ignacego Krasickiego', 69.35, 105.85],
  ['XI LO im. J. Piłsudskiego', 'XI Liceum Ogólnokształcące im. Józefa Piłsudskiego', 66.00, 150.50],
  ['XXXIV LO im. K. Kieślowskiego', 'XXXIV Liceum Ogólnokształcące im. Krzysztofa Kieślowskiego', 55.75, 98.15],
  ['Aleliceum LO', 'Aleliceum Liceum Ogólnokształcące', 52.05, 112.10],
  ['XXIV LO im. M. Skłodowskiej-Curie', 'XXIV Liceum Ogólnokształcące im. Marii Skłodowskiej-Curie', 46.95, 130.70],
  ['XVIII LO im. J. Śniadeckiego', 'XVIII Liceum Ogólnokształcące im. Jędrzeja Śniadeckiego', 44.40, 78.45],
  ['XXIII LO im. ks. prof. J. Tischnera', 'XXIII Liceum Ogólnokształcące im. ks. prof. Józefa Tischnera', 44.40, 90.45],
  ['XLVII LO im. S. Staszica', 'XLVII Liceum Ogólnokształcące im. Stanisława Staszica', 44.15, 65.75],
  ['XLII LO im. I. Sendlerowej', 'XLII Liceum Ogólnokształcące im. Ireny Sendlerowej', 42.30, 113.10],
  ['XLIII LO im. J. Tuwima', 'XLIII Liceum Ogólnokształcące im. Juliana Tuwima', 34.00, 75.75],
  ['Akademia-LO dla Młodzieży', 'Akademia – Liceum Ogólnokształcące dla Młodzieży', 23.90, 52.75],
];

// Poziomy (tiery) wg najniższego progu szkoły; wartości w setnych punktu.
const TIERS = [
  { n: 1, label: 'Tier 1', range: '160+ pkt', from: 16000 },
  { n: 2, label: 'Tier 2', range: '140–160 pkt', from: 14000 },
  { n: 3, label: 'Tier 3', range: '120–140 pkt', from: 12000 },
  { n: 4, label: 'Tier 4', range: '100–120 pkt', from: 10000 },
  { n: 5, label: 'Tier 5', range: 'poniżej 100 pkt', from: 0 },
];
const TIER_STYLE = {
  1: 'bg-indigo-100 text-indigo-800', 2: 'bg-violet-100 text-violet-800', 3: 'bg-sky-100 text-sky-800',
  4: 'bg-teal-100 text-teal-800', 5: 'bg-slate-200 text-slate-700',
};

const toH = v => Math.round(v * 100); // punkty → setne części punktu (unikamy błędów zaokrągleń)
const SCHOOLS = SCHOOLS_RAW.map(([short, name, min, max], i) => {
  const minH = toH(min), maxH = toH(max);
  return Object.freeze({ id: i, short, name, minH, maxH, tier: TIERS.find(t => minH >= t.from).n });
});

const CATS = {
  dream: { label: 'Lista Marzeń', chip: 'bg-violet-100 text-violet-800' },
  real: { label: 'Szkoła Realna', chip: 'bg-sky-100 text-sky-800' },
  safe: { label: 'Szkoła Bezpieczna', chip: 'bg-emerald-100 text-emerald-800' },
  out: { label: 'Poza zasięgiem', chip: 'bg-slate-200 text-slate-700' },
};

// Dozwolone wartości pól formularza (wszystko spoza listy jest odrzucane).
const LEAD_SUBJECTS = ['Matematyka', 'Język polski', 'Język angielski'];
const LEAD_DISTRICTS = ['Bałuty', 'Górna', 'Polesie', 'Śródmieście', 'Widzew', 'Poza Łodzią'];
const LEAD_FORMS = ['Bez znaczenia', 'Stacjonarnie w Łodzi', 'Online', 'Kurs grupowy'];

/* =========================================================================
   STAN
   ========================================================================= */
const DEFAULT_STATE = {
  exam: { pol: 75, mat: 70, obcy: 85 },
  grades: { pol: 5, mat: 5, ang: 6, fiz: 4, bio: 5, che: 4, geo: 5, his: 5, wos: 4, inf: 5 },
  wyroznienie: false, wolontariat: true, konkursy: 0, laureat: false,
  profile: 'auto', custom: ['fiz', 'ang'],
  sim: { pol: 0, mat: 0, obcy: 0 },
};
const clone = o => JSON.parse(JSON.stringify(o));

function storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* brak dostępu */ } }
function storageRemove(key) { try { localStorage.removeItem(key); } catch (_) { /* brak dostępu */ } }

// Dane z localStorage traktujemy jak niezaufane: przyjmujemy wyłącznie wartości z dozwolonych zakresów.
function loadState() {
  const st = clone(DEFAULT_STATE);
  let saved = null;
  try { saved = JSON.parse(storageGet(STORAGE_KEY) || 'null'); } catch (_) { saved = null; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return st;
  const exam = saved.exam && typeof saved.exam === 'object' ? saved.exam : {};
  const grades = saved.grades && typeof saved.grades === 'object' ? saved.grades : {};
  for (const e of EXAMS) if (Number.isFinite(exam[e.id])) st.exam[e.id] = clampPct(exam[e.id]);
  for (const s of SUBJECTS) { const g = Number(grades[s.id]); if (GRADES.includes(g)) st.grades[s.id] = g; }
  for (const k of ['wyroznienie', 'wolontariat', 'laureat']) if (typeof saved[k] === 'boolean') st[k] = saved[k];
  if (Number.isFinite(saved.konkursy)) st.konkursy = clampInt(saved.konkursy, 0, EXTRA_MAX_KONKURSY);
  if (PROFILE_IDS.includes(saved.profile)) st.profile = saved.profile;
  if (Array.isArray(saved.custom) && saved.custom.length === 2 && saved.custom.every(id => EXTRA_SUBJECTS.includes(id)) && saved.custom[0] !== saved.custom[1]) st.custom = [saved.custom[0], saved.custom[1]];
  return st;
}
function saveState() {
  const { exam, grades, wyroznienie, wolontariat, konkursy, laureat, profile, custom } = state;
  storageSet(STORAGE_KEY, JSON.stringify({ exam, grades, wyroznienie, wolontariat, konkursy, laureat, profile, custom }));
}

/* =========================================================================
   OBLICZENIA (wszystko w setnych częściach punktu)
   ========================================================================= */
function clampInt(v, lo, hi) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; }
function clampPct(v) { return clampInt(v, 0, 100); }

function examH(exam) { return EXAMS.reduce((sum, e) => sum + e.w * clampPct(exam[e.id]), 0); }
function gradePts(st, id) { return GRADE_POINTS[st.grades[id]] || 0; }
function extrasPts(st) {
  return (st.wyroznienie ? 7 : 0) + (st.wolontariat ? 3 : 0) + clampInt(st.konkursy, 0, EXTRA_MAX_KONKURSY);
}
function scorePair(st, pair) {
  const e = examH(st.exam);
  const g = gradePts(st, 'pol') + gradePts(st, 'mat') + gradePts(st, pair[0]) + gradePts(st, pair[1]);
  const x = extrasPts(st);
  const rawH = e + 100 * (g + x);
  return { pair, examH: e, grades: g, extras: x, rawH, totalH: st.laureat ? 20000 : rawH };
}
function bestOf(st, pairs) {
  return pairs.map(p => scorePair(st, p)).reduce((a, b) => (b.rawH > a.rawH ? b : a));
}
function bestAnyPair(st) {
  const sorted = [...EXTRA_SUBJECTS].sort((a, b) => gradePts(st, b) - gradePts(st, a));
  return sorted.slice(0, 2);
}
function profileResults(st) {
  const list = PROFILES.map(p => ({ id: p.id, name: p.name, full: p.full, res: bestOf(st, p.variants) }));
  list.push({ id: 'custom', name: 'Własny układ', full: 'przedmioty z oferty konkretnej klasy', res: scorePair(st, st.custom) });
  list.push({ id: 'max', name: 'Maksimum', full: 'najlepsze 2 dowolne przedmioty', res: scorePair(st, bestAnyPair(st)) });
  return list;
}
function bestRealProfile(list) {
  return list.filter(p => PROFILES.some(q => q.id === p.id)).reduce((a, b) => (b.res.rawH > a.res.rawH ? b : a));
}
function activeProfile(st, list) {
  if (st.profile === 'auto') return bestRealProfile(list);
  return list.find(p => p.id === st.profile) || bestRealProfile(list);
}
function classify(sH, s) {
  const d = s.minH - sH;
  if (d > 1000) return 'out';
  if (d > 0) return 'dream';
  if (d <= -2000 || sH >= s.maxH) return 'safe';
  return 'real';
}
function categorize(sH) {
  const cats = { dream: [], real: [], safe: [], out: [] };
  for (const s of SCHOOLS) cats[classify(sH, s)].push(s);
  cats.dream.sort((a, b) => a.minH - b.minH);
  cats.real.sort((a, b) => b.minH - a.minH);
  cats.safe.sort((a, b) => b.minH - a.minH);
  cats.out.sort((a, b) => a.minH - b.minH);
  return cats;
}
// Ile punktów procentowych potrzeba, by zyskać dH (setne pkt) przy wadze w.
function ppNeeded(dH, w) { return Math.ceil(dH / w); }
function headroom(st, examId) { return 100 - clampPct(st.exam[examId]); }
function inSafeBand(sH, s) { const d = sH - s.minH; return d >= 2000 && d <= 3000; }

/* =========================================================================
   FORMATOWANIE I BEZPIECZNE WSTAWIANIE TREŚCI
   ========================================================================= */
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = h => nf2.format(h / 100);
// Każdy tekst wstawiany do HTML przechodzi przez esc().
const esc = v => String(v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const pairText = pair => pair.map(id => SUBJ[id].short).join(' + ');
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const num = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

// Wymiary pasków ustawiamy przez CSSOM (dozwolone przy CSP bez 'unsafe-inline').
function applyGeometry(root) {
  root.querySelectorAll('[data-left],[data-width]').forEach(el => {
    if (el.dataset.left !== undefined) el.style.left = `calc(${num(Number(el.dataset.left))}% - ${el.dataset.offset === '1' ? 2 : 0}px)`;
    if (el.dataset.width !== undefined) el.style.width = `${num(Number(el.dataset.width))}%`;
  });
}
function setHTML(el, html) { el.innerHTML = html; applyGeometry(el); }

function safeHttpsUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' ? u.href : '';
  } catch (_) { return ''; }
}
function safePhone(v) {
  const s = String(v).trim();
  return /^\+?[0-9 ()-]{6,20}$/.test(s) ? s : '';
}
function isEmail(v) { return /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/.test(String(v)) && String(v).length <= 254; }

function ppCell(dH, w, room) {
  const need = ppNeeded(dH, w);
  return need <= room ? `+${need}%` : `<span class="text-slate-400" title="Brak wystarczającego zapasu procentów (maks. +${room}%)">—</span>`;
}
function ppBothText(st, dH) {
  const k = ppNeeded(dH, 70);
  return k <= Math.min(headroom(st, 'mat'), headroom(st, 'pol')) ? `po +${k}%` : null;
}
function hintForGap(st, dH) {
  const parts = [];
  const m = ppNeeded(dH, 35);
  if (m <= headroom(st, 'mat')) parts.push(`+${m}% z matematyki`);
  if (m <= headroom(st, 'pol')) parts.push(`+${m}% z polskiego`);
  const both = ppBothText(st, dH);
  if (both) parts.push(`${both} z obu`);
  return parts.length ? parts.join(' albo ') : 'wymaga poprawy kilku przedmiotów lub ocen';
}

/* =========================================================================
   BUDOWA FORMULARZA
   ========================================================================= */
function buildInputs() {
  setHTML($('#examInputs'), EXAMS.map(e => `
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <label for="exam-${e.id}" class="font-medium text-slate-800">${e.name}</label>
        <span class="text-sm text-slate-500 tabular-nums">× 0,${e.w} = <strong id="exam-${e.id}-pts" class="text-slate-900">0,00</strong> pkt</span>
      </div>
      <div class="mt-2 flex items-center gap-3">
        <input type="range" id="exam-${e.id}-range" data-exam="${e.id}" min="0" max="100" step="1" class="w-full cursor-pointer accent-indigo-600" aria-label="${e.name} – wynik procentowy (suwak)">
        <div class="relative shrink-0">
          <input type="number" id="exam-${e.id}" data-exam="${e.id}" min="0" max="100" step="1" inputmode="numeric" class="w-20 rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-6 text-right tabular-nums focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200">
          <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
        </div>
      </div>
    </div>`).join(''));

  const gradeOptions = GRADES.map(g => `<option value="${g}">${g} – ${GRADE_NAMES[g]} (${GRADE_POINTS[g]} pkt)</option>`).join('');
  setHTML($('#gradeInputs'), SUBJECTS.map(s => `
    <label class="block">
      <span class="text-sm font-medium text-slate-800">${s.name}${s.core ? ' <span class="text-xs font-semibold text-indigo-700">· liczony zawsze</span>' : ''}</span>
      <select id="grade-${s.id}" data-grade="${s.id}" class="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-2 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200">${gradeOptions}</select>
    </label>`).join(''));

  const extraOpts = EXTRA_SUBJECTS.map(id => `<option value="${id}">${SUBJ[id].short}</option>`).join('');
  setHTML($('#custom0'), extraOpts);
  setHTML($('#custom1'), extraOpts);

  setHTML($('#simSliders'), EXAMS.map(e => `
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <label for="sim-${e.id}" class="font-medium text-slate-800">${e.name}</label>
        <span id="sim-${e.id}-txt" class="text-sm tabular-nums text-slate-600"></span>
      </div>
      <input type="range" id="sim-${e.id}" data-sim="${e.id}" min="0" max="100" step="1" value="0" class="mt-2 w-full cursor-pointer accent-violet-600">
    </div>`).join(''));
}

function syncInputsFromState() {
  for (const e of EXAMS) {
    $(`#exam-${e.id}`).value = state.exam[e.id];
    $(`#exam-${e.id}-range`).value = state.exam[e.id];
  }
  for (const s of SUBJECTS) $(`#grade-${s.id}`).value = String(state.grades[s.id]);
  $('#wyroznienie').checked = state.wyroznienie;
  $('#wolontariat').checked = state.wolontariat;
  $('#laureat').checked = state.laureat;
  $('#konkursy').value = state.konkursy;
  $('#custom0').value = state.custom[0];
  $('#custom1').value = state.custom[1];
}

/* =========================================================================
   RENDEROWANIE
   ========================================================================= */
function render() {
  const list = profileResults(state);
  const act = activeProfile(state, list);
  const sH = act.res.totalH;
  const cats = categorize(sH);

  renderExamPoints();
  renderSummary(list, act);
  renderCategories(cats, sH, act);
  renderTable(sH);
  renderSimulator(act, sH);
  updateLeadHidden(act, cats);
  saveState();
}

function renderExamPoints() {
  for (const e of EXAMS) $(`#exam-${e.id}-pts`).textContent = fmt(e.w * state.exam[e.id]);
  $('#examTotal').textContent = fmt(examH(state.exam));
}

function bar(label, valueH, maxPts, color) {
  const pct = Math.min(100, (valueH / (maxPts * 100)) * 100);
  return `<div>
    <div class="flex justify-between text-slate-600"><span>${label}</span><span class="tabular-nums font-semibold text-slate-900">${fmt(valueH)} / ${maxPts}</span></div>
    <div class="mt-1 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full ${color}" data-width="${num(pct)}"></div></div>
  </div>`;
}

function renderSummary(list, act) {
  const r = act.res;
  $('#totalScore').textContent = fmt(r.totalH);
  $('#mobileScore').textContent = fmt(r.totalH);
  $('#totalProfile').textContent = `Profil: ${act.name} · liczone: j. polski, matematyka, ${pairText(r.pair)}`;
  setHTML($('#breakdown'),
    bar('Egzamin ósmoklasisty', r.examH, 100, 'bg-indigo-600') +
    bar('Oceny (4 przedmioty)', r.grades * 100, 72, 'bg-violet-500') +
    bar('Osiągnięcia', r.extras * 100, 28, 'bg-amber-500'));

  const note = $('#laureatNote');
  if (state.laureat) {
    note.classList.remove('hidden');
    setHTML(note, `<strong>Przyjęcie w pierwszej kolejności.</strong> Jako laureat jesteś przyjmowany przed pozostałymi kandydatami – kalkulator traktuje to jak 200 pkt. Twój wynik bez uprawnienia: ${fmt(r.rawH)} pkt.`);
  } else note.classList.add('hidden');

  const best = bestRealProfile(list);
  const sel = $('#profileSelect');
  const opts = [`<option value="auto">Automatycznie – najlepszy profil (${esc(best.name)}, ${fmt(best.res.totalH)} pkt)</option>`]
    .concat(list.map(p => `<option value="${esc(p.id)}">${esc(p.name)} – ${fmt(p.res.totalH)} pkt</option>`));
  setHTML(sel, opts.join(''));
  sel.value = state.profile;

  const custom = $('#customPair');
  custom.classList.toggle('hidden', state.profile !== 'custom');
  custom.classList.toggle('grid', state.profile === 'custom');

  setHTML($('#profileList'), list.map(p => {
    const active = p.id === act.id;
    return `<li><button type="button" data-profile="${esc(p.id)}" class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}" aria-pressed="${active}">
      <span><span class="font-semibold ${active ? 'text-indigo-800' : 'text-slate-900'}">${esc(p.name)}</span><br><span class="text-xs text-slate-500">${esc(pairText(p.res.pair))}</span></span>
      <span class="tabular-nums font-bold ${active ? 'text-indigo-800' : 'text-slate-800'}">${fmt(p.res.totalH)}</span>
    </button></li>`;
  }).join(''));
}

function rangeBar(s, sH) {
  const L = s.minH / 200, W = Math.max(0.6, (s.maxH - s.minH) / 200), M = Math.min(sH, 20000) / 200;
  return `<div class="relative mt-2 h-2 rounded-full bg-white ring-1 ring-slate-200" aria-hidden="true">
    <div class="absolute inset-y-0 rounded-full bg-slate-300" data-left="${num(L)}" data-width="${num(W)}"></div>
    <div class="absolute -top-1 h-4 w-1 rounded bg-indigo-600" data-left="${num(M)}" data-offset="1"></div>
  </div>`;
}

function schoolCard(s, sH, kind) {
  const d = s.minH - sH;
  let detail = '';
  if (kind === 'dream' || kind === 'out') {
    detail = `<p class="mt-2 text-sm"><span class="font-semibold text-slate-900">Brakuje ${fmt(d)} pkt</span> <span class="text-slate-600">→ ${esc(hintForGap(state, d))}</span></p>`;
  } else if (kind === 'real') {
    detail = `<p class="mt-2 text-sm"><span class="font-semibold text-sky-800">+${fmt(-d)} pkt</span> <span class="text-slate-600">nad najniższym progiem</span></p>`;
  } else {
    const band = inSafeBand(sH, s) ? ' <span class="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">strefa 20–30 pkt</span>' : '';
    const above = sH >= s.maxH ? ' · powyżej najwyższego progu' : '';
    detail = `<p class="mt-2 text-sm"><span class="font-semibold text-emerald-800">+${fmt(-d)} pkt zapasu</span><span class="text-slate-600">${above}</span>${band}</p>`;
  }
  return `<li class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
    <div class="flex items-start justify-between gap-2">
      <p class="font-semibold leading-snug text-slate-900" title="${esc(s.name)}">${esc(s.short)}</p>
      <span class="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${TIER_STYLE[s.tier]}">T${s.tier}</span>
    </div>
    <p class="text-xs text-slate-500">Progi: ${fmt(s.minH)} – ${fmt(s.maxH)} pkt</p>
    ${rangeBar(s, sH)}
    ${detail}
  </li>`;
}

const LIST_LIMIT = 8;
const expanded = { dream: false, real: false, safe: false };

function renderCategories(cats, sH, act) {
  setHTML($('#resultsLead'), `Dopasowanie dla wyniku <strong class="tabular-nums text-slate-900">${fmt(sH)} pkt</strong> (profil ${esc(act.name)}: ${esc(pairText(act.res.pair))}). Progi z ${esc(CONFIG.dataYearLabel)}.`);
  const empty = {
    dream: 'Brak szkół z progiem do 10 pkt powyżej Twojego wyniku.',
    real: 'Brak szkół, w których mieścisz się w widełkach.',
    safe: 'Brak szkół z progiem co najmniej 20 pkt poniżej Twojego wyniku.',
    out: 'Wszystkie licea są w Twoim zasięgu.',
  };
  for (const k of Object.keys(cats)) {
    const all = cats[k];
    const limit = k === 'out' || expanded[k] ? all.length : LIST_LIMIT;
    const more = all.length > limit
      ? `<li><button type="button" data-expand="${k}" class="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Pokaż wszystkie (${all.length})</button></li>`
      : '';
    $(`#cnt-${k}`).textContent = all.length;
    setHTML($(`#cat-${k}`), all.length
      ? all.slice(0, limit).map(s => schoolCard(s, sH, k)).join('') + more
      : `<li class="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">${empty[k]}</li>`);
  }
}

function renderTable(sH) {
  $('#tableCaption').textContent = `Progi z ${CONFIG.dataYearLabel}. Różnica = Twój wynik (${fmt(sH)} pkt) minus najniższy próg.`;
  const rows = [...SCHOOLS].sort((a, b) => b.minH - a.minH);
  setHTML($('#allSchools'), rows.map((s, i) => {
    const k = classify(sH, s);
    const diff = sH - s.minH;
    return `<tr>
      <td class="py-2 pr-3 text-slate-400">${i + 1}</td>
      <td class="py-2 pr-3 font-medium text-slate-900">${esc(s.name)}</td>
      <td class="py-2 pr-3"><span class="rounded-md px-1.5 py-0.5 text-xs font-semibold ${TIER_STYLE[s.tier]}">T${s.tier}</span></td>
      <td class="py-2 pr-3 text-right tabular-nums">${fmt(s.minH)}</td>
      <td class="py-2 pr-3 text-right tabular-nums">${fmt(s.maxH)}</td>
      <td class="py-2 pr-3 text-right tabular-nums ${diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}</td>
      <td class="py-2"><span class="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CATS[k].chip}">${CATS[k].label}</span></td>
    </tr>`;
  }).join(''));
}

function simulatedState() {
  const st = clone(state);
  for (const e of EXAMS) st.exam[e.id] = clampPct(state.exam[e.id] + state.sim[e.id]);
  return st;
}

function renderSimulator(act, sH) {
  for (const e of EXAMS) {
    const room = headroom(state, e.id);
    const slider = $(`#sim-${e.id}`);
    slider.max = room;
    slider.disabled = room === 0;
    if (state.sim[e.id] > room) state.sim[e.id] = room;
    slider.value = state.sim[e.id];
    const add = state.sim[e.id];
    setHTML($(`#sim-${e.id}-txt`), `+${add}% <span class="text-slate-400">(${state.exam[e.id]}% → ${state.exam[e.id] + add}%)</span> = <strong class="text-slate-900">+${fmt(add * e.w)} pkt</strong>`);
  }
  const st2 = simulatedState();
  const act2 = activeProfile(st2, profileResults(st2));
  const s2 = act2.res.totalH;
  $('#simProfile').textContent = act2.name;
  $('#simScore').textContent = fmt(s2);
  $('#simDelta').textContent = `+${fmt(s2 - sH)} pkt`;

  const gainedReal = [], gainedDream = [];
  for (const s of SCHOOLS) {
    const before = classify(sH, s), after = classify(s2, s);
    if ((before === 'out' || before === 'dream') && (after === 'real' || after === 'safe')) gainedReal.push(s);
    else if (before === 'out' && after === 'dream') gainedDream.push(s);
  }
  const names = arr => arr.sort((a, b) => b.minH - a.minH).map(s => `<li>${esc(s.short)} <span class="text-indigo-700">(od ${fmt(s.minH)})</span></li>`).join('');
  let html = '';
  if (s2 === sH) html = '<p>Przesuń suwaki, aby zobaczyć, jakie licea odblokujesz.</p>';
  else {
    html += gainedReal.length ? `<p class="font-semibold">Nowe szkoły w Twoim zasięgu (${gainedReal.length}):</p><ul class="mt-1 list-disc pl-5">${names(gainedReal)}</ul>` : '<p>Brak nowych szkół w zasięgu przy tej poprawie.</p>';
    if (gainedDream.length) html += `<p class="mt-2 font-semibold">Nowe na Liście Marzeń (${gainedDream.length}):</p><ul class="mt-1 list-disc pl-5">${names(gainedDream)}</ul>`;
  }
  setHTML($('#simGains'), html);

  // Następny poziom
  const reachable = SCHOOLS.filter(s => s.minH <= sH);
  const curTier = reachable.length ? Math.min(...reachable.map(s => s.tier)) : 6;
  const tierBox = $('#nextTier');
  if (curTier === 1) {
    const left = SCHOOLS.filter(s => s.tier === 1 && s.minH > sH).sort((a, b) => a.minH - b.minH);
    setHTML(tierBox, left.length
      ? `<p>Masz w zasięgu najwyższy poziom (Tier 1: 160+ pkt). Kolejna szkoła: <strong>${esc(left[0].short)}</strong> – brakuje ${fmt(left[0].minH - sH)} pkt (${esc(hintForGap(state, left[0].minH - sH))}).</p>`
      : '<p>Masz w zasięgu wszystkie licea z najwyższego poziomu (Tier 1). Gratulacje!</p>');
  } else {
    const next = TIERS.find(t => t.n === curTier - 1);
    const target = SCHOOLS.filter(s => s.tier === next.n).sort((a, b) => a.minH - b.minH)[0];
    const dH = target.minH - sH;
    const room = { mat: headroom(state, 'mat'), pol: headroom(state, 'pol') };
    const m = ppNeeded(dH, 35), both = ppNeeded(dH, 70);
    const cells = [
      ['Matematyka', m <= room.mat ? `+${m}%` : `niewystarczające (maks. +${room.mat}%)`],
      ['Język polski', m <= room.pol ? `+${m}%` : `niewystarczające (maks. +${room.pol}%)`],
      ['Matematyka i polski', both <= Math.min(room.mat, room.pol) ? `po +${both}%` : 'niewystarczające'],
    ];
    setHTML(tierBox, `<p>${curTier <= 5 ? `Twój obecny poziom: <strong>Tier ${curTier}</strong>.` : 'Żadne liceum nie jest jeszcze w zasięgu.'} Aby wejść na <strong>${next.label} (${next.range})</strong>, potrzebujesz progu <strong>${esc(target.short)}</strong> – ${fmt(target.minH)} pkt, czyli <strong>+${fmt(dH)} pkt</strong>.</p>
      <dl class="mt-3 grid gap-2 sm:grid-cols-3">${cells.map(([k, v]) => `<div class="rounded-lg bg-slate-50 p-2"><dt class="text-xs text-slate-500">${k}</dt><dd class="font-semibold tabular-nums text-slate-900">${v}</dd></div>`).join('')}</dl>`);
  }

  // Kolejne szkoły
  const nextSchools = SCHOOLS.filter(s => s.minH > sH).sort((a, b) => a.minH - b.minH).slice(0, 6);
  setHTML($('#nextSchools'), nextSchools.length ? nextSchools.map(s => {
    const dH = s.minH - sH;
    const both = ppBothText(state, dH);
    return `<tr>
      <td class="py-2 pr-2 font-medium text-slate-900">${esc(s.short)}<br><span class="text-xs font-normal text-slate-500">próg od ${fmt(s.minH)}</span></td>
      <td class="py-2 pr-2 text-right tabular-nums">${fmt(dH)}</td>
      <td class="py-2 pr-2 text-right tabular-nums">${ppCell(dH, 35, headroom(state, 'mat'))}</td>
      <td class="py-2 pr-2 text-right tabular-nums">${ppCell(dH, 35, headroom(state, 'pol'))}</td>
      <td class="py-2 pr-2 text-right tabular-nums">${both || '<span class="text-slate-400">—</span>'}</td>
      <td class="py-2 text-right tabular-nums">${ppCell(dH, 30, headroom(state, 'obcy'))}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="py-3 text-slate-500">Wszystkie licea są już w Twoim zasięgu.</td></tr>');
}

function renderPartners() {
  const box = $('#partners');
  const partners = CONFIG.partners.filter(p => p && typeof p.name === 'string' && p.name.trim());
  if (partners.length) {
    setHTML(box, partners.map(p => {
      const url = safeHttpsUrl(p.url);
      const phone = safePhone(p.phone || '');
      return `
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Partner</p>
        <p class="mt-1 font-semibold text-slate-900">${esc(p.name)}</p>
        ${p.desc ? `<p class="mt-1 text-sm text-slate-600">${esc(p.desc)}</p>` : ''}
        <div class="mt-2 flex flex-wrap gap-3 text-sm">
          ${url ? `<a href="${esc(url)}" target="_blank" rel="sponsored noopener noreferrer" class="font-medium text-indigo-700 underline">Strona partnera</a>` : ''}
          ${phone ? `<a href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}" class="font-medium text-indigo-700 underline">${esc(phone)}</a>` : ''}
        </div>
      </div>`;
    }).join(''));
  } else {
    const mail = isEmail(CONFIG.ownerEmail) ? `<a href="mailto:${esc(CONFIG.ownerEmail)}?subject=${encodeURIComponent('Współpraca – Kalkulator Liceum Łódź')}" class="font-medium text-indigo-700 underline">Napisz do nas</a>` : '';
    setHTML(box, `<div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
      <p class="font-semibold text-slate-900">Prowadzisz korepetycje lub kurs ósmoklasisty w Łodzi?</p>
      <p class="mt-1">To miejsce może promować Twoją ofertę wśród rodziców ósmoklasistów, którzy właśnie sprawdzają, ilu punktów im brakuje. ${mail}</p>
    </div>`);
  }
}

function updateLeadHidden(act, cats) {
  const f = $('#leadForm');
  f.elements.wynik_kalkulatora.value = `${fmt(act.res.totalH)} pkt`;
  f.elements.profil.value = `${act.name} (${pairText(act.res.pair)})`;
  f.elements.lista_marzen.value = cats.dream.map(s => s.short).join('; ') || '-';
}

/* =========================================================================
   ZDARZENIA
   ========================================================================= */
let rafId = 0;
function scheduleRender() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(render); }

function bindEvents() {
  document.addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.dataset.exam && Object.prototype.hasOwnProperty.call(state.exam, t.dataset.exam)) {
      if (t.value === '') return;
      const v = clampPct(t.value);
      state.exam[t.dataset.exam] = v;
      const other = t.type === 'range' ? $(`#exam-${t.dataset.exam}`) : $(`#exam-${t.dataset.exam}-range`);
      other.value = v;
      scheduleRender();
    } else if (t.dataset.sim && Object.prototype.hasOwnProperty.call(state.sim, t.dataset.sim)) {
      state.sim[t.dataset.sim] = clampInt(t.value, 0, 100);
      scheduleRender();
    } else if (t.id === 'konkursy') {
      if (t.value === '') return;
      state.konkursy = clampInt(t.value, 0, EXTRA_MAX_KONKURSY);
      scheduleRender();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.exam && t.type === 'number' && Object.prototype.hasOwnProperty.call(state.exam, t.dataset.exam)) { t.value = state.exam[t.dataset.exam]; }
    else if (t.id === 'konkursy') { t.value = state.konkursy; }
    else if (t.dataset.grade && Object.prototype.hasOwnProperty.call(state.grades, t.dataset.grade)) {
      const g = Number(t.value);
      if (GRADES.includes(g)) { state.grades[t.dataset.grade] = g; scheduleRender(); }
    }
    else if (['wyroznienie', 'wolontariat', 'laureat'].includes(t.id)) { state[t.id] = Boolean(t.checked); scheduleRender(); }
    else if (t.id === 'profileSelect') { if (PROFILE_IDS.includes(t.value)) { state.profile = t.value; scheduleRender(); } }
    else if (t.id === 'custom0' || t.id === 'custom1') {
      if (!EXTRA_SUBJECTS.includes(t.value)) return;
      const i = t.id === 'custom0' ? 0 : 1, j = 1 - i;
      state.custom[i] = t.value;
      if (state.custom[j] === t.value) {
        state.custom[j] = EXTRA_SUBJECTS.find(id => id !== t.value);
        $(`#custom${j}`).value = state.custom[j];
      }
      scheduleRender();
    }
  });
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-profile],[data-action],[data-subject],[data-expand]');
    if (!btn) return;
    if (btn.dataset.profile) { if (PROFILE_IDS.includes(btn.dataset.profile)) { state.profile = btn.dataset.profile; render(); } }
    else if (btn.dataset.expand) { if (Object.prototype.hasOwnProperty.call(expanded, btn.dataset.expand)) { expanded[btn.dataset.expand] = true; render(); } }
    else if (btn.dataset.action === 'pdf') exportPdf(btn);
    else if (btn.dataset.action === 'privacy') openPrivacy();
    else if (btn.dataset.action === 'close-privacy') $('#privacyDialog').close();
    else if (btn.dataset.subject) {
      $$('#leadForm input[name="przedmioty"]').forEach(box => { if (box.value === btn.dataset.subject) box.checked = true; });
    }
  });
  $('#resetBtn').addEventListener('click', () => {
    storageRemove(STORAGE_KEY);
    state = clone(DEFAULT_STATE);
    syncInputsFromState();
    render();
    toast('Usunięto Twoje dane z tej przeglądarki i przywrócono przykład.');
  });
  $('#simReset').addEventListener('click', () => { state.sim = { pol: 0, mat: 0, obcy: 0 }; render(); });
  $('#shareBtn').addEventListener('click', shareSite);
  const form = $('#leadForm');
  form.addEventListener('submit', submitLead);
  form.querySelector('button[type="submit"]').disabled = false;
  $('#privacyDialog').addEventListener('click', e => { if (e.target.id === 'privacyDialog') e.target.close(); });
}

function openPrivacy() {
  const d = $('#privacyDialog');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

function toast(msg) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 'toast-enter pointer-events-auto max-w-md rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  box.replaceChildren(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 4500);
}

async function shareSite() {
  const url = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : CONFIG.siteUrl;
  const data = { title: document.title, text: 'Kalkulator punktów do liceum w Łodzi – sprawdź, do których liceów masz szansę:', url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast('Skopiowano link do kalkulatora.');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    toast(`Skopiuj link: ${url}`);
  }
}

/* =========================================================================
   FORMULARZ LEADÓW
   Wysyłamy wyłącznie sprawdzone pola z listy dozwolonych wartości.
   ========================================================================= */
// Usuwa znaki sterujące i neutralizuje formuły arkusza (ochrona przy eksporcie CSV do Excela).
function cleanText(v, maxLen) {
  let s = String(v || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

function validateLead(f) {
  const name = String(f.elements.imie.value || '').trim();
  const email = String(f.elements.email.value || '').trim();
  const phone = String(f.elements.telefon.value || '').trim();
  const district = f.elements.dzielnica.value;
  const mode = f.elements.forma.value;
  const subjects = $$('#leadForm input[name="przedmioty"]:checked').map(i => i.value).filter(v => LEAD_SUBJECTS.includes(v));
  const message = cleanText(f.elements.wiadomosc.value, 1000);

  if (!/^\p{L}[\p{L} .'-]{1,59}$/u.test(name)) return { error: 'Podaj poprawne imię (same litery, 2–60 znaków).' };
  if (!isEmail(email)) return { error: 'Podaj poprawny adres e-mail.' };
  if (phone && !safePhone(phone)) return { error: 'Podaj poprawny numer telefonu (cyfry, spacje, +).' };
  if (!LEAD_DISTRICTS.includes(district) || !LEAD_FORMS.includes(mode)) return { error: 'Wybierz wartość z listy.' };
  if (!subjects.length) return { error: 'Zaznacz co najmniej jeden przedmiot.' };
  if (!f.elements.zgoda.checked) return { error: 'Zaznacz zgodę na przetwarzanie danych.' };

  return {
    fields: [
      ['imie', name],
      ['email', email],
      ['telefon', phone],
      ['dzielnica', district],
      ['przedmioty', subjects.join(', ')],
      ['forma', mode],
      ['wiadomosc', message],
      ['wynik_kalkulatora', cleanText(f.elements.wynik_kalkulatora.value, 40)],
      ['profil', cleanText(f.elements.profil.value, 120)],
      ['lista_marzen', cleanText(f.elements.lista_marzen.value, 600)],
      ['zgoda', 'tak'],
      ['_subject', 'Nowe zgłoszenie: korepetycje ósmoklasisty – Łódź'],
    ],
  };
}

async function submitLead(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = $('#leadMsg');
  const btn = f.querySelector('button[type="submit"]');
  const show = (text, ok) => {
    msg.textContent = text;
    msg.className = `mt-3 rounded-lg p-3 text-sm ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`;
  };
  const okText = 'Dziękujemy! Zgłoszenie zostało wysłane. Odezwiemy się najszybciej, jak to możliwe.';

  // Pułapki na boty: ukryte pole i zbyt szybkie wysłanie – udajemy sukces, nic nie wysyłamy.
  if (f.elements._gotcha.value || Date.now() - pageOpenedAt < MIN_FILL_MS) { f.reset(); show(okText, true); render(); return; }

  const last = Number(storageGet(LEAD_KEY));
  if (Number.isFinite(last) && last > 0 && Date.now() - last < LEAD_COOLDOWN_MS) {
    show('Twoje zgłoszenie zostało już wysłane. Kolejne możesz wysłać za kilka minut.', false);
    return;
  }

  const result = validateLead(f);
  if (result.error) { show(result.error, false); return; }

  const endpoint = safeHttpsUrl(CONFIG.leadEndpoint);
  if (endpoint) {
    const body = new FormData();
    for (const [k, v] of result.fields) body.append(k, v);
    btn.disabled = true;
    try {
      const res = await fetch(endpoint, {
        method: 'POST', body, headers: { Accept: 'application/json' },
        credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', redirect: 'error',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      storageSet(LEAD_KEY, String(Date.now()));
      f.reset();
      show(okText, true);
    } catch (err) {
      console.error(err);
      show('Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę.', false);
    } finally {
      btn.disabled = false;
      render();
    }
  } else if (isEmail(CONFIG.leadEmail)) {
    const lines = result.fields.filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`);
    window.location.href = `mailto:${CONFIG.leadEmail}?subject=${encodeURIComponent('Nowe zgłoszenie: korepetycje ósmoklasisty – Łódź')}&body=${encodeURIComponent(lines.join('\n'))}`;
    storageSet(LEAD_KEY, String(Date.now()));
    show('Otworzyliśmy Twój program pocztowy z gotową wiadomością – wystarczy ją wysłać.', true);
  } else {
    console.warn('Formularz nieskonfigurowany: uzupełnij CONFIG.leadEndpoint (https://) lub CONFIG.leadEmail.');
    show('Formularz jest chwilowo niedostępny. Spróbuj ponownie później.', false);
  }
}

/* =========================================================================
   EKSPORT PDF (pdfmake z tej samej domeny, ładowany dopiero po kliknięciu)
   ========================================================================= */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Nie można załadować ${src}`));
    document.head.appendChild(s);
  });
}
let pdfReady = null;
function ensurePdfMake() {
  if (!pdfReady) {
    pdfReady = (async () => {
      if (!window.pdfMake) await loadScript(PDFMAKE_SRC);
      await loadScript(VFS_SRC);
    })().catch(err => { pdfReady = null; throw err; });
  }
  return pdfReady;
}

async function exportPdf(btn) {
  if (btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Tworzę PDF…';
  try {
    await ensurePdfMake();
    window.pdfMake.createPdf(buildPdfDoc()).download('plan-rekrutacyjny-osmoklasisty-lodz.pdf');
    toast('Plan rekrutacyjny został pobrany.');
  } catch (err) {
    console.error(err);
    toast('Nie udało się utworzyć PDF. Odśwież stronę i spróbuj ponownie.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function buildPdfDoc() {
  const st = state;
  const list = profileResults(st);
  const act = activeProfile(st, list);
  const sH = act.res.totalH;
  const cats = categorize(sH);
  const today = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const C = { ink: '#0f172a', muted: '#64748b', brand: '#3730a3', dream: '#6d28d9', real: '#0369a1', safe: '#047857', out: '#475569' };

  const table = (head, rows, widths, emptyText) => rows.length ? {
    table: { headerRows: 1, widths, body: [head.map(h => ({ text: h, bold: true, fillColor: '#eef2ff', color: C.brand })), ...rows] },
    layout: 'lightHorizontalLines', margin: [0, 0, 0, 8],
  } : { text: emptyText, italics: true, color: C.muted, margin: [0, 0, 0, 8] };

  const gapText = (s, kind) => {
    const d = s.minH - sH;
    if (kind === 'dream' || kind === 'out') return `brakuje ${fmt(d)} pkt (${hintForGap(st, d)})`;
    if (kind === 'real') return `+${fmt(-d)} pkt nad najniższym progiem`;
    return `+${fmt(-d)} pkt zapasu${inSafeBand(sH, s) ? ' (strefa 20–30 pkt)' : ''}`;
  };
  const schoolRows = kind => cats[kind].map(s => [s.name, `T${s.tier}`, `${fmt(s.minH)} – ${fmt(s.maxH)}`, gapText(s, kind)]);
  const catBlock = (kind, title, desc) => [
    { text: `${title} (${cats[kind].length})`, style: 'h3', color: C[kind] },
    { text: desc, style: 'small', margin: [0, 0, 0, 4] },
    table(['Liceum', 'Poziom', 'Progi (pkt)', 'Twoja sytuacja'], schoolRows(kind), ['*', 34, 72, 150], 'Brak szkół w tej kategorii.'),
  ];

  // Propozycja kolejności 3 szkół: marzenie → realne → bezpieczna
  const dreamPick = cats.dream[0];
  const safePick = cats.safe.find(s => inSafeBand(sH, s)) || cats.safe[0];
  const realPicks = cats.real.slice(0, Math.max(0, 3 - (dreamPick ? 1 : 0) - (safePick ? 1 : 0)));
  const ordered = [];
  if (dreamPick) ordered.push(['marzenie', dreamPick, `brakuje ${fmt(dreamPick.minH - sH)} pkt`]);
  for (const s of realPicks) ordered.push(['realny', s, `+${fmt(sH - s.minH)} pkt nad progiem`]);
  if (safePick) ordered.push(['bezpieczny', safePick, `+${fmt(sH - safePick.minH)} pkt zapasu`]);
  const picks = ordered.map(([kind, s, why], i) => [`${i + 1}. wybór (${kind})`, s.name, why]);

  const nextSchools = SCHOOLS.filter(s => s.minH > sH).sort((a, b) => a.minH - b.minH).slice(0, 6);
  const room = { mat: headroom(st, 'mat'), pol: headroom(st, 'pol'), obcy: headroom(st, 'obcy') };
  const ppTxt = (dH, w, r) => { const n = ppNeeded(dH, w); return n <= r ? `+${n}%` : '—'; };

  return {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 52],
    info: { title: 'Plan Rekrutacyjny Ósmoklasisty – Łódź', author: CONFIG.siteName, subject: 'Rekrutacja do liceum w Łodzi' },
    footer: (cur, total) => ({
      columns: [
        { text: `${CONFIG.siteName} · ${CONFIG.siteUrl}`, fontSize: 8, color: '#94a3b8' },
        { text: `Strona ${cur} z ${total}`, alignment: 'right', fontSize: 8, color: '#94a3b8' },
      ],
      margin: [40, 18, 40, 0],
    }),
    content: [
      { text: 'Plan Rekrutacyjny Ósmoklasisty – Łódź', style: 'h1' },
      { text: `Wygenerowano ${today} w kalkulatorze ${CONFIG.siteUrl}`, style: 'small', margin: [0, 2, 0, 12] },
      {
        table: { widths: ['*', '*', '*'], body: [[
          { stack: [{ text: 'Twój wynik', style: 'small' }, { text: `${fmt(sH)} pkt`, fontSize: 20, bold: true, color: C.brand }, { text: `profil ${act.name}: ${pairText(act.res.pair)}`, style: 'small' }], margin: [8, 6, 8, 6] },
          { stack: [{ text: 'Egzamin / Oceny / Osiągnięcia', style: 'small' }, { text: `${fmt(act.res.examH)} / ${act.res.grades} / ${act.res.extras}`, fontSize: 14, bold: true }, { text: 'maks. 100 / 72 / 28', style: 'small' }], margin: [8, 6, 8, 6] },
          { stack: [{ text: 'Dopasowane licea', style: 'small' }, { text: `${cats.dream.length} / ${cats.real.length} / ${cats.safe.length}`, fontSize: 14, bold: true }, { text: 'Marzeń / Realne / Bezpieczne', style: 'small' }], margin: [8, 6, 8, 6] },
        ]] },
        layout: { fillColor: () => '#f8fafc', hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0' },
      },
      st.laureat ? { text: `Laureat konkursu kuratoryjnego – przyjęcie w pierwszej kolejności (wynik bez uprawnienia: ${fmt(act.res.rawH)} pkt).`, color: '#92400e', bold: true, margin: [0, 8, 0, 0] } : '',

      { text: '1. Dane wejściowe', style: 'h2' },
      {
        columns: [
          table(['Egzamin ósmoklasisty', 'Wynik', 'Punkty'], EXAMS.map(e => [e.name, `${st.exam[e.id]}%`, fmt(e.w * st.exam[e.id])]), ['*', 40, 40], ''),
          { width: 12, text: '' },
          table(['Przedmiot', 'Ocena', 'Pkt'], SUBJECTS.map(s => [s.name, `${st.grades[s.id]} (${GRADE_NAMES[st.grades[s.id]]})`, String(gradePts(st, s.id))]), ['*', 78, 24], ''),
        ],
      },
      { text: `Osiągnięcia: świadectwo z wyróżnieniem – ${st.wyroznienie ? 'tak (7 pkt)' : 'nie'}; wolontariat – ${st.wolontariat ? 'tak (3 pkt)' : 'nie'}; konkursy i inne osiągnięcia – ${clampInt(st.konkursy, 0, 18)} pkt.`, margin: [0, 0, 0, 4] },

      { text: '2. Twój wynik w każdym profilu klasy', style: 'h2' },
      table(['Profil', 'Liczone przedmioty (+ polski i matematyka)', 'Egzamin', 'Oceny', 'Osiągn.', 'Razem'],
        list.map(p => [
          { text: p.name + (p.id === act.id ? ' (wybrany)' : ''), bold: p.id === act.id },
          pairText(p.res.pair), fmt(p.res.examH), String(p.res.grades), String(p.res.extras),
          { text: fmt(p.res.totalH), bold: true },
        ]), [70, '*', 44, 34, 38, 44], ''),
      { text: 'W konkretnej klasie liczą się przedmioty wskazane przez szkołę – sprawdź je w ofercie oddziału.', style: 'small' },

      { text: '3. Propozycja strategii wyboru szkół', style: 'h2' },
      table(['Pozycja na liście', 'Liceum', 'Uzasadnienie'], picks, [110, '*', 130], 'Brak propozycji – zmień profil lub dane.'),
      { text: 'Zgodnie z art. 156 Prawa oświatowego wniosek składa się do maksymalnie 3 szkół publicznych (chyba że organ prowadzący dopuści więcej). Ustaw szkoły od najbardziej do najmniej preferowanej; jeśli system naboru na to pozwala, wskaż kilka oddziałów w każdej szkole.', style: 'small' },

      { text: '4. Dopasowane licea w Łodzi', style: 'h2', pageBreak: 'before' },
      ...catBlock('dream', 'Lista Marzeń', 'Próg do +10 pkt powyżej Twojego wyniku – warto walczyć na 1. pozycji.'),
      ...catBlock('real', 'Szkoły Realne', 'Twój wynik mieści się w widełkach progów.'),
      ...catBlock('safe', 'Szkoły Bezpieczne', 'Próg o 20–30 pkt (lub więcej) poniżej Twojego wyniku – bardzo duża szansa przyjęcia.'),
      ...catBlock('out', 'Na razie poza zasięgiem', 'Próg ponad 10 pkt powyżej Twojego wyniku.'),

      { text: '5. Symulator korepetycji – ile procent brakuje', style: 'h2' },
      { text: '1 punkt procentowy z polskiego lub matematyki = 0,35 pkt; z języka obcego = 0,30 pkt. Znak „—” oznacza, że sam ten przedmiot nie wystarczy.', style: 'small', margin: [0, 0, 0, 4] },
      table(['Liceum', 'Brakuje', 'Mat.', 'Pol.', 'Mat.+Pol.', 'J. obcy'],
        nextSchools.map(s => {
          const dH = s.minH - sH;
          return [s.name, fmt(dH), ppTxt(dH, 35, room.mat), ppTxt(dH, 35, room.pol), ppBothText(st, dH) || '—', ppTxt(dH, 30, room.obcy)];
        }), ['*', 44, 36, 36, 52, 40], 'Wszystkie licea są w Twoim zasięgu.'),

      { text: '6. Lista kontrolna', style: 'h2' },
      { ul: [
        'Sprawdź w ofercie wybranych szkół, które 2 przedmioty są punktowane w interesujących Cię klasach, i przelicz wynik w trybie „Własny układ”.',
        'Śledź terminy rekrutacji ustalone przez Łódzkiego Kuratora Oświaty i komunikaty systemu naboru.',
        'Odwiedź dni otwarte wybranych liceów.',
        'Po ogłoszeniu wyników egzaminu ósmoklasisty wpisz prawdziwe wyniki i wygeneruj plan ponownie.',
        'Jeśli brakuje Ci punktów, zaplanuj powtórki lub korepetycje z przedmiotu, który daje najwięcej punktów najmniejszym kosztem.',
      ], margin: [0, 0, 0, 8] },
      { text: `Zastrzeżenie: progi pochodzą z ${CONFIG.dataYearLabel} i mają charakter orientacyjny – w kolejnych latach mogą się zmienić. Wynik kalkulatora nie gwarantuje przyjęcia. Wiążące są informacje szkół, systemu naboru i komisji rekrutacyjnych. Zasady punktacji: rozporządzenie Ministra Edukacji z 3 kwietnia 2025 r. (Dz. U. 2025 poz. 464).`, style: 'small', margin: [0, 6, 0, 0] },
    ],
    styles: {
      h1: { fontSize: 20, bold: true, color: C.brand },
      h2: { fontSize: 13, bold: true, color: C.ink, margin: [0, 14, 0, 6] },
      h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 2] },
      small: { fontSize: 8, color: C.muted },
    },
    defaultStyle: { fontSize: 9, color: C.ink, lineHeight: 1.15 },
  };
}

/* =========================================================================
   START
   ========================================================================= */
let state = loadState();

function applyConfigText() {
  $$('[data-config]').forEach(el => {
    const key = el.dataset.config;
    el.textContent = Object.prototype.hasOwnProperty.call(CONFIG, key) && typeof CONFIG[key] === 'string' ? CONFIG[key] : '';
  });
  if (isEmail(CONFIG.ownerEmail)) {
    $$('[data-config-mail]').forEach(a => { a.href = `mailto:${CONFIG.ownerEmail}`; a.textContent = CONFIG.ownerEmail; });
    $('#footerContact').classList.remove('hidden');
  }
  $('#year').textContent = new Date().getFullYear();
}

buildInputs();
syncInputsFromState();
applyConfigText();
renderPartners();
bindEvents();
render();
})();
