// Testy end-to-end i bezpieczeństwa. Uruchom: npm test (wymaga: npm install && npx playwright install chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://kalkulator-liceum-lodz.pl';
const FORM = 'https://formspree.io/f/testform';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };

// Nagłówki z pliku _headers (tak jak na Cloudflare Pages / Netlify).
function parseHeaders() {
  const out = {};
  let inGlobal = false;
  for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ')) { inGlobal = line.trim() === '/*'; continue; }
    if (inGlobal) { const i = line.indexOf(':'); out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}
const HEADERS = parseHeaders();

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newContext(browser, { withHeaders = true, appPatch = null, viewport = { width: 1280, height: 900 }, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const external = [];
  const leads = [];
  await ctx.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === ORIGIN) {
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'Not found' });
      let body = fs.readFileSync(file);
      if (appPatch && rel === '/assets/app.js') body = Buffer.from(appPatch(body.toString('utf8')));
      return route.fulfill({ status: 200, body, headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...(withHeaders ? HEADERS : {}) } });
    }
    if (req.url() === FORM) {
      leads.push({ method: req.method(), body: req.postDataBuffer() ? req.postDataBuffer().toString('utf8') : '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': ORIGIN } });
    }
    if (url.origin === 'https://evil.test') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<iframe id="f" src="${ORIGIN}/" width="800" height="600"></iframe>` });
    }
    external.push(req.url());
    return route.abort();
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return { ctx, external, leads };
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  /* ---------- 1. Funkcje kalkulatora ---------- */
  const { ctx, external } = await newContext(browser);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('#profileList button');
  const txt = sel => page.locator(sel).first().innerText();
  const profileRow = async name => (await page.locator('#profileList button', { hasText: name }).first().innerText()).replace(/\s+/g, ' ');

  check((await txt('#totalScore')) === '148,25', 'domyślny wynik 148,25');
  check((await profileRow('Mat-Fiz')).includes('145,25'), 'Mat-Fiz 145,25');
  check((await profileRow('Biol-Chem')).includes('144,25'), 'Biol-Chem 144,25');
  check((await profileRow('Hum-Prawniczy')).includes('historia + j. angielski'), 'Hum-Prawniczy wybiera historię + angielski');
  for (const [k, n] of [['dream', 6], ['real', 4], ['safe', 19], ['out', 3]]) check((await txt(`#cnt-${k}`)) === String(n), `kategoria ${k} = ${n}`);
  check((await page.locator('#allSchools tr').count()) === 32, '32 licea w tabeli');

  await page.selectOption('#profileSelect', 'custom');
  await page.selectOption('#custom0', 'his');
  await page.selectOption('#custom1', 'wos');
  await sleep(100);
  const hisWos = await txt('#totalScore');
  await page.selectOption('#custom1', 'ang');
  await sleep(100);
  check(hisWos === '144,25' && (await txt('#totalScore')) === '148,25', 'historia+angielski daje 4 pkt więcej niż historia+WOS');
  await page.selectOption('#profileSelect', 'auto');

  await page.locator('#sim-mat').fill('20');
  await sleep(100);
  check((await txt('#simDelta')) === '+7,00 pkt', 'symulator: +20% z matematyki = +7,00 pkt');

  await page.fill('#exam-mat', '90');
  await sleep(100);
  check((await page.inputValue('#exam-mat-range')) === '90', 'suwak zsynchronizowany z polem');
  check((await page.getAttribute('#sim-mat', 'max')) === '10', 'maks. suwaka symulatora = zapas procentów');

  await page.check('#laureat');
  await sleep(100);
  check((await txt('#totalScore')) === '200,00' && (await txt('#cnt-safe')) === '32', 'laureat = 200 pkt, wszystkie szkoły bezpieczne');
  await page.uncheck('#laureat');

  await page.reload();
  await page.waitForSelector('#profileList button');
  check((await page.inputValue('#exam-mat')) === '90', 'dane zapamiętane po odświeżeniu');

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('header [data-action="pdf"]').click()]);
  check(dl.suggestedFilename() === 'plan-rekrutacyjny-osmoklasisty-lodz.pdf', 'PDF pobrany');
  const pdfPath = await dl.path();
  check(fs.statSync(pdfPath).size > 20000, 'PDF ma treść');

  await page.click('#resetBtn');
  await sleep(100);
  check((await page.evaluate(() => localStorage.getItem('kalkulator-liceum-lodz-v1') === null || JSON.parse(localStorage.getItem('kalkulator-liceum-lodz-v1')).exam.mat === 70)), '„Wyczyść moje dane” usuwa zapisane dane');

  /* ---------- 2. Bezpieczeństwo strony ---------- */
  check(external.length === 0, `brak zapytań do obcych serwerów: ${JSON.stringify(external)}`);
  check((await page.evaluate(() => window.__csp)).length === 0, `brak naruszeń CSP: ${JSON.stringify(await page.evaluate(() => window.__csp))}`);
  check(await page.evaluate(() => typeof window.KalkulatorLiceum === 'undefined' && typeof window.CONFIG === 'undefined'), 'brak globalnych obiektów z danymi');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(!/<script(?![^>]*\b(?:src=|type="application\/ld\+json"))[^>]*>/.test(html), 'brak skryptów inline w index.html');
  check(!/\son[a-z]+=/i.test(html), 'brak atrybutów on* (inline event handlers)');
  check(!/style=/.test(html), 'brak atrybutów style w index.html');
  check(!/https?:\/\/(?!kalkulator-liceum-lodz\.pl|schema\.org|formspree\.io)[a-z0-9.-]+/i.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), 'index.html nie odwołuje się do obcych domen');
  const ld = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => JSON.parse(s.textContent)['@type']));
  check(ld.join(',') === 'SoftwareApplication,FAQPage', 'JSON-LD poprawny');

  // Zmanipulowany localStorage nie może wstrzyknąć kodu ani zepsuć strony.
  await page.evaluate(() => localStorage.setItem('kalkulator-liceum-lodz-v1', JSON.stringify({
    exam: { pol: '<img src=x onerror=alert(1)>', mat: 1e9, obcy: -5 }, grades: { pol: '__proto__', mat: 9, ang: '<b>' },
    profile: '"><script>alert(1)</script>', custom: ['fiz', 'fiz'], konkursy: 999, laureat: 'yes', __proto__: { polluted: 1 },
  })));
  await page.reload();
  await page.waitForSelector('#profileList button');
  const tampered = await page.evaluate(() => ({
    pol: document.querySelector('#exam-pol').value, mat: document.querySelector('#exam-mat').value, obcy: document.querySelector('#exam-obcy').value,
    gPol: document.querySelector('#grade-pol').value, gMat: document.querySelector('#grade-mat').value, gAng: document.querySelector('#grade-ang').value,
    konkursy: document.querySelector('#konkursy').value, laureat: document.querySelector('#laureat').checked, profile: document.querySelector('#profileSelect').value,
  }));
  check(JSON.stringify(tampered) === JSON.stringify({ pol: '75', mat: '100', obcy: '0', gPol: '5', gMat: '5', gAng: '6', konkursy: '18', laureat: false, profile: 'auto' }),
    `zmanipulowane dane z localStorage są odrzucane lub przycinane do zakresu: ${JSON.stringify(tampered)}`);
  check((await page.locator('img[src="x"]').count()) === 0 && ({}).polluted === undefined, 'brak wstrzyknięcia HTML z localStorage');

  /* ---------- 3. Ochrona przed osadzaniem w ramce ---------- */
  for (const withHeaders of [true, false]) {
    const c = await newContext(browser, { withHeaders });
    const p = await c.ctx.newPage();
    await p.goto('https://evil.test/');
    await sleep(1500);
    const frame = p.frames().find(f => f.url().startsWith(ORIGIN));
    let framedContent = '';
    try { framedContent = frame ? await frame.locator('body').innerText({ timeout: 2000 }) : ''; } catch (_) { framedContent = ''; }
    check(!framedContent.includes('Kalkulator punktów rekrutacyjnych'), `strona nie działa w obcej ramce (${withHeaders ? 'nagłówki HTTP' : 'GitHub Pages, ochrona JS'})`);
    await c.ctx.close();
  }

  /* ---------- 4. Formularz zgłoszeń ---------- */
  const lf = await newContext(browser, { appPatch: s => s.replace("leadEndpoint: '',", `leadEndpoint: '${FORM}',`) });
  const fp = await lf.ctx.newPage();
  await fp.goto(`${ORIGIN}/`);
  await fp.waitForSelector('#profileList button');
  const fill = async (name, email, msg = '') => {
    await fp.fill('input[name="imie"]', name);
    await fp.fill('input[name="email"]', email);
    await fp.fill('textarea[name="wiadomosc"]', msg);
    await fp.check('input[name="przedmioty"][value="Matematyka"]');
    await fp.check('input[name="zgoda"]');
  };
  const submit = async () => { await fp.click('#leadForm button[type="submit"]'); await sleep(300); return fp.locator('#leadMsg').innerText(); };

  check(await fp.locator('#leadForm button[type="submit"]').isEnabled(), 'przycisk wysyłki aktywny po załadowaniu JS');
  await fill('Anna', 'anna@example.com');
  await submit();
  check(lf.leads.length === 0, 'zbyt szybka wysyłka (bot) nie jest wysyłana');
  await sleep(4200);
  await fill('=HYPERLINK("http://evil")', 'anna@example.com');
  check((await submit()).includes('poprawne imię') && lf.leads.length === 0, 'formuła w imieniu odrzucona');
  await fill('Anna', '=cmd@evil.pl');
  check((await submit()).includes('e-mail') && lf.leads.length === 0, 'podejrzany e-mail odrzucony');
  await fill('Anna', 'anna@example.com');
  await fp.evaluate(() => { document.querySelector('input[name="_gotcha"]').value = 'spam'; });
  await submit();
  check(lf.leads.length === 0, 'wypełnione ukryte pole (honeypot) blokuje wysyłkę');
  await fp.evaluate(() => { document.querySelector('input[name="_gotcha"]').value = ''; });
  await fp.evaluate(() => { const s = document.querySelector('select[name="dzielnica"]'); const o = document.createElement('option'); o.value = '<script>'; o.textContent = 'x'; s.appendChild(o); s.value = '<script>'; });
  await fill('Anna', 'anna@example.com');
  check((await submit()).includes('z listy') && lf.leads.length === 0, 'wartość spoza listy odrzucona');
  await fp.selectOption('select[name="dzielnica"]', 'Widzew');
  await fill('Anna-Maria Nowak', 'anna@example.com', '=SUM(A1:A9) proszę o kontakt');
  check((await submit()).includes('Dziękujemy') && lf.leads.length === 1, 'poprawne zgłoszenie wysłane');
  const body = lf.leads[0] ? lf.leads[0].body : '';
  check(body.includes("'=SUM(A1:A9)"), 'formuła w wiadomości zneutralizowana');
  check(!body.includes('_gotcha') && body.includes('name="imie"') && body.includes('Anna-Maria Nowak'), 'wysyłane są tylko dozwolone pola');
  await fill('Anna', 'anna@example.com');
  check((await submit()).includes('już wysłane') && lf.leads.length === 1, 'blokada wielokrotnej wysyłki');
  check(lf.external.length === 0, 'formularz nie łączy się z innymi serwerami');
  check((await fp.evaluate(() => window.__csp)).length === 0, 'brak naruszeń CSP podczas wysyłki');
  await lf.ctx.close();

  /* ---------- 5. Telefon: brak przewijania w bok ---------- */
  const mc = await newContext(browser, { viewport: { width: 390, height: 844 }, mobile: true });
  const mp = await mc.ctx.newPage();
  await mp.goto(`${ORIGIN}/`);
  await mp.waitForSelector('#profileList button');
  check((await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'brak przewijania w bok na telefonie');
  await mc.ctx.close();

  check(errors.length === 0, `brak błędów w konsoli: ${JSON.stringify(errors)}`);
  await browser.close();
  console.log(failures ? `\n${failures} TEST(Y) NIEUDANE` : '\nWSZYSTKIE TESTY ZALICZONE');
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
