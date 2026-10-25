# Kalkulator Punktów do Liceum w Łodzi 2026/2027

**Symulator klas i progów punktowych – 32 licea w Łodzi**

[Polski](#polski) · [English](#english)

![Kalkulator Liceum Łódź](og-image.png)

---

## Polski

### Co to jest?

Darmowa aplikacja internetowa dla ósmoklasistów i rodziców z Łodzi. Uczeń wpisuje **raz** wyniki egzaminu ósmoklasisty i oceny ze świadectwa, a kalkulator:

- liczy punkty rekrutacyjne (maks. 200) zgodnie z rozporządzeniem Ministra Edukacji z 3 kwietnia 2025 r. (Dz. U. 2025 poz. 464),
- przelicza wynik osobno dla profili **Mat-Fiz, Mat-Inf, Biol-Chem, Mat-Geo i Hum-Prawniczy** i sam wybiera najkorzystniejsze 2 przedmioty dodatkowe,
- pozwala wpisać **własny układ** przedmiotów z oferty konkretnej klasy,
- porównuje wynik z progami **32 łódzkich liceów** i dzieli je na: **Lista Marzeń**, **Szkoły Realne**, **Szkoły Bezpieczne** oraz **Na razie poza zasięgiem**,
- ma **Symulator Korepetycji**: pokazuje, ile punktów procentowych z matematyki, polskiego lub języka obcego potrzeba, żeby odblokować kolejne szkoły i kolejny poziom (tier) liceów,
- generuje spersonalizowany **„Plan Rekrutacyjny Ósmoklasisty – Łódź” w PDF**,
- zawiera formularz zgłoszeń na **korepetycje i kursy ósmoklasisty w Łodzi** (lead generation) oraz miejsce na partnerów,
- ma pełne SEO: meta tagi, Open Graph, dane strukturalne JSON-LD `SoftwareApplication` i `FAQPage`, `robots.txt`, `sitemap.xml`.

### Zasady punktacji

| Element | Punkty |
|---|---|
| Egzamin: j. polski | wynik % × 0,35 (maks. 35) |
| Egzamin: matematyka | wynik % × 0,35 (maks. 35) |
| Egzamin: język obcy | wynik % × 0,30 (maks. 30) |
| Oceny: polski, matematyka + 2 przedmioty wskazane przez szkołę | celujący 18, bardzo dobry 17, dobry 14, dostateczny 8, dopuszczający 2 (maks. 72) |
| Świadectwo z wyróżnieniem | 7 |
| Wolontariat | 3 |
| Konkursy i inne osiągnięcia | maks. 18 |
| Laureat konkursu kuratoryjnego / laureat lub finalista olimpiady | przyjęcie w pierwszej kolejności (art. 132 Prawa oświatowego) – w kalkulatorze 200 pkt |

### Kategorie szkół

Dla wyniku `W` i najniższego progu szkoły `P`:

- **Lista Marzeń**: `W < P ≤ W + 10`
- **Szkoły Realne**: `W − 20 < P ≤ W` i `W` poniżej najwyższego progu szkoły
- **Szkoły Bezpieczne**: `P ≤ W − 20` albo `W` ≥ najwyższego progu szkoły (szkoły w przedziale 20–30 pkt są oznaczone jako „strefa 20–30 pkt”)
- **Poza zasięgiem**: `P > W + 10`

### Pliki

| Plik | Opis |
|---|---|
| `index.html` | Strona (HTML, SEO, polityka bezpieczeństwa CSP) |
| `assets/app.js` | Cała logika: kalkulator, kategorie, symulator, PDF, formularz. **Tu jest `CONFIG` i baza progów.** |
| `assets/styles.css` | Gotowe style (wygenerowane z Tailwind CSS) |
| `src/input.css` | Źródło stylów (potrzebne tylko przy zmianie wyglądu) |
| `vendor/pdfmake/` | Biblioteka PDF hostowana lokalnie (bez zewnętrznych CDN) |
| `_headers` | Nagłówki bezpieczeństwa HTTP dla Cloudflare Pages / Netlify |
| `favicon.svg`, `og-image.png` | Ikona i obrazek do udostępniania linku |
| `robots.txt`, `sitemap.xml` | Pliki dla wyszukiwarek |
| `tests/e2e.js` | Testy automatyczne (funkcje i bezpieczeństwo) |
| `SECURITY.md`, `LICENSE` | Zasady bezpieczeństwa i licencja |

### Uruchomienie lokalne

```bash
python3 -m http.server 8000
# następnie otwórz http://localhost:8000
```

### Konfiguracja (obowiązkowa przed publikacją)

W pliku `assets/app.js` znajdź sekcję `const CONFIG = deepFreeze({ ... })` i uzupełnij:

| Pole | Co wpisać |
|---|---|
| `siteUrl` | Adres Twojej strony, np. `https://kalkulator-liceum-lodz.pl/` |
| `leadEndpoint` | Adres formularza z Formspree (np. `https://formspree.io/f/abcdwxyz`) – musi zaczynać się od `https://` |
| `leadEmail` | Opcjonalnie: e-mail używany, gdy `leadEndpoint` jest pusty |
| `ownerName`, `ownerEmail` | Dane administratora do polityki prywatności i stopki (użyj osobnego adresu e-mail dla strony) |
| `formProcessor` | Nazwa dostawcy formularza (domyślnie Formspree) |
| `partners` | Lista szkół korepetycji (adres strony tylko `https://`) |
| `dataYearLabel`, `dataUpdated` | Opis i data aktualizacji danych o progach |

Jeśli użyjesz innego dostawcy formularza niż Formspree, zmień też `connect-src` w `index.html` (meta CSP) i w `_headers`.

### Zmiana domeny

Adres `kalkulator-liceum-lodz.pl` występuje w `index.html`, `assets/app.js` (`CONFIG.siteUrl`), `robots.txt` i `sitemap.xml`. Jeśli używasz innej domeny, zamień go wszędzie.

### Aktualizacja progów (co roku po rekrutacji)

Progi są w tablicy `SCHOOLS_RAW` w `assets/app.js`. Każdy wiersz: `[krótka nazwa, pełna nazwa, najniższy próg, najwyższy próg]`. Po zmianie zaktualizuj `dataYearLabel`, `dataUpdated` oraz odpowiedź w FAQ o najlepszych liceach (w `index.html`: w treści i w JSON-LD).

### Zmiana wyglądu (dla programisty)

```bash
npm install
npm run build:css   # przebudowuje assets/styles.css po zmianie klas w index.html lub assets/app.js
npm test            # testy (wymaga: npx playwright install chromium)
```

### Publikacja

- **Cloudflare Pages (zalecane – obsługuje nagłówki bezpieczeństwa z `_headers`)**: podłącz repozytorium, *Framework preset: None*, *Build command*: puste, *Build output directory*: `/`.
- **GitHub Pages**: *Settings → Pages → Deploy from a branch → `main` / `(root)`*. GitHub Pages nie wysyła nagłówków z `_headers`; działa wtedy ochrona z `index.html` (meta CSP) i JavaScript.

### Bezpieczeństwo

Szczegóły w [SECURITY.md](SECURITY.md). Najważniejsze zasady dla właściciela:

1. Włącz weryfikację dwuetapową (2FA) na GitHubie, w rejestratorze domeny, w Formspree, w Cloudflare i na skrzynce e-mail.
2. Włącz automatyczne odnawianie domeny i blokadę transferu.
3. Na GitHubie: *Settings → Pages → Verified domains* (ochrona przed przejęciem domeny) oraz reguła ochrony gałęzi `main`.
4. Nigdy nie wpisuj haseł ani kluczy API do plików w repozytorium.
5. Eksport zgłoszeń (CSV) otwieraj w Google Sheets lub importuj jako tekst – nie zezwalaj Excelowi na „zawartość zewnętrzną”.

### Zastrzeżenia

- Progi szkół w bazie mają charakter orientacyjny. Przed publikacją porównaj je z oficjalnymi danymi rekrutacji w Łodzi.
- Wynik kalkulatora nie gwarantuje przyjęcia.
- Treść polityki prywatności i zgody w formularzu to wzór – przed zbieraniem zgłoszeń skonsultuj ją z prawnikiem.
- Strona nie jest powiązana z Urzędem Miasta Łodzi, Kuratorium Oświaty ani żadną szkołą.

---

## English

### What is it?

A free web app for 8th-grade students and parents in Łódź, Poland. The student enters their 8th-grade exam results and report-card grades **once**, and the calculator:

- computes the admission score (max 200 points) according to the Polish Minister of Education regulation of 3 April 2025 (Dz. U. 2025 item 464),
- recalculates the score for the **Mat-Fiz, Mat-Inf, Biol-Chem, Mat-Geo and Hum-Prawniczy** class profiles and automatically picks the best two additional subjects,
- supports a **custom subject pair** for a specific class,
- matches the score against the thresholds of **32 Łódź high schools** and sorts them into **Dream List**, **Realistic**, **Safe** and **Out of reach**,
- includes a **tutoring simulator** that shows how many exam percentage points unlock the next schools and the next tier,
- exports a personalised **recruitment plan PDF** (generated in the browser),
- contains a lead-capture form for **local 8th-grade exam tutoring** plus partner slots,
- ships with SEO: meta tags, Open Graph, `SoftwareApplication` and `FAQPage` JSON-LD, `robots.txt`, `sitemap.xml`.

### Tech stack

HTML5, Tailwind CSS 4 (pre-built into `assets/styles.css`), vanilla JavaScript (`assets/app.js`), pdfmake 0.2.23 (self-hosted in `vendor/`, loaded on demand). No backend, no third-party CDN. Calculator data stays in the visitor's browser (`localStorage`).

### Configure before going live

Edit `CONFIG` in `assets/app.js`: `siteUrl`, `leadEndpoint` (Formspree form URL, `https://` only), optional `leadEmail`, `ownerName`, `ownerEmail`, `formProcessor`, `partners`, `dataYearLabel`, `dataUpdated`. If you use a different domain, replace `kalkulator-liceum-lodz.pl` in `index.html`, `assets/app.js`, `robots.txt` and `sitemap.xml`. A different form provider also requires updating `connect-src` in `index.html` and `_headers`.

### Security

- Strict Content-Security-Policy (`script-src 'self'`, no inline scripts or styles, no `eval`), all assets self-hosted.
- HTTP security headers in `_headers` (Cloudflare Pages / Netlify): CSP with `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- JavaScript anti-framing fallback for GitHub Pages.
- All dynamic HTML is escaped; `localStorage` input is validated against allow-lists.
- Lead form: field allow-list, validation, honeypot, time trap, rate limit, spreadsheet formula (CSV injection) neutralisation.
- Automated tests in `tests/e2e.js` cover functionality and these protections.

### Deploy

Cloudflare Pages (recommended, applies `_headers`): no build command, output directory `/`. GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / root*.

### Disclaimer

Threshold data is indicative and should be checked against official Łódź recruitment results. The calculator does not guarantee admission. The privacy policy and consent text are templates and should be reviewed by a lawyer. Not affiliated with the City of Łódź, the Education Board (Kuratorium Oświaty) or any school.
