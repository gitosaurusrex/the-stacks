# Batch ingest file format

Upload in **/admin → Batch ingest**. You'll get a preview first. Nothing is saved until you click **Apply**.

A file is one JSON object with up to four lists. Any of them can be left out.

```json
{
  "genres":    [ … ],
  "companies": [ … ],
  "people":    [ … ],
  "items":     [ … ]
}
```

Items point at genres, studios and people **by id**. Those records can be in the same file or already in the database. A full working example is [`seed/example-catalog.json`](../seed/example-catalog.json). **Export** in the admin also produces this exact format, which makes it a handy template and backup.

## Conventions

| Thing | Format |
|---|---|
| **id** | lowercase letters, numbers, dashes: `hideo-kojima`. Optional; generated from the English title/name if missing. Permanent once created (it's the URL). |
| **Translated text** | `{ "en": "…", "ja": "…", "th": "…", "es": "…" }` (English, Japanese, Thai, Spanish). Only `en` is required, and a plain string means English only. Any missing translation falls back to English; a missing Japanese one is also flagged in the admin. |
| **Lists** | JSON arrays (`["ps4", "pc"]`). A comma-separated string also works. |
| **Dates** | `YYYY-MM-DD` |
| **Countries** | 2-letter codes: `US`, `JP`, `GB`, `KR`, `FR`… Names are translated automatically on the site. |
| **Links** | full `https://` URLs |
| **Source flags** | optional on any record: `"sources": { "summary.th": "ai", "title.ja": "tmdb" }` marks which translations came from Cloudflare AI or TMDB (keys are `field.language`). The site sets these itself when it fills translations; the admin shows them as checkboxes. A flag for a field that's empty is dropped. With **Fill blanks**, a flag only comes along with the text it describes. |
| **Images** | a full `https://` image link, or a `/media/…` path for an image already stored on the site (e.g. from an export). With "Keep a copy of artwork" on, linked images are downloaded into the site's storage right after the ingest. |

## items

Every item has these fields:

| Field | Required | Notes |
|---|---|---|
| `kind` | ✅ | `film`, `tv`, `song`, `album` or `game`. This decides which section it's in. |
| `title` | ✅ | translated. Use the official release title in each language (e.g. the Japanese release title for `ja`). |
| `summary` | ✅ | translated, spoiler-free |
| `genres` | ✅ | genre **slugs from the same section**, e.g. `["indie"]` on a game means the *Games* "Indie" |
| `featured` | | `true` to show on the home page under "Start here" |
| `added` | | date it was added to the site. Defaults to the ingest date. Kept when a record is replaced. |

### Film & TV (`film`, `tv`)

| Field | Required | Notes |
|---|---|---|
| `year` | ✅ | release year |
| `countries` | | release countries |
| `directors` | ✅ | people ids. For TV, the creators. |
| `cast` | | people ids, top-billed first |
| `runtime` | | minutes |
| `poster`, `backdrop` | | image URLs. `npm run fetch-art` can fill these from TMDB. |
| `watch_service` | | e.g. `"Netflix"`, `"Tubi"` |
| `watch_url` | | the Watch button |
| `availability` | | `{ "free": true, "limited_time": true, "until": "2026-12-31" }`. All three parts are optional. The badge ("Free for a limited time · Tubi · until Dec 31") shows a "Leaving soon!" alert in the last 14 days and hides itself once `until` has passed. `true` alone means free. |
| `trailer_url` | | |
| `tmdb_id` | | helps `fetch-art` and duplicate detection |

### Music (`song`, `album`)

| Field | Required | Notes |
|---|---|---|
| `year` | ✅ | |
| `artists` | ✅ | people ids (bands are "people" too) |
| `album` | | translated. For songs: the album it's on. |
| `countries` | | |
| `cover` | | image URL. `fetch-art` can get it from a real Spotify link. |
| `spotify_url` | | the Spotify button |
| `video_url` | | the Music video button (hidden when empty) |

### Games (`game`)

| Field | Required | Notes |
|---|---|---|
| `release_us` | at least one date | date. Shown on the English page. |
| `release_jp` | at least one date | date. Shown on the Japanese page. Leave it out if it wasn't released in Japan; the page then shows "Unknown". |
| `release_th` | at least one date | date. Shown on the Thai page. |
| `release_sa` | at least one date | date (South America). Shown on the Spanish page. |
| `platforms` | ✅ | codes: `pc`, `mac`, `steam-deck`, `ios`, `android`, `ps5`, `ps4`, `ps3`, `ps2`, `ps1`, `ps-vita`, `psp`, `xbox-series`, `xbox-one`, `xbox-360`, `xbox`, `switch-2`, `switch`, `wii-u`, `wii`, `3ds`, `ds`, `gamecube`, `n64`, `snes`, `nes`, `game-boy`, `gba`, `dreamcast`, `saturn`, `genesis`, `meta-quest`, `ps-vr2` |
| `developers` | ✅ | company ids |
| `publishers` | | company ids |
| `creators` | | people ids for notable creators (e.g. Hideo Kojima). Each gets a page listing their games. |
| `cover` | | image URL. `fetch-art` can fill it with the box art from the game's English Wikipedia article. |
| `igdb_id` | | optional; helps duplicate detection |

The year shown on cards is taken from the earliest release date.

## people

| Field | Required | Notes |
|---|---|---|
| `id` | | e.g. `hideo-kojima` |
| `name` | ✅ | translated. Use the name as written in each language: Japan (`小島秀夫`, `ドゥニ・ヴィルヌーヴ`), Thailand (`คริสโตเฟอร์ โนแลน`). Latin-script names usually stay the same in Spanish, so `es` can be left out. |
| `bio` | | translated, two or three sentences. `npm run fetch-art` (or **Fill in missing** in the admin) can fill it from TMDB. |
| `bio_credit` | | shown under the bio. Required when the text comes from Wikipedia, e.g. `"Bio: Wikipedia via TMDB, CC BY-SA"`; filled in automatically along with TMDB bios. |
| `photo` | | headshot URL |
| `photo_credit` | | shown under the photo. Required for Wikimedia Commons images, e.g. `"Photo: Jane Doe, CC BY-SA 4.0"`. |

## companies (studios)

| Field | Required | Notes |
|---|---|---|
| `id` | | e.g. `kojima-productions` |
| `name` | ✅ | translated |
| `country` | | 2-letter code |
| `logo` | | image URL |

## genres

Genres belong to one section, so "Indie" in Games is a different genre from "Indie" in Film & TV.

| Field | Required | Notes |
|---|---|---|
| `medium` | ✅ | `watch` (Film & TV), `listen` (Music) or `play` (Games) |
| `slug` | | e.g. `indie`. Generated from the English name if missing. |
| `name` | ✅ | translated |
| `hue` | | tag colour, 0–360 (0 red · 45 orange · 130 green · 200 blue · 270 purple · 330 pink) |

## What happens on upload

Each record is compared with the database:

- **New**: added (untick *Include* to leave it out).
- **Unchanged**: skipped automatically.
- **Exists · changed**: you see a field-by-field diff and choose one of:
  - **Replace**: use the file's version. Fields missing from the file are cleared; the added date is kept.
  - **Fill blanks**: keep everything that's there, only add what's missing.
  - **Skip**: leave it alone.
- **Error**: shown with the reason (bad date, unknown platform, a reference to a person who doesn't exist…). Errors are skipped; the rest can still be applied.

A record also counts as "already exists" when it has a different id but the same TMDB/IGDB id, the same title + year, or the same name. The preview says how it was matched. If it's actually something different, choose **Not the same — add as new**. References elsewhere in the file are redirected to the existing record automatically.

Everything is applied in a single transaction, and the summary page shows the new items exactly as visitors will see them.

## Generating a file with Claude

Paste this page and say something like: *"Make an ingest file for these films: …, with spoiler-free summaries and short bios for the directors, in English, Japanese, Thai and Spanish, using each country's official release titles."* Then run `npm run fetch-art -- file.json` to add official artwork. Check the translations, watch links and dates before uploading. To add Thai or Spanish to things already on the site, upload a file with just those translations and choose **Fill blanks in all**.
