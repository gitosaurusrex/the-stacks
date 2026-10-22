/**
 * The single source of truth for every record type: what fields exist, which are
 * translated, how they're validated, and how the admin form renders them.
 * Used by the Worker (validation, ingest) and the browser (admin forms, display).
 */

/** Site languages. English is the default for visitors and the base every translation falls back to. */
export const LANGS = ['en', 'ja', 'th', 'es'] as const;
export type Lang = (typeof LANGS)[number];
/** Languages other than English: optional translations of every text field. */
export const TRANSLATIONS = ['ja', 'th', 'es'] as const satisfies readonly Lang[];

/** How each language names itself, its short label, and the locale used for dates and country names. */
export const LANG_INFO: Record<Lang, { name: string; short: string; locale: string; english: string }> = {
  en: { name: 'English', short: 'EN', locale: 'en-US', english: 'English' },
  ja: { name: '日本語', short: '日本語', locale: 'ja-JP', english: 'Japanese' },
  th: { name: 'ไทย', short: 'ไทย', locale: 'th-TH', english: 'Thai' },
  es: { name: 'Español', short: 'ES', locale: 'es-ES', english: 'Spanish' },
};

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
export type Medium = 'watch' | 'listen' | 'play';
export type ItemKind = 'film' | 'tv' | 'song' | 'album' | 'game';
export type EntityType = 'item' | 'person' | 'company' | 'genre';

export const MEDIA: Medium[] = ['watch', 'listen', 'play'];
export const ENTITY_TYPES: EntityType[] = ['genre', 'company', 'person', 'item'];
export const KIND_MEDIUM: Record<ItemKind, Medium> = { film: 'watch', tv: 'watch', song: 'listen', album: 'listen', game: 'play' };
export const MEDIUM_KINDS: Record<Medium, ItemKind[]> = { watch: ['film', 'tv'], listen: ['song', 'album'], play: ['game'] };
/** First part of an item page's address: /title/past-lives, /music/…, /game/…. */
export const ITEM_PATH: Record<Medium, string> = { watch: 'title', listen: 'music', play: 'game' };

/** A translated string: English is required wherever the field is required; every other language falls back to English. */
export type I18n = { en: string; ja?: string; th?: string; es?: string };

/**
 * Where the text of a translated field came from, per language, keyed "field.lang" (e.g. "summary.th": "ai").
 * Set when TMDB or Cloudflare AI fills a field; the admin shows it as a checkbox the editor can untick.
 * No entry means it was written by hand (or reviewed).
 */
export type Source = 'tmdb' | 'ai';
export type Sources = Record<string, Source>;
export const sourceKey = (field: string, lang: Lang) => `${field}.${lang}`;

/** True when a translated field has text in any language. */
export const hasText = (v?: Partial<I18n>) => LANGS.some((l) => !!v?.[l]);

export interface Availability {
  /** Free to watch (e.g. Tubi, YouTube, Pluto). */
  free?: boolean;
  /** Only on the service for a limited time. */
  limited_time?: boolean;
  /** Last day it's available, YYYY-MM-DD. */
  until?: string;
}

export interface ItemDoc {
  id: string;
  kind: ItemKind;
  medium: Medium;
  title: I18n;
  summary: I18n;
  genres: string[];
  year: number;
  featured?: boolean;
  added?: string;
  // film / tv
  countries?: string[];
  directors?: string[];
  cast?: string[];
  runtime?: number;
  poster?: string;
  backdrop?: string;
  watch_service?: string;
  watch_url?: string;
  trailer_url?: string;
  availability?: Availability;
  tmdb_id?: string;
  // music
  artists?: string[];
  album?: I18n;
  cover?: string;
  spotify_url?: string;
  video_url?: string;
  // games
  release_us?: string;
  release_jp?: string;
  release_th?: string;
  release_sa?: string;
  platforms?: string[];
  developers?: string[];
  publishers?: string[];
  creators?: string[];
  igdb_id?: string;
  sources?: Sources;
}

export interface PersonDoc { id: string; name: I18n; bio?: I18n; bio_credit?: string; photo?: string; photo_credit?: string; sources?: Sources }
export interface CompanyDoc { id: string; name: I18n; country?: string; logo?: string; sources?: Sources }
export interface GenreDoc { id: string; medium: Medium; slug: string; name: I18n; hue?: number; sources?: Sources }
export type AnyDoc = ItemDoc | PersonDoc | CompanyDoc | GenreDoc;

export interface SiteSettings {
  media: Record<Medium, boolean>;
  /** Save a copy of fetched/linked artwork in the site's own storage instead of linking to the source. */
  keepCopies: boolean;
  /** Home page text. The greeting shown depends on the visitor's time of day. */
  text: Record<Period, I18n> & { intro: I18n; signoff: I18n };
}

export const PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Period = (typeof PERIODS)[number];

/** Morning 5–11, afternoon 11–17, evening 17–21, night 21–5, by the visitor's own clock. */
export function periodAt(d: Date): Period {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export const DEFAULT_SETTINGS: SiteSettings = {
  media: { watch: true, listen: true, play: true },
  keepCopies: true,
  text: {
    morning: { en: 'Good morning', ja: 'おはようございます', th: 'สวัสดีตอนเช้า', es: 'Buenos días' },
    afternoon: { en: 'Good afternoon', ja: 'こんにちは', th: 'สวัสดีตอนบ่าย', es: 'Buenas tardes' },
    evening: { en: 'Good evening', ja: 'こんばんは', th: 'สวัสดีตอนเย็น', es: 'Buenas tardes' },
    night: { en: 'Hello, night owl', ja: 'お疲れさまです', th: 'สวัสดีตอนค่ำ', es: 'Buenas noches' },
    intro: {
      en: "Welcome to The Stacks: a collection of media that's worth your time.",
      ja: 'The Stacksへようこそ。観る価値・聴く価値・遊ぶ価値のある作品を集めたコレクションです。',
      th: 'ยินดีต้อนรับสู่ The Stacks: คอลเลกชันสื่อที่คุ้มค่ากับเวลาของคุณ',
      es: 'Te damos la bienvenida a The Stacks: una colección de contenido que vale tu tiempo.',
    },
    signoff: { en: 'Enjoy browsing', ja: 'どうぞごゆっくり', th: 'ขอให้สนุกกับการเลือกชม', es: 'Disfruta explorando' },
  },
};

// ───────────────────────────── Fixed vocabularies ─────────────────────────────

export const PLATFORMS: Record<string, string> = {
  pc: 'PC', mac: 'Mac', 'steam-deck': 'Steam Deck', ios: 'iOS', android: 'Android',
  ps5: 'PlayStation 5', ps4: 'PlayStation 4', ps3: 'PlayStation 3', ps2: 'PlayStation 2', ps1: 'PlayStation',
  'ps-vita': 'PS Vita', psp: 'PSP',
  'xbox-series': 'Xbox Series X|S', 'xbox-one': 'Xbox One', 'xbox-360': 'Xbox 360', xbox: 'Xbox',
  'switch-2': 'Nintendo Switch 2', switch: 'Nintendo Switch', 'wii-u': 'Wii U', wii: 'Wii',
  '3ds': 'Nintendo 3DS', ds: 'Nintendo DS', gamecube: 'GameCube', n64: 'Nintendo 64',
  snes: 'Super Nintendo', nes: 'NES', 'game-boy': 'Game Boy', gba: 'Game Boy Advance',
  dreamcast: 'Dreamcast', saturn: 'Sega Saturn', genesis: 'Mega Drive / Genesis',
  'meta-quest': 'Meta Quest', 'ps-vr2': 'PS VR2',
};

export const SELECT_KINDS = [
  { value: 'film', label: 'Film' }, { value: 'tv', label: 'TV show' },
  { value: 'song', label: 'Song' }, { value: 'album', label: 'Album' }, { value: 'game', label: 'Game' },
];

// ───────────────────────────── Field specs ─────────────────────────────

export type FieldType =
  | 'id' | 'text' | 'textarea' | 'number' | 'date' | 'url' | 'image' | 'bool'
  | 'select' | 'countries' | 'country' | 'platforms' | 'refs' | 'availability';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  i18n?: boolean;
  required?: boolean;
  hint?: string;
  /** For `refs`: what the ids point to. Genre refs are scoped to the item's medium. */
  to?: 'person' | 'company' | 'genre';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

const f = (key: string, label: string, type: FieldType, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type, ...extra });

const ITEM_HEAD: FieldSpec[] = [
  f('id', 'ID (URL slug)', 'id', { hint: 'Lowercase letters, numbers and dashes. Leave blank to generate from the English title.' }),
  f('kind', 'Type', 'select', { required: true, options: SELECT_KINDS }),
  f('title', 'Title', 'text', { i18n: true, required: true, hint: 'Use the official release title in each language (e.g. the Japanese release title for 日本語). Leave a language blank to show English.' }),
  f('summary', 'Spoiler-free summary', 'textarea', { i18n: true, required: true }),
  f('genres', 'Genres', 'refs', { to: 'genre', required: true }),
];
const ITEM_TAIL: FieldSpec[] = [
  f('featured', 'Feature on the home page', 'bool'),
  f('added', 'Date added to the site', 'date', { hint: 'Defaults to the day it was ingested.' }),
];

export const ITEM_FIELDS: Record<Medium, FieldSpec[]> = {
  watch: [
    ...ITEM_HEAD,
    f('year', 'Release year', 'number', { required: true, min: 1880, max: 2100 }),
    f('countries', 'Release countries', 'countries'),
    f('directors', 'Director(s) — creator(s) for TV', 'refs', { to: 'person', required: true }),
    f('cast', 'Top-billed cast', 'refs', { to: 'person' }),
    f('runtime', 'Runtime (minutes, films)', 'number', { min: 1, max: 1000 }),
    f('poster', 'Poster (official art)', 'image'),
    f('backdrop', 'Backdrop (wide still)', 'image'),
    f('watch_service', 'Where to watch (e.g. Netflix)', 'text'),
    f('watch_url', 'Watch link', 'url'),
    f('availability', 'Availability', 'availability', { hint: 'Free and/or only available for a limited time.' }),
    f('trailer_url', 'Trailer link', 'url'),
    f('tmdb_id', 'TMDB ID', 'text'),
    ...ITEM_TAIL,
  ],
  listen: [
    ...ITEM_HEAD,
    f('artists', 'Artist(s)', 'refs', { to: 'person', required: true }),
    f('album', 'From the album (songs)', 'text', { i18n: true }),
    f('year', 'Release year', 'number', { required: true, min: 1880, max: 2100 }),
    f('countries', 'Release countries', 'countries'),
    f('cover', 'Cover art', 'image'),
    f('spotify_url', 'Spotify link', 'url'),
    f('video_url', 'Music video link', 'url'),
    ...ITEM_TAIL,
  ],
  play: [
    ...ITEM_HEAD,
    f('release_us', 'US release date', 'date', { hint: 'Shown on the English page.' }),
    f('release_jp', 'Japan release date', 'date', { hint: 'Shown on the 日本語 page. Leave blank if it was not released in Japan.' }),
    f('release_th', 'Thailand release date', 'date', { hint: 'Shown on the ไทย page.' }),
    f('release_sa', 'South America release date', 'date', { hint: 'Shown on the Español page.' }),
    f('platforms', 'Platforms', 'platforms', { required: true }),
    f('developers', 'Developer(s)', 'refs', { to: 'company', required: true }),
    f('publishers', 'Publisher(s)', 'refs', { to: 'company' }),
    f('creators', 'Notable creators', 'refs', { to: 'person', hint: 'e.g. Hideo Kojima — each gets a page with their other games.' }),
    f('cover', 'Cover art', 'image'),
    f('igdb_id', 'IGDB ID', 'text'),
    ...ITEM_TAIL,
  ],
};

export const ENTITY_FIELDS: Record<Exclude<EntityType, 'item'>, FieldSpec[]> = {
  person: [
    f('id', 'ID (URL slug)', 'id', { hint: 'Leave blank to generate from the English name.' }),
    f('name', 'Name', 'text', { i18n: true, required: true, hint: '日本語: the name as written in Japan (e.g. ドゥニ・ヴィルヌーヴ, 小島秀夫).' }),
    f('bio', 'Short bio', 'textarea', { i18n: true, hint: '"Fill in missing" (top of this page) can fill this in from TMDB.' }),
    f('bio_credit', 'Bio source', 'text', { hint: 'Shown under the bio. Required when the text comes from Wikipedia, e.g. "Bio: Wikipedia, CC BY-SA".' }),
    f('photo', 'Headshot', 'image'),
    f('photo_credit', 'Photo credit', 'text', { hint: 'Required for Wikimedia Commons photos, e.g. "Photo: Jane Doe, CC BY-SA 4.0".' }),
  ],
  company: [
    f('id', 'ID (URL slug)', 'id', { hint: 'Leave blank to generate from the English name.' }),
    f('name', 'Name', 'text', { i18n: true, required: true }),
    f('country', 'Country', 'country'),
    f('logo', 'Logo', 'image'),
  ],
  genre: [
    f('medium', 'Section', 'select', { required: true, options: [{ value: 'watch', label: 'Film & TV' }, { value: 'listen', label: 'Music' }, { value: 'play', label: 'Games' }] }),
    f('slug', 'Slug', 'id', { hint: 'Leave blank to generate from the English name. "indie" in Games is separate from "indie" in Film & TV.' }),
    f('name', 'Name', 'text', { i18n: true, required: true }),
    f('hue', 'Tag colour hue (0–360)', 'number', { min: 0, max: 360, hint: '0 red · 45 orange · 130 green · 200 blue · 270 purple · 330 pink' }),
  ],
};

export function fieldsFor(type: EntityType, kindOrMedium?: string): FieldSpec[] {
  if (type !== 'item') return ENTITY_FIELDS[type];
  const medium = (MEDIA as string[]).includes(kindOrMedium ?? '')
    ? (kindOrMedium as Medium)
    : KIND_MEDIUM[kindOrMedium as ItemKind] ?? 'watch';
  return ITEM_FIELDS[medium];
}

// ───────────────────────────── Helpers ─────────────────────────────

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const genreKey = (medium: Medium, slug: string) => `${medium}:${slug}`;

export function isDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Images stored in the site's own storage are served from /media/<file>. */
export const MEDIA_PREFIX = '/media/';
export const isStoredImage = (s: string | undefined) => !!s && s.startsWith(MEDIA_PREFIX);
export const IMAGE_FIELDS = ['poster', 'backdrop', 'cover', 'photo', 'logo'] as const;

export function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Best label for a record in either language. */
export function docLabel(type: EntityType, doc: Partial<AnyDoc>, lang: Lang = 'en'): string {
  const field = type === 'item' ? (doc as ItemDoc).title : (doc as PersonDoc).name;
  return (field && (field[lang] || field.en)) || doc.id || '(untitled)';
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Is this availability window still open? */
export function availabilityActive(a: Availability | undefined, now = today()): boolean {
  if (!a || (!a.free && !a.limited_time)) return false;
  return !a.until || a.until >= now;
}
