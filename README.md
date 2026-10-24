# Kalkulator Punktów do Liceum w Łodzi 2026/2027

**Symulator klas i progów punktowych – 32 licea w Łodzi**

[Polski](#polski) · [English](#english)

![Kalkulator Liceum Łódź](og-image.png)

---

## Polski

### Co to jest?

Darmowa aplikacja internetowa (jedna strona HTML) dla ósmoklasistów i rodziców z Łodzi. Uczeń wpisuje **raz** wyniki egzaminu ósmoklasisty i oceny ze świadectwa, a kalkulator:

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
| `index.html` | Cała aplikacja (HTML + Tailwind CSS z CDN + Vanilla JS + pdfmake ładowany na żądanie) |
| `og-image.png` | Obrazek 1200×630 wyświetlany przy udostępnianiu linku (Facebook, Messenger itp.) |
| `robots.txt`, `sitemap.xml` | Pliki dla wyszukiwarek |
| `.nojekyll` | Wyłącza przetwarzanie Jekyll na GitHub Pages |

### Uruchomienie lokalne

Otwórz `index.html` w przeglądarce (wymagany internet – biblioteki są pobierane z CDN jsDelivr) albo uruchom serwer:

```bash
python3 -m http.server 8000
# następnie otwórz http://localhost:8000
```

### Konfiguracja (obowiązkowa przed publikacją)

W `index.html` znajdź sekcję `const CONFIG = { ... }` i uzupełnij:

| Pole | Co wpisać |
|---|---|
| `siteUrl` | Adres Twojej strony, np. `https://kalkulator-liceum-lodz.pl/` |
| `leadEndpoint` | Adres formularza z Formspree (np. `https://formspree.io/f/abcdwxyz`) – zgłoszenia przyjdą na Twój e-mail |
| `leadEmail` | Opcjonalnie: e-mail używany, gdy `leadEndpoint` jest pusty (otworzy się program pocztowy użytkownika) |
| `ownerName`, `ownerEmail` | Dane administratora do polityki prywatności i stopki |
| `partners` | Lista szkół korepetycji, które Ci płacą za promocję |
| `dataYearLabel`, `dataUpdated` | Opis i data aktualizacji danych o progach |

Przykład partnera:

```js
partners: [
  { name: 'Szkoła X', desc: 'Kurs ósmoklasisty z matematyki – Śródmieście i online', url: 'https://example.pl', phone: '+48 600 000 000' },
],
```

### Zmiana domeny

Adres `kalkulator-liceum-lodz.pl` występuje w `index.html` (canonical, Open Graph, JSON-LD, `CONFIG.siteUrl`), `robots.txt` i `sitemap.xml`. Jeśli używasz innej domeny, zamień go wszędzie funkcją „Znajdź i zamień”.

### Aktualizacja progów (co roku po rekrutacji)

Progi są w tablicy `SCHOOLS_RAW` w `index.html`. Każdy wiersz: `[krótka nazwa, pełna nazwa, najniższy próg, najwyższy próg]`. Poziom (tier) liczy się automatycznie z najniższego progu. Po zmianie danych zaktualizuj `dataYearLabel`, `dataUpdated` oraz odpowiedź w FAQ o najlepszych liceach (w HTML i w JSON-LD).

### Publikacja

- **GitHub Pages**: *Settings → Pages → Source: Deploy from a branch → Branch: `main` (lub inna gałąź z plikiem `index.html`) / `(root)`*.
- **Cloudflare Pages / Netlify**: podłącz repozytorium, bez komendy budowania, katalog wyjściowy `/`.

### Zastrzeżenia

- Progi szkół w bazie mają charakter orientacyjny. Przed publikacją porównaj je z oficjalnymi danymi rekrutacji w Łodzi.
- Wynik kalkulatora nie gwarantuje przyjęcia.
- Treść polityki prywatności i zgody w formularzu to wzór – przed zbieraniem zgłoszeń skonsultuj ją z prawnikiem.
- Strona nie jest powiązana z Urzędem Miasta Łodzi, Kuratorium Oświaty ani żadną szkołą.

---

## English

### What is it?

A free single-page web app for 8th-grade students and parents in Łódź, Poland. The student enters their 8th-grade exam results and report-card grades **once**, and the calculator:

- computes the admission score (max 200 points) according to the Polish Minister of Education regulation of 3 April 2025 (Dz. U. 2025 item 464),
- recalculates the score for the **Mat-Fiz, Mat-Inf, Biol-Chem, Mat-Geo and Hum-Prawniczy** class profiles and automatically picks the best two additional subjects,
- supports a **custom subject pair** for a specific class,
- matches the score against the thresholds of **32 Łódź high schools** and sorts them into **Dream List**, **Realistic**, **Safe** and **Out of reach**,
- includes a **tutoring simulator** that shows how many exam percentage points in maths, Polish or a foreign language unlock the next schools and the next tier,
- exports a personalised **recruitment plan PDF** (pdfmake, generated in the browser),
- contains a lead-capture form for **local 8th-grade exam tutoring** plus partner slots,
- ships with SEO: meta tags, Open Graph, `SoftwareApplication` and `FAQPage` JSON-LD, `robots.txt`, `sitemap.xml`.

### Tech stack

HTML5, Tailwind CSS (browser build from the jsDelivr CDN), vanilla JavaScript, pdfmake (loaded on demand). No build step, no backend. Calculator data is stored only in the visitor's browser (`localStorage`).

### Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

### Configure before going live

Edit the `CONFIG` object in `index.html`: `siteUrl`, `leadEndpoint` (e.g. a Formspree form URL), optional `leadEmail`, `ownerName`, `ownerEmail`, `partners`, `dataYearLabel`, `dataUpdated`. If you use a domain other than `kalkulator-liceum-lodz.pl`, replace it in `index.html`, `robots.txt` and `sitemap.xml`.

### Update thresholds

Edit the `SCHOOLS_RAW` array in `index.html` (`[short name, full name, min threshold, max threshold]`). Tiers are derived from the minimum threshold.

### Deploy

GitHub Pages (*Settings → Pages → Deploy from a branch → `main` or the branch containing `index.html` / root*), Cloudflare Pages or Netlify (no build command, output directory `/`).

### Disclaimer

Threshold data is indicative and should be checked against official Łódź recruitment results. The calculator does not guarantee admission. The privacy policy and consent text are templates and should be reviewed by a lawyer before collecting leads. Not affiliated with the City of Łódź, the Education Board (Kuratorium Oświaty) or any school.
