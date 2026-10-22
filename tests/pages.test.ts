import { describe, expect, it } from 'vitest';
import { robots } from '../worker/pages';

describe('robots.txt', () => {
  it('keeps the catalog readable for search engines that render pages, and points at the sitemap', () => {
    const txt = robots('https://stacks.example');
    expect(txt).toContain('Allow: /api/catalog');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Sitemap: https://stacks.example/sitemap.xml');
  });
});
