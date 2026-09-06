# Söhne

Two files belong here and are deliberately not in the repository:

    soehne-buch.woff2      # 400
    soehne-kraftig.woff2   # 500

They are licensed from [Klim Type Foundry](https://klim.co.nz/retail-fonts/soehne/)
and cannot be committed. `app/globals.css` declares the `@font-face` rules that
point at them; until the files are here the sans falls back to `system-ui`, so
the layout is correct and only the letterforms are wrong.

Do **not** ship the `test-soehne-*` trial files: trial licence only, and a
reduced glyph set.

There is no third weight. The site uses Buch and Kräftig and nothing heavier,
because there is no Halbfett licence — see `TYPE` in `lib/design.ts`.
