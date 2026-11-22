import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { SECURITY_HEADERS } from '../worker/headers';

/** The `/*` rule's headers in public/_headers (the ones Cloudflare adds to static files). */
function staticHeaders() {
  const lines = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === '/*');
  const out: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const i = line.indexOf(':');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

describe('security headers', () => {
  it('are the same for static files and Worker responses', () => {
    expect(staticHeaders()).toEqual(SECURITY_HEADERS);
  });

  it('are on every kind of Worker response, errors included', async () => {
    const responses = [
      await app.request('https://stacks.example/robots.txt', {}, {} as never),
      await app.request('https://stacks.example/media/not-a-key', {}, {} as never),
      await app.request('https://stacks.example/api/no-such-route', {}, {} as never),
      await app.request('https://stacks.example/api/admin/me', {}, {} as never), // no password configured: 503
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 404, 404, 503]);
    for (const res of responses) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name), name).toBe(value);
    }
  });
});
