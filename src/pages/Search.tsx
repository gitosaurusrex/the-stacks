import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { allItems, enabledMedia, genresOf, isFreeNow, isLimitedNow, itemsInGenre, searchText } from '../data';
import { countryName, flag, useLang } from '../i18n';
import { Grid } from '../components/Grid';
import { usePageHue, usePageTitle } from '../components/Layout';
import { genreKey, PLATFORMS } from '../shared/schema';
import type { Medium } from '../types';

const ICON: Record<Medium, string> = { watch: '🎬', listen: '🎧', play: '🎮' };
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const reveal = (i: number) => ({ '--i': i }) as CSSProperties;

export function Search() {
  const { lang, t } = useLang();
  usePageHue(230);
  usePageTitle(t.advancedSearch);
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const media = list(params.get('m')).filter((m): m is Medium => (enabledMedia as string[]).includes(m));
  const genreSel = list(params.get('g'));
  const y1 = Number(params.get('y1')) || undefined;
  const y2 = Number(params.get('y2')) || undefined;
  const country = params.get('c') ?? '';
  const platform = params.get('p') ?? '';
  const free = params.get('free') === '1';
  const limited = params.get('lim') === '1';
  const sort = params.get('sort') ?? 'added';

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const scope = media.length ? media : enabledMedia;
  const countries = useMemo(
    () => [...new Set(allItems.flatMap((i) => i.doc.countries ?? []))].sort((a, b) => countryName(a, lang).localeCompare(countryName(b, lang), lang)),
    [lang],
  );
  const platforms = useMemo(() => [...new Set(allItems.flatMap((i) => i.doc.platforms ?? []))], []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const genresByMedium = new Map<Medium, string[]>();
    for (const key of genreSel) {
      const [m, slug] = key.split(':') as [Medium, string];
      genresByMedium.set(m, [...(genresByMedium.get(m) ?? []), slug]);
    }
    const out = allItems.filter((i) => {
      if (!scope.includes(i.section)) return false;
      // Genres only narrow their own section: picking "Indie" in Games doesn't hide films.
      const gs = genresByMedium.get(i.section);
      if (gs && !gs.some((g) => i.doc.genres.includes(g))) return false;
      if (y1 && i.doc.year < y1) return false;
      if (y2 && i.doc.year > y2) return false;
      if (country && !i.doc.countries?.includes(country)) return false;
      if (platform && !i.doc.platforms?.includes(platform)) return false;
      if (free && !isFreeNow(i)) return false;
      if (limited && !isLimitedNow(i)) return false;
      return !needle || searchText(i).includes(needle);
    });
    if (sort === 'year') out.sort((a, b) => b.doc.year - a.doc.year);
    if (sort === 'title') out.sort((a, b) => a[lang].title.localeCompare(b[lang].title, lang));
    return out;
  }, [q, scope, media, genreSel, y1, y2, country, platform, free, limited, sort, lang]);

  const active = q || media.length || genreSel.length || y1 || y2 || country || platform || free || limited;

  return (
    <div className="page search-page">
      <header className="page-head">
        <p className="eyebrow reveal" style={reveal(0)}>{t.results(results.length)}</p>
        <h1 className="page-title reveal" style={reveal(1)}>⌕ {t.advancedSearch}</h1>
      </header>

      <div className="filters reveal" style={reveal(2)}>
        <label className="search search--wide">
          <span aria-hidden>⌕</span>
          <input type="search" value={q} autoFocus placeholder={t.searchPlaceholder} onChange={(e) => set({ q: e.target.value })} aria-label={t.searchPlaceholder} />
        </label>

        <fieldset className="filter">
          <legend>{t.fSection}</legend>
          <div className="chip-row">
            {enabledMedia.map((m) => (
              <button key={m} className={`chip ${media.includes(m) ? 'is-active' : ''}`} aria-pressed={media.includes(m)}
                onClick={() => {
                  const nextMedia = media.includes(m) ? media.filter((x) => x !== m) : [...media, m];
                  // Drop genre picks from sections that are no longer selected.
                  const keep = nextMedia.length ? genreSel.filter((g) => nextMedia.includes(g.split(':')[0] as Medium)) : genreSel;
                  set({ m: nextMedia.join(','), g: keep.join(',') });
                }}>
                {ICON[m]} {t.sectionName[m]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter">
          <legend>{t.fGenres}</legend>
          {scope.map((m) => {
            const pool = genresOf(m).filter((g) => itemsInGenre(m, g.doc.slug).length);
            if (!pool.length) return null;
            return (
              <div className="genre-group" key={m}>
                {scope.length > 1 && <span className="genre-group__label">{ICON[m]} {t.sectionName[m]}</span>}
                <div className="chip-row">
                  {pool.map((g) => {
                    const key = genreKey(m, g.doc.slug);
                    const on = genreSel.includes(key);
                    return (
                      <button key={key} className={`chip ${on ? 'is-active' : ''}`} aria-pressed={on} style={{ '--h': g.doc.hue ?? 200 } as CSSProperties}
                        onClick={() => {
                          const next = on ? genreSel.filter((x) => x !== key) : [...genreSel, key];
                          set({ g: next.join(','), m: media.length || on ? media.join(',') : m });
                        }}>
                        # {g[lang].name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="filter-grid">
          <fieldset className="filter">
            <legend>{t.fYears}</legend>
            <div className="year-range">
              <input type="number" inputMode="numeric" placeholder="1900" value={y1 ?? ''} onChange={(e) => set({ y1: e.target.value })} aria-label={`${t.fYears} ${t.from}`} />
              <span aria-hidden>–</span>
              <input type="number" inputMode="numeric" placeholder="2026" value={y2 ?? ''} onChange={(e) => set({ y2: e.target.value })} aria-label={`${t.fYears} ${t.to}`} />
            </div>
          </fieldset>
          {countries.length > 0 && (
            <fieldset className="filter">
              <legend>{t.fCountry}</legend>
              <select value={country} onChange={(e) => set({ c: e.target.value })}>
                <option value="">{t.anyValue}</option>
                {countries.map((c) => <option key={c} value={c}>{flag(c)} {countryName(c, lang)}</option>)}
              </select>
            </fieldset>
          )}
          {platforms.length > 0 && scope.includes('play') && (
            <fieldset className="filter">
              <legend>{t.fPlatform}</legend>
              <select value={platform} onChange={(e) => set({ p: e.target.value, m: e.target.value && !media.length ? 'play' : media.join(',') })}>
                <option value="">{t.anyValue}</option>
                {platforms.map((p) => <option key={p} value={p}>{PLATFORMS[p] ?? p}</option>)}
              </select>
            </fieldset>
          )}
          {scope.includes('watch') && (
            <fieldset className="filter">
              <legend>{t.fAvailability}</legend>
              <div className="chip-row">
                <button className={`chip ${free ? 'is-active' : ''}`} aria-pressed={free} onClick={() => set({ free: free ? '' : '1' })}>🎟 {t.free}</button>
                <button className={`chip ${limited ? 'is-active' : ''}`} aria-pressed={limited} onClick={() => set({ lim: limited ? '' : '1' })}>⏳ {t.limited}</button>
              </div>
            </fieldset>
          )}
          <fieldset className="filter">
            <legend>{t.sort}</legend>
            <select value={sort} onChange={(e) => set({ sort: e.target.value === 'added' ? '' : e.target.value })}>
              <option value="added">{t.sortAdded}</option>
              <option value="year">{t.sortYear}</option>
              <option value="title">{t.sortTitle}</option>
            </select>
          </fieldset>
        </div>
        {active ? <button className="link-button" onClick={() => setParams({}, { replace: true })}>✕ {t.clear}</button> : null}
      </div>

      <Grid items={results} instance="search" />
    </div>
  );
}
