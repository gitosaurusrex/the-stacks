import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { itemMeta, robots, withMeta } from '../worker/pages';
import type { ItemDoc } from '../src/shared/schema';

// The real template, so a change to its page-meta block that the Worker no longer understands fails here.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const url = new URL('https://stacks.example/title/past-lives?lang=ja');

const film: ItemDoc = {
  id: 'past-lives', kind: 'film', medium: 'watch', year: 2023, genres: ['drama'],
  title: { en: 'Past Lives', ja: 'パスト ライブス／再会' },
  summary: { en: 'Two childhood friends meet again, decades later & a world apart.' },
  poster: '/media/0123456789abcdef01234567.jpg',
};

describe('item link previews', () => {
  it('uses the language asked for, falling back to English', () => {
    const m = itemMeta(film, 'ja', url);
    expect(m.title).toBe('パスト ライブス／再会');
    expect(m.description).toBe(film.summary.en);
    expect(m.type).toBe('video.movie');
    expect(m.url).toBe(url.href);
  });

  it('gives stored images a full address and only uses a large card for wide art', () => {
    expect(itemMeta(film, 'en', url).image).toBe('https://stacks.example/media/0123456789abcdef01234567.jpg');
    expect(itemMeta(film, 'en', url).wide).toBe(false);
    const wide = itemMeta({ ...film, backdrop: 'https://image.example/still.jpg' }, 'en', url);
    expect(wide).toMatchObject({ image: 'https://image.example/still.jpg', wide: true });
  });

  it('shortens long summaries at a word boundary', () => {
    const d = itemMeta({ ...film, summary: { en: 'word '.repeat(100) } }, 'en', url).description;
    expect(d.length).toBeLessThanOrEqual(201);
    expect(d).toMatch(/word…$/);
    // No spaces (as in Japanese): cut at the limit rather than far short of it.
    expect(itemMeta({ ...film, summary: { en: 'あ'.repeat(300) } }, 'en', url).description).toBe(`${'あ'.repeat(200)}…`);
  });

  it("replaces the template's default tags with the item's", () => {
    const out = withMeta(html, itemMeta(film, 'ja', url));
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toContain('<title>パスト ライブス／再会 · The Stacks</title>');
    expect(out).toContain('<html lang="ja">');
    expect(out).toContain('<meta property="og:image" content="https://stacks.example/media/0123456789abcdef01234567.jpg" />');
    expect(out).toContain('<meta property="og:locale" content="ja_JP" />');
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
    expect(out).not.toContain('content="Films, TV, music and games worth your time');
    expect(out).not.toContain('page-meta');
    // The rest of the page is untouched.
    expect(out.slice(out.indexOf('</head>'))).toBe(html.slice(html.indexOf('</head>')));
  });

  it('escapes text so it cannot break out of the tags', () => {
    const out = withMeta(html, itemMeta({ ...film, title: { en: 'A "quoted" <b>title</b>' } }, 'en', url));
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; · The Stacks</title>');
    expect(out).toContain('content="Two childhood friends meet again, decades later &amp; a world apart."');
  });
});

describe('robots.txt', () => {
  it('keeps the catalog readable for search engines that render pages, and points at the sitemap', () => {
    const txt = robots('https://stacks.example');
    expect(txt).toContain('Allow: /api/catalog');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Sitemap: https://stacks.example/sitemap.xml');
  });
});
