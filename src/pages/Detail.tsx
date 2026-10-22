import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getItem, isAiTranslated, itemArt, itemHue, related } from '../data';
import { flag, formatDate, useLang } from '../i18n';
import { Art } from '../components/Art';
import { AvailabilityBadge } from '../components/Availability';
import { CountryTag, GenreTag, PersonChip, PlatformTag, StudioChip } from '../components/Chips';
import { Shelf } from '../components/Grid';
import { usePageHue, usePageTitle } from '../components/Layout';
import type { Item, Lang, Medium } from '../types';
import { NotFound } from './NotFound';

const BACK: Record<Medium, string> = { watch: '/watch', listen: '/listen', play: '/play' };

function BackButton({ fallback }: { fallback: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  // `location.key === 'default'` means this is the first page in the session (e.g. a shared link).
  const canGoBack = location.key !== 'default';
  return (
    <button className="back reveal" onClick={() => (canGoBack ? navigate(-1) : navigate(fallback, { viewTransition: true }))}>
      <span aria-hidden>←</span> {t.back}
    </button>
  );
}

function Credits({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="credits">
      <h2 className="credits__label">{label}</h2>
      <div className="credits__list">{children}</div>
    </div>
  );
}

const people = (label: string, slugs?: string[]) =>
  slugs?.length ? <Credits label={label}>{slugs.map((s) => <PersonChip key={s} slug={s} />)}</Credits> : null;
const studios = (label: string, slugs?: string[]) =>
  slugs?.length ? <Credits label={label}>{slugs.map((s) => <StudioChip key={s} slug={s} />)}</Credits> : null;

function ExternalButton({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`btn ${className}`}>
      {children}
      <span className="btn__arrow" aria-hidden>↗</span>
    </a>
  );
}

const SpotifyIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path fill="currentColor" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm4.8 15.15a.66.66 0 0 1-.9.22c-2.48-1.52-5.6-1.86-9.27-1.02a.66.66 0 1 1-.3-1.28c4.02-.92 7.47-.52 10.25 1.18.31.19.41.6.22.9Zm1.28-2.86a.82.82 0 0 1-1.13.27c-2.84-1.74-7.17-2.25-10.53-1.23a.82.82 0 1 1-.48-1.57c3.84-1.16 8.6-.6 11.87 1.4.39.24.51.75.27 1.13Zm.11-2.98C14.78 8.79 9.16 8.6 5.9 9.6a.99.99 0 1 1-.57-1.89c3.74-1.13 9.96-.91 13.88 1.41a.99.99 0 0 1-1.01 1.7Z"/></svg>
);

export function Detail({ medium }: { medium: Medium }) {
  const { slug = '' } = useParams();
  const item = getItem(slug, medium);
  if (!item) return <NotFound />;
  return <DetailView item={item} key={item.slug} />;
}

// A game page shows only the release date for the visitor's language's region.
const RELEASE: Record<Lang, { field: 'release_us' | 'release_jp' | 'release_th' | 'release_sa'; icon: string }> = {
  en: { field: 'release_us', icon: flag('US') },
  ja: { field: 'release_jp', icon: flag('JP') },
  th: { field: 'release_th', icon: flag('TH') },
  es: { field: 'release_sa', icon: '🌎' },
};

function DetailView({ item }: { item: Item }) {
  const { lang, t } = useLang();
  const hue = itemHue(item);
  usePageHue(hue);
  const d = item.doc;
  const loc = item[lang];
  usePageTitle(loc.title);
  // English pages show only the English title; other languages show the English one beneath theirs.
  const alt = lang === 'en' ? undefined : item.en;
  const backdrop = d.backdrop || itemArt(item);
  const more = related(item);
  const reveal = (i: number) => ({ '--i': i }) as CSSProperties;

  const meta = [t[d.kind], String(d.year), d.runtime ? t.runtime(d.runtime) : ''].filter(Boolean).join(' · ');

  let credits: ReactNode;
  let actions: ReactNode = null;
  let facts: ReactNode = null;
  if (item.section === 'watch') {
    credits = <>{people(d.kind === 'tv' ? t.createdBy : t.directedBy, d.directors)}{people(t.starring, d.cast)}</>;
    actions = (
      <>
        <ExternalButton href={d.watch_url} className="btn--primary btn--xl">▶ {t.watchOn(d.watch_service)}</ExternalButton>
        <ExternalButton href={d.trailer_url} className="btn--ghost">{t.trailer}</ExternalButton>
      </>
    );
  } else if (item.section === 'listen') {
    credits = (
      <>
        {people(t.by, d.artists)}
        {loc.album && d.kind === 'song' && <Credits label={t.fromAlbum}><p className="credits__text">💿 {loc.album}</p></Credits>}
      </>
    );
    actions = (
      <>
        <ExternalButton href={d.spotify_url} className="btn--spotify btn--xl"><SpotifyIcon />{t.spotify}</ExternalButton>
        <ExternalButton href={d.video_url} className="btn--video">▶ {t.musicVideo}</ExternalButton>
      </>
    );
  } else {
    const release = d[RELEASE[lang].field];
    credits = <>{people(t.creators, d.creators)}{studios(t.developer, d.developers)}{studios(t.publisher, d.publishers)}</>;
    facts = (
      <dl className="facts">
        <div><dt>{RELEASE[lang].icon} {t.release}</dt><dd>{release ? formatDate(release, lang) : t.noReleaseDate}</dd></div>
      </dl>
    );
  }

  return (
    <div className={`page detail detail--${item.section}`} style={{ '--h': hue } as CSSProperties}>
      <div className="detail__backdrop" aria-hidden>
        {backdrop ? <img src={backdrop} alt="" /> : <span className="detail__backdrop-fallback" />}
      </div>
      <BackButton fallback={BACK[item.section]} />
      <article className="detail__main">
        <div className="detail__art-wrap">
          {item.section === 'listen' && <span className={`vinyl ${itemArt(item) ? '' : 'vinyl--plain'}`} aria-hidden />}
          <Art item={item} className="detail__art vt-art" eager style={{ viewTransitionName: 'art' }} />
        </div>
        <div className="detail__info">
          <p className="eyebrow reveal" style={reveal(0)}>{meta}</p>
          <h1 className="detail__title reveal" style={reveal(1)}>{loc.title}</h1>
          {alt && alt.title !== loc.title && <p className="detail__alt-title reveal" lang="en" style={reveal(2)}>{alt.title}</p>}
          {d.added && <p className="detail__added reveal" style={reveal(2)}>＋ {t.addedOn(formatDate(d.added, lang))}</p>}
          <div className="detail__tags reveal" style={reveal(3)}>
            {d.countries?.map((c) => <CountryTag key={c} code={c} />)}
            {d.platforms?.map((p) => <PlatformTag key={p} code={p} />)}
            {d.genres.map((g) => <GenreTag key={g} medium={item.section} slug={g} />)}
          </div>
          {facts && <div className="reveal" style={reveal(3)}>{facts}</div>}
          <p className="detail__summary reveal" style={reveal(4)}>{loc.summary}</p>
          {isAiTranslated(d, 'summary', lang) && <p className="auto-translated reveal" style={reveal(4)}>{t.autoTranslated}</p>}
          <div className="reveal" style={reveal(5)}>{credits}</div>
          <div className="reveal" style={reveal(6)}><AvailabilityBadge item={item} /></div>
          {actions && <div className="detail__actions reveal" style={reveal(7)}>{actions}</div>}
        </div>
      </article>
      {more.length > 0 && (
        <section className="section">
          <header className="section__head reveal" style={reveal(8)}><h2>✦ {t.moreLikeThis}</h2></header>
          <Shelf items={more} instance={`related-${item.slug}`} />
        </section>
      )}
    </div>
  );
}
