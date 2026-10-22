/**
 * What the Worker adds to the public site beyond the API: link previews on item pages, robots.txt and the sitemap.
 * Pages are still rendered in the browser; these are for the services that don't run JavaScript (link previews in
 * chat apps and social sites) and for search engines finding every page.
 */
import { referencesOf } from '../src/shared/validate';
import {
  ITEM_PATH, LANG_INFO, LANGS, MEDIA, isStoredImage,
  type AnyDoc, type CompanyDoc, type EntityType, type GenreDoc, type ItemDoc, type Lang, type PersonDoc, type SiteSettings,
} from '../src/shared/schema';
import type { Existing } from '../src/shared/ingest';

const SITE = 'The Stacks';

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

// ───────────────────────────── Link previews ─────────────────────────────

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Cut to about `max` characters, at a space when there's one near the end (Japanese and Thai often have none). */
function clip(s: string, max = 200) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space >= max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const OG_TYPE: Record<ItemDoc['kind'], string> = { film: 'video.movie', tv: 'video.tv_show', song: 'music.song', album: 'music.album', game: 'website' };

export interface PageMeta {
  lang: Lang;
  title: string;
  description: string;
  type: string;
  url: string;
  image?: string;
  /** The image is wide (a backdrop), so it suits a large preview card. */
  wide?: boolean;
}

/** An item's link preview in one language (falling back to English, like the page itself). */
export function itemMeta(item: ItemDoc, lang: Lang, url: URL): PageMeta {
  const image = item.backdrop ?? item.poster ?? item.cover;
  return {
    lang,
    title: item.title[lang] || item.title.en,
    description: clip(item.summary[lang] || item.summary.en),
    type: OG_TYPE[item.kind],
    url: url.href,
    // Stored images are site paths; previews need a full address.
    image: image && isStoredImage(image) ? new URL(image, url.origin).href : image,
    wide: !!item.backdrop,
  };
}

const META_BLOCK = /<!-- page-meta[\s\S]*?<!-- \/page-meta -->/;

/** index.html with its default page-meta block (and <html lang>) replaced by this page's. */
export function withMeta(html: string, m: PageMeta): string {
  const tags = [
    `<title>${escape(m.title)} · ${SITE}</title>`,
    `<meta name="description" content="${escape(m.description)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:title" content="${escape(m.title)}" />`,
    `<meta property="og:description" content="${escape(m.description)}" />`,
    `<meta property="og:url" content="${escape(m.url)}" />`,
    `<meta property="og:locale" content="${LANG_INFO[m.lang].locale.replace('-', '_')}" />`,
    ...(m.image ? [`<meta property="og:image" content="${escape(m.image)}" />`] : []),
    `<meta name="twitter:card" content="${m.image && m.wide ? 'summary_large_image' : 'summary'}" />`,
  ];
  return html
    .replace(META_BLOCK, () => tags.join('\n    '))
    .replace(/<html lang="[^"]*"/, `<html lang="${m.lang}"`);
}

// ───────────────────────────── robots.txt and sitemap ─────────────────────────────

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
