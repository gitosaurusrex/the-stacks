# How The Stacks works

This is the engineer's tour: how a page gets its data, how records are stored and ingested, how artwork and
translations are filled in, and how the admin is protected. For features, setup, deploying and managing content, see
the [README](../README.md). For the batch file format, see [ingest-format.md](ingest-format.md).

- [The big picture](#the-big-picture)
- [Data model](#data-model)
- [The public site](#the-public-site)
- [Languages](#languages)
- [Time of day](#time-of-day)
- [Link previews, sitemap and robots](#link-previews-sitemap-and-robots)
- [Batch ingest](#batch-ingest)
- [Images](#images)
- [Artwork lookups](#artwork-lookups)
- [Filling in missing info and translations](#filling-in-missing-info-and-translations)
- [Admin login](#admin-login)
- [Admin API](#admin-api)
- [Testing and CI](#testing-and-ci)
- [Numbers worth knowing](#numbers-worth-knowing)
- [Code map](#code-map)
- [Third-party data and credits](#third-party-data-and-credits)

## The big picture

```
Browser (React SPA) ─── GET /api/catalog (ETag, no-cache) ───┐
       │                                                      ▼
       ├── /media/<hash>.<ext> ──────────────▶  Cloudflare Worker (Hono, worker/)  ──▶  D1 (SQLite): entities, settings,
       │                                          │                                     ingests, login_failures
       ├── /title|/music|/game/<slug>  ─────────▶ │ adds og: tags to index.html         KV or R2: stored images
       │                                          │                                     Workers AI: translation
/admin ── password ── /api/admin/* ─────────────▶ │ signed cookie, CSRF check           TMDB / Wikipedia / Spotify: art
                                                  ▼
                                   everything else: static assets straight from the CDN
```

One Worker serves the API, stored images, link previews, `robots.txt` and `sitemap.xml`. `run_worker_first` in
`wrangler.jsonc` limits it to exactly those paths (`/api/*`, `/media/*`, `/title/*`, `/music/*`, `/game/*` and the two
files). Everything else is a static asset, with client-side routes falling back to `index.html`.

## Data model

D1 holds four tables (`migrations/`):

| Table | Holds |
| --- | --- |
| `entities` | every record as one JSON document, keyed by `(type, id)`, with created and updated times. Types: `item`, `person`, `company`, `genre`. |
| `settings` | site settings as JSON values: which sections are on, **Keep a copy of artwork**, home page text per time of day |
| `ingests` | a summary of every batch ingest, so it can be reopened |
| `login_failures` | wrong-password attempts per address, for rate limiting |

Storing documents rather than columns keeps the schema stable as fields are added. `src/shared/schema.ts` defines the
fields, `src/shared/validate.ts` checks them, and both the Worker and the admin forms use those files.

- **Items** have a `kind` (`film`, `tv`, `song`, `album`, `game`) that decides their **medium** or section: `watch`,
  `listen` or `play`.
- **Genres belong to a medium**, so a genre's identity is `medium:slug`, and "Indie" in Games is not "Indie" in Film &
  TV.
- **Translated fields** are objects such as `{ en, ja, th, es }`. Only `en` is required, and anything missing falls
  back to English.
- A `sources` map (`"summary.th": "ai"`) records which translations came from TMDB or Workers AI, until someone
  reviews them.
- **Ids** are permanent slugs, since they're the URLs.

## The public site

`src/main.tsx` sets up the routes:
- `/`;
- `/watch`, `/listen` and `/play`;
- `/title/:slug`, `/music/:slug` and `/game/:slug`;
- `/person/`, `/studio/`, `/genre/:medium/` and `/country/` pages;
- `/search`.

The admin (`/admin/*`) is a lazy-loaded bundle, so visitors never download it.

**One request loads the catalog.** `GET /api/catalog` returns every record in switched-on sections and only the
people, studios and genres they use (`publicCatalog()` in `worker/pages.ts`). Every page, search and "More like this"
list is then worked out in the browser (`src/data.ts`).

- The response is `Cache-Control: no-cache` with a weak **ETag** made from the record count and latest update time,
  the settings, and the deployed Worker version. Browsers revalidate every time, admin edits show up at once, and an
  unchanged catalog costs a `304` without reading every record.
- Switching a section off hides its items and everything only they used, without deleting anything.

**Motion:** posters fly into their detail pages, pages cross-fade, and the language switch dissolves (`motion`,
`src/transitions.ts`). React and motion are split into their own long-cached chunks, so a deploy only re-downloads
the app code.

## Languages

English, 日本語, ไทย and Español. `src/i18n.tsx` holds the interface strings and picks the language:
- `?lang=` in the address wins;
- then the visitor's saved choice from the globe menu, kept in `localStorage`;
- then English.

Game release dates show the region that matches the language: US, Japan, Thailand or South America. Country names
come from the browser's `Intl.DisplayNames`.

## Time of day

The palette and greeting follow the **visitor's own clock** (`src/timeOfDay.ts`):

| Period | Hours | Palette |
| --- | --- | --- |
| morning | 5–11 | light |
| afternoon | 11–17 | light |
| evening | 17–21 | dark |
| night | 21–5 | dark |

The period is checked every minute and whenever the tab comes back into view. It sets `data-period` on the root, which
the CSS keys off, and updates the browser's `theme-color`. The greetings and intro text are site settings, editable in
the admin in every language.

## Link previews, sitemap and robots

Pages render in the browser, but chat apps, social sites and search engines don't run JavaScript. For item pages the
Worker reads `index.html` from the assets binding and adds a page title and Open Graph tags (`og:title`,
`og:description`, `og:image`, `og:locale` and so on), in the language from `?lang=`. `/sitemap.xml` lists every public
page in all four languages, and `/robots.txt` points to it (`worker/pages.ts`).

## Batch ingest

`src/shared/ingest.ts` runs the same way in the Worker and the admin preview:

1. **Analyze** (`analyze()`): validate every record, then match each one against the database. A match can come from
   the same id, the same TMDB or IGDB id, the same title and year, or the same name. The preview says which.
2. Each record becomes **new**, **same** (unchanged), **changed** (with a field-by-field `diff()`, translated fields
   flattened to `title.en`, `title.ja` and so on) or **error**.
3. For changed records the admin chooses **Replace**, **Fill blanks** (`fillBlanks()` keeps what's there and adds
   only what's missing), **Skip**, or **Not the same, add as new**. References elsewhere in the file are redirected to
   whatever the record matched.
4. **Apply** turns the decided plan into writes and runs them as **one D1 batch, so one transaction**: everything is
   saved or nothing is. The summary is stored in `ingests`.

Export produces exactly the ingest format, so an export is both a backup and a template.

## Images

- **Storage:** Workers KV by default (`MEDIA_KV`), or R2 (`MEDIA`) when that binding exists. R2 wins if both are set.
- **Keyed by content:** a stored image is named by its SHA-256 hash, `/media/<hash>.<ext>`. The same image is stored
  once and its URL never changes, so it's served with `Cache-Control: public, max-age=31536000, immutable` and
  `X-Content-Type-Options: nosniff`.
- **Checked by bytes:** uploads and copies are sniffed as JPEG, PNG, WebP, GIF or AVIF from their first bytes, up to
  15 MB. SVG is refused, since it can carry script.
- **Keep a copy of artwork** (on by default) copies linked artwork into storage: Find art picks, links in ingested
  files, and **Copy all now** for anything still linked from elsewhere. The admin works through copies in small
  batches of up to 10 a request, to stay inside Worker limits.

## Artwork lookups

`worker/art.ts` (for **Find art** in the admin) and `scripts/fetch-art.mjs` (for batch files) look up official
artwork:

| For | Source | Key |
| --- | --- | --- |
| Films, TV | TMDB: posters and backdrops. With a TMDB id, alternative and Japanese posters too. | `TMDB_API_KEY` |
| People | TMDB: headshots and English bios | `TMDB_API_KEY` |
| Games | the lead image of the game's English Wikipedia article, ranked by title and year | none |
| Music | Spotify's oEmbed for the item's `open.spotify.com` track or album link | none |

Requests to Wikimedia identify the app, as Wikimedia asks. The admin dashboard shows which sources are set up.

## Filling in missing info and translations

**Fill in missing** only ever fills empty fields:

- **From TMDB:** people's headshots and English bios, official titles of films and shows, and translations of names
  and bios. A TMDB person is only used when their TMDB credits include something they're credited on here, so a shared
  name never brings in a stranger. Bios that come from Wikipedia via TMDB carry a `bio_credit`.
- **Workers AI** (`@cf/meta/m2m100-1.2b`, `worker/translate.ts`) translates what's still missing from English:
  summaries, bios, genre names, and names in Thai and Japanese. Thai and Japanese output must come back in its own
  script, or it's discarded. Titles of games and albums and studio names are never machine-translated.
- Filled text is flagged in `sources` (`tmdb` or `ai`), so lists can show what's left to review. Visitors see a small
  "Translated automatically" note under AI-translated summaries and bios.
- Workers AI has a free daily allowance. If it runs out, the fill stops with a message and can resume after midnight
  UTC. Locally AI isn't connected unless `FYC_REMOTE_AI=true`.

## Admin login

`worker/auth.ts`:

- **One password,** the Worker secret `ADMIN_PASSWORD`, at least 12 characters. Until it's set, every admin request is
  refused with a message saying how to set it.
- **Session cookie:** signing in sets `fyc_admin=<expires>.<HMAC-SHA256(password, "admin:<expires>")>`, scoped to
  `/api/admin`, `HttpOnly; Secure; SameSite=Strict`, for 30 days. Nothing is stored server-side. Because the cookie is
  signed with the password, **changing the password signs every browser out**.
- **Comparisons** of passwords and signatures run in constant time: both sides are HMACed first, then compared byte by
  byte.
- **Rate limit:** 10 wrong passwords from one address (`cf-connecting-ip`) within 15 minutes lock that address out for
  the rest of the window.
- **Cross-site requests:** any state-changing request whose `Origin` isn't the site itself is refused. That's a second
  lock behind `SameSite=Strict`.
- **Local development:** `DEV_AUTH_BYPASS=true` in `.dev.vars` skips login, but only for `localhost` and `127.0.0.1`.

## Admin API

All under `/api/admin`, behind the login except `login` and `logout`:

| Route | Does |
| --- | --- |
| `GET /all`, `GET/POST/PUT/DELETE /entities/:type[/:id]` | read and edit records. Deleting a person, studio or genre that items still use returns 409 with the items. |
| `PUT /settings` | sections on or off, Keep a copy of artwork, home page text |
| `POST /ingest/preview`, `POST /ingest/apply`, `GET /ingests[/:id]` | batch ingest and its history |
| `GET /export` | everything, in the ingest format |
| `POST /media`, `/media/import`, `/media/mirror` | upload, copy one linked image, copy linked images in batches |
| `POST /art/search`, `GET /art/status` | Find art, and which sources are set up |
| `POST /fill`, `/people/fill`, `/translate/fill`, `GET /translate/status` | filling in missing info |

## Testing and CI

`npm test` runs vitest. The suites cover:
- validation and the ingest analyze and apply;
- login, sessions and rate limits;
- the API against a local D1;
- media sniffing and storage, artwork ranking and bios;
- translation rules, language fallbacks, link previews and the sitemap;
- time-of-day periods and greetings.

CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every pull request and push to `main`.
`npm run build` type-checks the app and the Worker before building.

`node scripts/screenshots.mjs` regenerates the README images. It builds the site and serves it with `wrangler dev`
against a **throwaway** local database, so your own local data is untouched. It loads the made-up catalog in
`scripts/demo-catalog.json` with drawn artwork, so no real posters or covers appear. It fixes the browser clock to an
afternoon for the light shots and the night for the dark ones. It needs Playwright with Chromium.

## Numbers worth knowing

| What | Value | Where |
| --- | --- | --- |
| Admin session | 30 days | `worker/auth.ts` |
| Password length | at least 12 characters | `worker/auth.ts` |
| Login lockout | 10 failures per address in 15 minutes | `worker/auth.ts` |
| Largest image | 15 MB | `worker/media.ts` |
| Stored image cache | 1 year, immutable | `worker/media.ts` |
| Image copies per request | up to 10 | `worker/index.ts` |
| KV free tier | 1 GB, 1,000 new images a day | Cloudflare |
| Time-of-day periods | 5–11, 11–17, 17–21, 21–5 | `src/shared/schema.ts` |
| Languages | en, ja, th, es | `src/shared/schema.ts` |
| D1 Time Travel | 7 days free, 30 paid | Cloudflare |

## Code map

```
worker/index.ts       routes: catalog, admin CRUD, settings, ingest, export, media, art, fill, translate
worker/auth.ts        password login, signed session cookie, rate limiting, CSRF check
worker/db.ts          loading records, catalog version, settings
worker/media.ts       image sniffing, content-hashed storage in KV or R2, serving
worker/art.ts         TMDB, Wikipedia and Spotify artwork; TMDB bios
worker/translate.ts   Workers AI translation and its rules
worker/pages.ts       public catalog, link previews, sitemap, robots.txt
src/shared/           schema, validation, ingest analyze/diff/fill (Worker + admin)
src/main.tsx          routes
src/data.ts           catalog loading and lookups in the browser
src/i18n.tsx          interface strings and language choice
src/timeOfDay.ts      period, palette and theme color
src/pages/, src/components/   public pages and building blocks
src/admin/            admin UI (lazy-loaded)
migrations/           D1 schema
seed/, ingest/        example and real ingest files
scripts/              fetch-art, seed-local, screenshots (+ demo-catalog.json)
tests/                vitest suites
```

## Third-party data and credits

The code is MIT-licensed. The data a deployment shows is not part of that:

- **TMDB:** the site uses the TMDB API for film and TV artwork, headshots, bios and official titles. TMDB's terms
  require the credit in the site footer, "This site uses the TMDB API but is not endorsed or certified by TMDB".
  Keep it if you run your own copy.
- **Wikipedia and Wikimedia:** game box art comes from English Wikipedia articles. Bios that TMDB took from Wikipedia
  are CC BY-SA and carry a `bio_credit`, shown under the bio. Wikimedia Commons photos need a `photo_credit`.
- **Spotify:** music covers come from Spotify's public oEmbed for the item's own Spotify link.
- **Artwork itself,** such as posters, covers, box art and headshots, belongs to its studios, labels, publishers and
  photographers. Nothing like it is stored in this repository. It's linked or copied into a deployment's own storage
  when the admin chooses it.
