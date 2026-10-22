import { motion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { genresOf, itemsIn, itemsInGenre, searchText } from '../data';
import { useLang, type Strings } from '../i18n';
import { Grid } from '../components/Grid';
import { usePageHue, usePageTitle } from '../components/Layout';
import { MEDIUM_KINDS, type ItemKind } from '../shared/schema';
import type { Medium } from '../types';
import { NotFound } from './NotFound';

const config: Record<Medium, { hue: number; icon: string; title: (t: Strings) => string }> = {
  watch: { hue: 268, icon: '🎬', title: (t) => t.navWatch },
  listen: { hue: 320, icon: '🎧', title: (t) => t.navListen },
  play: { hue: 200, icon: '🎮', title: (t) => t.navPlay },
};
const plural: Record<ItemKind, keyof Strings> = { film: 'films', tv: 'tvs', song: 'songs', album: 'albums', game: 'games' };

export function Browse({ section }: { section: Medium }) {
  const { lang, t } = useLang();
  const cfg = config[section];
  usePageHue(cfg.hue);
  usePageTitle(cfg.title(t));
  const [params, setParams] = useSearchParams();
  const kind = params.get('type') ?? 'all';
  const genre = params.get('g') ?? '';
  const q = params.get('q') ?? '';
  const all = itemsIn(section);

  const pool = useMemo(
    () => genresOf(section).filter((g) => itemsInGenre(section, g.doc.slug).length).sort((a, b) => a[lang].name.localeCompare(b[lang].name, lang)),
    [section, lang],
  );

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((i) =>
      (kind === 'all' || i.doc.kind === kind) &&
      (!genre || i.doc.genres.includes(genre)) &&
      (!needle || searchText(i).includes(needle)),
    );
  }, [all, kind, genre, q]);

  if (!all.length) return <NotFound />;

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const kinds = MEDIUM_KINDS[section];
  const filters = ['all', ...kinds] as const;

  return (
    <div className="page browse">
      <header className="page-head">
        <p className="eyebrow reveal" style={{ '--i': 0 } as CSSProperties}>{t.itemsCount(all.length)}</p>
        <h1 className="page-title reveal" style={{ '--i': 1 } as CSSProperties}><span aria-hidden>{cfg.icon}</span> {cfg.title(t)}</h1>
      </header>
      <div className="toolbar reveal" style={{ '--i': 2 } as CSSProperties}>
        {kinds.length > 1 && (
          <div className="segmented" role="tablist">
            {filters.map((f) => (
              <button key={f} role="tab" aria-selected={kind === f} className={kind === f ? 'is-active' : ''} onClick={() => update('type', f)}>
                {kind === f && <motion.span layoutId={`filter-${section}`} className="segmented__thumb" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className="segmented__label">{f === 'all' ? t.all : (t[plural[f]] as string)}</span>
              </button>
            ))}
          </div>
        )}
        <label className="search">
          <span aria-hidden>⌕</span>
          <input type="search" value={q} placeholder={t.searchPlaceholder} onChange={(e) => update('q', e.target.value)} aria-label={t.searchPlaceholder} />
        </label>
      </div>
      {pool.length > 1 && (
        <div className="chip-row reveal" style={{ '--i': 3 } as CSSProperties} role="group" aria-label={t.genres}>
          <button className={`chip ${!genre ? 'is-active' : ''}`} onClick={() => update('g', '')}>{t.all}</button>
          {pool.map((g) => (
            <button
              key={g.slug}
              className={`chip ${genre === g.doc.slug ? 'is-active' : ''}`}
              style={{ '--h': g.doc.hue ?? 200 } as CSSProperties}
              onClick={() => update('g', genre === g.doc.slug ? '' : g.doc.slug)}
              aria-pressed={genre === g.doc.slug}
            >
              # {g[lang].name}
            </button>
          ))}
        </div>
      )}
      <Grid items={items} instance={`grid-${section}`} />
    </div>
  );
}
