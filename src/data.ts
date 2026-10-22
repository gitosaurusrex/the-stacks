import { availabilityActive, genreKey, ITEM_PATH, LANGS, MEDIA, type CompanyDoc, type GenreDoc, type ItemDoc, type Lang, type Medium, type PersonDoc, type SiteSettings, type I18n, type Sources, sourceKey } from './shared/schema';
import type { Company, Entry, Genre, Item, Localized, Person } from './types';

export interface Catalog {
  settings: SiteSettings;
  items: ItemDoc[];
  people: PersonDoc[];
  companies: CompanyDoc[];
  genres: GenreDoc[];
}

const isI18n = (v: unknown): v is I18n =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { en?: unknown }).en === 'string';

function localize<T extends object>(doc: T, lang: Lang): Localized<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) out[k] = isI18n(v) ? v[lang] || v.en : v;
  return out as Localized<T>;
}

const entry = <T extends { id: string }>(doc: T): Entry<T> =>
  ({ slug: doc.id, doc, ...Object.fromEntries(LANGS.map((l) => [l, localize(doc, l)])) }) as Entry<T>;

// Live bindings: populated once by setCatalog() before the app renders.
export let settings: SiteSettings;
export let allItems: Item[] = [];
export let people: Person[] = [];
export let companies: Company[] = [];
export let genres: Genre[] = [];
export let enabledMedia: Medium[] = [];
let byMedium: Record<Medium, Item[]> = { watch: [], listen: [], play: [] };
let itemMap = new Map<string, Item>();
let personMap = new Map<string, Person>();
let companyMap = new Map<string, Company>();
let genreMap = new Map<string, Genre>();

const byAddedDesc = (a: Item, b: Item) => (b.en.added ?? '').localeCompare(a.en.added ?? '') || b.en.year - a.en.year;

export function setCatalog(c: Catalog) {
  settings = c.settings;
  enabledMedia = MEDIA.filter((m) => c.settings.media[m]);
  allItems = c.items.map((d) => ({ ...entry(d), section: d.medium })).sort(byAddedDesc);
  people = c.people.map(entry);
  companies = c.companies.map(entry);
  genres = c.genres.map(entry);
  byMedium = { watch: [], listen: [], play: [] };
  for (const i of allItems) byMedium[i.section].push(i);
  itemMap = new Map(allItems.map((i) => [i.slug, i]));
  personMap = new Map(people.map((p) => [p.slug, p]));
  companyMap = new Map(companies.map((p) => [p.slug, p]));
  genreMap = new Map(genres.map((g) => [g.slug, g]));
}

export async function loadCatalog() {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  setCatalog(await res.json());
}

export const itemsIn = (m: Medium) => byMedium[m];
export const getItem = (slug: string, medium?: Medium) => {
  const i = itemMap.get(slug);
  return i && (!medium || i.section === medium) ? i : undefined;
};
export const getPerson = (slug: string) => personMap.get(slug);
export const getCompany = (slug: string) => companyMap.get(slug);
export const getGenre = (medium: Medium, slug: string) => genreMap.get(genreKey(medium, slug));
export const genresOf = (m: Medium) => genres.filter((g) => g.doc.medium === m);

export const itemPath = (item: Item) => `/${ITEM_PATH[item.section]}/${item.slug}`;
export const genrePath = (medium: Medium, slug: string) => `/genre/${medium}/${slug}`;
export const itemArt = (item: Item) => item.doc.poster ?? item.doc.cover;
export const itemKey = (item: Item) => `${item.section}:${item.slug}`;

export type Role = 'director' | 'cast' | 'artist' | 'creator';

/** People credited on an item, in billing order. */
export function creditsOf(item: Item): { slug: string; role: Role }[] {
  const d = item.doc;
  return [
    ...(d.directors ?? []).map((slug) => ({ slug, role: 'director' as const })),
    ...(d.cast ?? []).map((slug) => ({ slug, role: 'cast' as const })),
    ...(d.artists ?? []).map((slug) => ({ slug, role: 'artist' as const })),
    ...(d.creators ?? []).map((slug) => ({ slug, role: 'creator' as const })),
  ];
}

export function worksOf(personSlug: string) {
  const has = (list?: string[]) => !!list?.includes(personSlug);
  return {
    directed: allItems.filter((i) => has(i.doc.directors)),
    starred: allItems.filter((i) => has(i.doc.cast)),
    recorded: allItems.filter((i) => has(i.doc.artists)),
    created: allItems.filter((i) => has(i.doc.creators)),
  };
}

export function studioWorks(slug: string) {
  return {
    developed: allItems.filter((i) => i.doc.developers?.includes(slug)),
    published: allItems.filter((i) => i.doc.publishers?.includes(slug) && !i.doc.developers?.includes(slug)),
  };
}

export const itemsInGenre = (medium: Medium, slug: string) => byMedium[medium].filter((i) => i.doc.genres.includes(slug));
export const itemsFromCountry = (code: string) => allItems.filter((i) => i.doc.countries?.includes(code));

/** "More like this": shared people and studios count most, then shared genres (same medium only). */
export function related(item: Item, limit = 8): Item[] {
  const ppl = new Set(creditsOf(item).map((c) => c.slug));
  const studios = new Set([...(item.doc.developers ?? []), ...(item.doc.publishers ?? [])]);
  const gs = new Set(item.doc.genres);
  return allItems
    .filter((o) => o.slug !== item.slug)
    .map((o) => {
      let score = 0;
      for (const c of creditsOf(o)) if (ppl.has(c.slug)) score += 3;
      for (const s of [...(o.doc.developers ?? []), ...(o.doc.publishers ?? [])]) if (studios.has(s)) score += 2;
      if (o.section === item.section) {
        score += 1;
        for (const g of o.doc.genres) if (gs.has(g)) score += 2;
      }
      if (Math.abs(o.en.year - item.en.year) <= 5) score += 0.5;
      return { o, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.o);
}

/** Stable hue for things without a configured colour. */
export function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function itemHue(item: Item): number {
  const g = item.doc.genres.map((s) => getGenre(item.section, s)).find((x) => x?.doc.hue != null);
  const base = g?.doc.hue ?? hueOf(item.slug);
  return (base + (hueOf(item.slug) % 40) - 20 + 360) % 360;
}

/** Is this field's text in this language a flagged AI translation (shown, not an English fallback)? */
export const isAiTranslated = (doc: { sources?: Sources } & object, field: string, lang: Lang) =>
  !!(doc as Record<string, I18n | undefined>)[field]?.[lang] && doc.sources?.[sourceKey(field, lang)] === 'ai';

export const isFreeNow = (item: Item) => availabilityActive(item.doc.availability) && !!item.doc.availability?.free;
export const isLimitedNow = (item: Item) => availabilityActive(item.doc.availability) && !!item.doc.availability?.limited_time;

export function searchText(item: Item): string {
  // Every language, so a search in any of them finds the item.
  const names = (e?: Entry<{ name: I18n }>) => (e ? LANGS.map((l) => e[l].name) : []);
  return [
    ...LANGS.flatMap((l) => [item[l].title, item[l].summary]), String(item.en.year),
    ...creditsOf(item).flatMap((c) => names(getPerson(c.slug))),
    ...[...(item.doc.developers ?? []), ...(item.doc.publishers ?? [])].flatMap((s) => names(getCompany(s))),
    ...item.doc.genres.flatMap((g) => names(getGenre(item.section, g))),
  ].join(' ').toLowerCase();
}
