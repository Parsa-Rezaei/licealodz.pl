# Bezpieczeństwo / Security

## Zgłaszanie podatności (PL)

Jeśli znajdziesz błąd bezpieczeństwa, **nie publikuj go w Issues**. Zgłoś go prywatnie przez zakładkę **Security → Report a vulnerability** w tym repozytorium. Odpowiemy najszybciej, jak to możliwe.

## Reporting a vulnerability (EN)

Please **do not open a public issue**. Report it privately via **Security → Report a vulnerability** in this repository.

## Zabezpieczenia strony / Security measures

- Wszystkie skrypty, style i czcionki są serwowane z tej samej domeny (brak zewnętrznych CDN).
- Content-Security-Policy: `script-src 'self'`, brak `unsafe-inline` i `unsafe-eval`, `connect-src` ograniczony do dostawcy formularza.
- Nagłówki HTTP (`_headers`): CSP z `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- Ochrona przed osadzaniem w ramce także w JavaScript (dla GitHub Pages, który nie obsługuje własnych nagłówków).
- Wszystkie dane wstawiane do HTML są escapowane; dane z `localStorage` są walidowane.
- Formularz: lista dozwolonych pól i wartości, walidacja, honeypot, pułapka czasowa, limit wysyłek, neutralizacja formuł arkusza (CSV injection).
- Brak sekretów w repozytorium. Adres formularza Formspree jest publiczny z założenia.

## Integralność bibliotek / Vendor integrity

Pliki w `vendor/pdfmake/` są identyczne z oficjalną paczką npm `pdfmake@0.2.23` (SHA-256):

```
4410187c36ed6dd8cbfbaeea5b6fab6244238b3479c6de1cfe125d2c61fc2ba0  vendor/pdfmake/pdfmake.min.js
23e7c970fa9e75d296ea565939502a69ab2184cf40756c7d4670b6dabf470b58  vendor/pdfmake/vfs_fonts.js
```

Sprawdzenie: `sha256sum vendor/pdfmake/*.js`
