# The Stacks

A hand-curated library of **films, TV, music and games** for everyone who visits, in **English, 日本語, ไทย and Español**.

- Official artwork, spoiler-free summaries, and the date each item was added
- **Film & TV**:
  - director/creator and top-billed cast, year and release countries
  - a **Watch** button
  - **free / limited-time availability** badges that hide themselves after the end date
- **Music**: artists, album, **Spotify** and **Music video** buttons
- **Games**:
  - release dates for the US, Japan, Thailand and South America (each language shows its own region's), platforms
  - developer and publisher (each with their own studio page)
  - notable creators (e.g. Hideo Kojima)
- **Everything links up.**
  - Every person, studio, genre and country has a page.
  - Person pages show a headshot, a bio, and everything they directed, starred in, recorded or created.
  - "More like this" on every item.
- **Separate genre pools per section.** "Indie" in Games is not "Indie" in Film & TV. The **advanced search** (⌕) combines sections, genres, years, country, platform and availability on purpose.
- **Four languages: English, 日本語, ไทย and Español.** The globe menu in the header switches between them. The site defaults to English and remembers a visitor's own choice; `?lang=en` (or `ja`, `th`, `es`) in the address forces one. Content that hasn't been translated yet shows in English.
- **Follows the time of day.** The colors and the home page greeting change with the visitor's clock: morning (5–11), afternoon (11–17), evening (17–21) and night (21–5). Morning and afternoon use light palettes, evening and night dark ones.
- Animated single-page app: posters fly into their detail pages, pages cross-fade, and the language switch dissolves.
- **Shares well and can be found.** Each page names itself in the browser tab. `/sitemap.xml` lists every page in all four languages, and `/robots.txt` points search engines at it.
- **Admin at `/admin`**, behind a password login:
  - batch JSON ingest with a preview and conflict review
  - edit or delete any record
  - switch whole sections (e.g. Games) on or off
  - export everything

## How it's built

```
Browser ── GET /api/catalog, /media/* ──┐
                                        ▼
   Cloudflare Worker (worker/)  ──  D1 database (SQLite) + KV or R2 (images)
                              ▲
/admin ── password login ── /api/admin/*  (signed session cookie checked by the Worker)
```

- **Frontend:** React + Vite (`src/`). The admin is a separate lazy-loaded bundle (`src/admin/`), so visitors never download it.
- **Backend:** one Cloudflare Worker using [Hono](https://hono.dev) (`worker/`). It serves the API and stored images, and generates `robots.txt` and `sitemap.xml`. Everything else is served straight from Cloudflare's CDN.
- **Database:** Cloudflare D1. Every record is a JSON document (`migrations/`).
- **Images:** Workers KV by default, or Cloudflare R2 if you enable it. Uploaded and copied artwork is served from `/media/<content-hash>.<ext>`, cached permanently.
- **Shared rules:** `src/shared/` holds the field definitions, validation and ingest/diff logic. Both the Worker and the admin forms use it, so there's one source of truth.
- **Login:** one admin password, stored as a Worker secret. Signing in sets an HttpOnly, SameSite=Strict cookie signed with that password, and the Worker checks it on every admin API call. Wrong passwords are rate-limited per address.

Everything runs on Cloudflare's free tier.

## Run it locally

Requires Node 22.12+.

```bash
npm install
cp .dev.vars.example .dev.vars   # lets you use /admin on localhost without logging in
npm run db:migrate               # creates the local database (in .wrangler/)
npm run dev                      # http://localhost:5173  ·  admin: http://localhost:5173/admin
npm run db:seed                  # in a second terminal: loads seed/example-catalog.json
npm test                         # validation, ingest, login and API tests
```

On GitHub, every pull request (and every push to `main`) runs `npm test` and `npm run build` ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), so a change that would break the deploy shows up on the PR first.

## Deploy (one-time setup, about 20 minutes)

### 0. Before you start

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up), and Node 22.12+ on your computer.
- Images are stored in Workers KV, which needs no payment method. (R2 is supported too, but enabling it asks for a card; see [Using R2 instead](#using-r2-instead-of-kv).)

### 1. Create the database and image storage, then deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create fyc
npx wrangler kv namespace create fyc-media
```

Paste the `database_id` that `d1 create` prints, and the `id` that `kv namespace create` prints, into [`wrangler.jsonc`](wrangler.jsonc), replacing the zeros. The bindings (`DB`, `MEDIA_KV`) are already set up there. If Wrangler offers to add the database or namespace to your config for you, say **no**, so you don't end up with a duplicate entry.

Then deploy:

```bash
npm run deploy     # type-checks and builds, applies database migrations, deploys
```

The first time, Wrangler lists the database migrations it's about to apply and asks to proceed; answer yes.

Wrangler prints your site's address, `https://the-stacks.<your-subdomain>.workers.dev`. Open it: the site loads, but it's empty until step 4. You can add your own domain any time under **Workers & Pages → the-stacks → Settings → Domains & Routes**.

**Optional: deploy on every push.** First commit and push your edited `wrangler.jsonc` (the database and namespace ids aren't secret), because Builds deploys whatever is in the repo. Then, under **Workers & Pages → the-stacks → Settings → Builds**, connect the GitHub repo:
- Build command: `npm run build`
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`

Connecting the repo doesn't start a build by itself: the first one runs on the next push to `main`. Builds and their logs show under **Workers & Pages → the-stacks → Deployments**.

If a build fails on the migrations step with a permissions error, set the deploy command to `npx wrangler deploy` and run `npm run db:migrate:remote` from your computer whenever a new file appears in `migrations/`.

#### Using R2 instead of KV

KV's free tier holds 1 GB and allows 1,000 new images a day, which is plenty for a catalog like this. R2 holds 10 GB free, but enabling it (dashboard → R2 Object Storage) asks for a payment method. To switch: run `npx wrangler r2 bucket create fyc-media`, uncomment the `r2_buckets` line in `wrangler.jsonc`, and run `npm run deploy` (it rebuilds, which picks up the change). Images already in KV aren't moved automatically.

### 2. Set the admin password

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Pick a long password (at least 12 characters; a few random words is good) and save it in your password manager. It takes effect immediately, with no redeploy needed.

Visit `https://<your-site>/admin` and sign in with it. You stay signed in on that browser for 30 days, or until you click **Sign out**.

- Until the password is set, the admin API refuses every request.
- Ten wrong passwords from one address lock that address out for 15 minutes.
- To change the password, run the same command again. That also signs out every browser that was signed in.

### 3. Artwork lookups (optional, free keys)

"Find art" in the admin looks up official artwork. Game covers (from Wikipedia) and music covers (from Spotify) need no key. Films, TV and headshots need a free TMDB key:

```bash
npx wrangler secret put TMDB_API_KEY          # themoviedb.org → Settings → API
```

`secret put` takes effect immediately, with no redeploy needed. Secrets live in Cloudflare, not in the repo. The admin Dashboard shows which sources are set up. For local development, put the same lines in `.dev.vars`.

### 4. Add the content

Open `https://<your-site>/admin`, sign in, go to **Batch ingest**, and upload [`seed/example-catalog.json`](seed/example-catalog.json) (the ingest page also has a button to download it). Then flip **Games** off on the Dashboard until your list is ready.

### Updating later

- **With Builds connected:** push to `main` and it deploys itself.
- **Without:** run `npm run deploy`.

Database migrations are applied as part of either path.

## Managing content

- **Batch ingest** (for adding many things at once):
  - Upload a JSON file. The preview shows what's new, unchanged and broken, plus a field-by-field diff for records that already exist.
  - For each existing record, choose **Replace / Fill blanks / Skip** (or apply one choice to all).
  - Nothing is saved until **Apply**. The summary page then shows the new items as they'll appear on the site.
  - Every batch is kept in "Recent ingests" so you can revisit it.
  - **The file format is documented in [`docs/ingest-format.md`](docs/ingest-format.md).** Paste that page into Claude to generate files.
- **Artwork:** every image field in the admin (poster, backdrop, cover, headshot, logo) has three buttons:
  - **⬆ Upload**, or drop a file onto the field: JPEG, PNG, WebP, GIF or AVIF up to 15 MB. Files are checked by their actual bytes; SVG is refused.
  - **✨ Find art:** pick from official artwork. Films and TV come from TMDB (and when the TMDB id is known, the choices include alternative and Japanese posters). Games come from the box art on their English Wikipedia article, music from the item's Spotify link, and headshots from TMDB.
  - **⤓ Save a copy:** download a linked image into your own storage.

  Stored images live in Workers KV (free up to 1 GB) or an R2 bucket and are served from `/media/…` on your own domain. With **Keep a copy of artwork** on (Dashboard → Images, on by default), Find art picks and artwork linked in ingested files are copied automatically. "Copy all now" handles anything still linked from elsewhere.
- **Fill in missing info (headshots, bios, translations):** only empty fields are ever filled.
  - **For one record:** **✨ Fill in missing** on its edit page opens a short list of what can be filled, grouped by source: *From TMDB* (a person's headshot and English bio, official titles of films and shows) and *Translations* (each field, with a toggle per language). Everything starts switched on; untick what you don't want, then **Fill**. The results go into the form; nothing is saved until you save.
  - **For everything:** Dashboard → **Fill in missing info**: tick *Headshots and English bios from TMDB* and/or *Translations*, then **Fill in**. It saves as it goes and reports what it filled and skipped.
  - Translations come from TMDB first (official titles, people's names, bios); Cloudflare AI then translates the rest from English (summaries, bios, genre names, names in Thai and Japanese). Titles of games and albums and studio names are never machine-translated. TMDB people are only used when their TMDB credits include something they're credited on here, so a shared name never brings in a stranger.
  - Each translated field has one box with a tab per language. A green dot means that language has text; a **TMDB** or **AI** tag says where it came from.
  - Under the box, **From TMDB** and **AI-translated** checkboxes record the source of the selected language. They're ticked when the text is filled in; untick them once you've reviewed or rewritten it. Lists show how many AI translations are left to review.
  - Visitors see a small "Translated automatically" note under summaries and bios that are still flagged as AI translations.
  - Cloudflare AI is free up to a daily allowance (10,000 "neurons", far more than a catalog this size needs); if it runs out, the fill stops with a message and can be run again after midnight UTC. It's connected by the `"ai"` binding in `wrangler.jsonc` and only runs on the deployed site; `npm run dev` doesn't connect to it unless you start it with `FYC_REMOTE_AI=true` (which needs `npx wrangler login`).
- **Find art** (on an image field) is for choosing artwork: posters, covers and headshots to pick from.
- **Artwork and bios for batch files:** `npm run fetch-art -- my-batch.json` fills poster, cover and headshot links, plus short bios for people from TMDB, into a file before you upload it. Keys go in `.env` (see `.env.example`). For things already on the site: **Export everything**, run the script on the export, then upload it and choose **Fill blanks in all**.
- **One-off edits:** Admin → Items / People / Studios / Genres.
  - The edit forms show every translated field in all four languages (English and 日本語 on top, ไทย and Español below). Only English is required; a blank translation shows English on the site, and a missing Japanese one is highlighted.
  - Pick people, studios and genres by name, or create them inline.
  - Delete anything. People, studios and genres that items still use are protected.
  - "Only ones needing attention" lists records missing Japanese, art, links, photos or bios.
- **Sections on/off:** the Dashboard switches hide Film & TV, Music or Games from the public site without deleting anything.
- **Backups:** Dashboard → **Export everything** downloads the whole database in the ingest format (stored images are referenced by their `/media/…` paths, so the KV namespace or R2 bucket is part of your backup too). D1 also has point-in-time restore ("Time Travel": 7 days on the free plan, 30 on paid) via `npx wrangler d1 time-travel`.

> The example content's watch/Spotify/YouTube links are searches, Paddington 2's "free, limited time" badge is a demo, and *Outer Wilds* has no Japan release date set. Replace them with real details. Have the Japanese proofread.

## Project layout

```
worker/          API (Hono): public catalog, admin CRUD, ingest, settings, export, images (KV/R2), art lookup; password login;
                 robots.txt, sitemap (pages.ts)
migrations/      D1 schema
src/shared/      field definitions, validation, ingest diff/merge (used by Worker + admin)
src/admin/       admin UI (lazy-loaded)
src/pages/       public pages: home, browse, detail, person, studio, genre, country, search
src/components/  cards, chips, availability badge, layout
seed/            example ingest file (everything on the site at launch)
docs/            ingest file format
scripts/         fetch-art (TMDB / Wikipedia / Spotify), seed-local
tests/           vitest: validation, ingest, auth, the API against a local D1
.github/         CI: tests and build on every pull request
```
