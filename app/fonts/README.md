# Söhne

    soehne-buch.woff2      # 400, Buch
    soehne-kraftig.woff2   # 500, Kräftig

Licensed from [Klim Type Foundry](https://klim.co.nz/retail-fonts/soehne/).
`app/layout.tsx` loads these two files through `next/font/local`, which
hashes them into the build, preloads them and follows the deployment's base
path. If they are ever missing the build fails rather than falling back.
`scripts/og.mjs` reads them from here too.

Do **not** add the `test-soehne-*` trial files: trial licence only, and a
reduced glyph set.

There is no third weight. The site uses Buch and Kräftig and nothing heavier,
because there is no Halbfett licence — see `TYPE` in `lib/design.ts`, where
every role is 400 or 500.

## A note on committing these

They are here because the site is a static export deployed from this
repository, so the files have to be in the build. That does mean the webfonts
are readable by anyone who can read the repo — which is how self-hosted
webfonts work in any case, since a browser has to be able to fetch them. Worth
knowing rather than discovering: if this repository is public, so are these,
and Klim's licence is what governs whether that is acceptable.
