/**
 * What the Worker adds to the public site beyond the API: robots.txt and the sitemap, so search engines find every
 * page. Pages are still rendered in the browser.
 */
import { referencesOf } from '../src/shared/validate';
import {
  ITEM_PATH, LANGS, MEDIA,
  type AnyDoc, type CompanyDoc, type EntityType, type GenreDoc, type ItemDoc, type Lang, type PersonDoc, type SiteSettings,
} from '../src/shared/schema';
import type { Existing } from '../src/shared/ingest';

/** Everything the public site shows: items in switched-on sections and the people, studios and genres they use. */
export function publicCatalog(all: Existing, settings: SiteSettings) {
  const items = [...all.item.values()].filter((i) => settings.media[(i as ItemDoc).medium]) as ItemDoc[];
  const used = new Set(items.flatMap((i) => referencesOf('item', i).map((r) => r.key)));
  const pick = <T extends AnyDoc>(type: EntityType) => [...all[type].values()].filter((d) => used.has(`${type}:${d.id}`)) as T[];
  return {
    items,
    people: pick<PersonDoc>('person'),
    companies: pick<CompanyDoc>('company'),
    // Every genre in a switched-on section (the browse filters list them), not only the ones in use.
    genres: [...all.genre.values()].filter((g) => settings.media[(g as GenreDoc).medium]) as GenreDoc[],
    /** `type:id` keys of everything a shown item points at (genres as `genre:medium:slug`). */
    used,
  };
}

// ───────────────────────────── robots.txt and sitemap ─────────────────────────────

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function robots(origin: string) {
  return [
    'User-agent: *',
    // The pages are drawn from the catalog, so search engines that render pages need to read it.
    'Allow: /api/catalog',
    'Disallow: /api/',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * Every public page, each in all four languages. English is the plain address (the default for a visitor with no
 * saved choice); the others add ?lang=. Each language version lists the others as alternates.
 */
export function sitemap(origin: string, c: ReturnType<typeof publicCatalog>, settings: SiteSettings) {
  const paths = [
    '/',
    ...MEDIA.filter((m) => settings.media[m]).map((m) => `/${m}`),
    ...c.items.map((i) => `/${ITEM_PATH[i.medium]}/${i.id}`),
    ...c.people.map((p) => `/person/${p.id}`),
    ...c.companies.map((s) => `/studio/${s.id}`),
    ...c.genres.filter((g) => c.used.has(`genre:${g.id}`)).map((g) => `/genre/${g.medium}/${g.slug}`),
    ...[...new Set(c.items.flatMap((i) => i.countries ?? []))].sort().map((code) => `/country/${code}`),
  ];
  const href = (path: string, lang: Lang) => escape(`${origin}${path}${lang === 'en' ? '' : `?lang=${lang}`}`);
  const urls = paths.flatMap((path) => {
    const alternates = [
      ...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${href(path, l)}"/>`),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${href(path, 'en')}"/>`,
    ].join('');
    return LANGS.map((l) => `<url><loc>${href(path, l)}</loc>${alternates}</url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
