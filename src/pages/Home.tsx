import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { allItems, enabledMedia, genresOf, itemHue, itemKey, itemPath, itemsIn, itemsInGenre, settings } from '../data';
import { useLang, type Strings } from '../i18n';
import { Art } from '../components/Art';
import { GenreTag } from '../components/Chips';
import { Shelf } from '../components/Grid';
import { usePageHue, usePageTitle } from '../components/Layout';
import { VLink } from '../components/VLink';
import { PERIOD_HUE, usePeriod } from '../timeOfDay';
import { claimArt, isActiveArt } from '../transitions';
import type { Item, Medium } from '../types';

const SECTION_UI: Record<Medium, { icon: string; to: string; title: (t: Strings) => string; nav: (t: Strings) => string }> = {
  watch: { icon: '🎬', to: '/watch', title: (t) => t.latestWatch, nav: (t) => t.navWatch },
  listen: { icon: '🎧', to: '/listen', title: (t) => t.latestListen, nav: (t) => t.navListen },
  play: { icon: '🎮', to: '/play', title: (t) => t.latestPlay, nav: (t) => t.navPlay },
};

function FeaturedCard({ item, index }: { item: Item; index: number }) {
  const { lang, t } = useLang();
  const loc = item[lang];
  const key = itemKey(item);
  return (
    <VLink
      to={itemPath(item)}
      className="feature reveal"
      style={{ '--h': itemHue(item), '--i': index + 3 } as CSSProperties}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        claimArt(e.currentTarget.querySelector('.vt-art'), key, 'featured');
      }}
    >
      <Art item={item} className="vt-art feature__art" eager style={isActiveArt(key, 'featured') ? { viewTransitionName: 'art' } : undefined} />
      <div className="feature__body">
        <span className="eyebrow">{item.en.year} · {t[item.doc.kind]}</span>
        <h3 className="feature__title">{loc.title}</h3>
        <p className="feature__summary">{loc.summary}</p>
      </div>
    </VLink>
  );
}

/**
 * Splits a greeting into pieces that must not be broken, and says whether a space came before each.
 * Breaks are allowed at spaces, after punctuation, and in Japanese (which has no spaces) before a
 * polite ending: おはよう / ございます, お疲れさま / です. Never in the middle of a word.
 */
export function greetingWords(text: string): { text: string; space: boolean }[] {
  const out: { text: string; space: boolean }[] = [];
  for (const m of text.trim().matchAll(/(\s*)([^\s]+)/g)) {
    const space = m[1].length > 0 && out.length > 0;
    const chunk = m[2]
      .split(/(?<=[、。！？!?,])(?=.)/) // after punctuation
      .flatMap((part) => {
        // The shortest stem before an ending, so おはようございます splits once, before ございます.
        const m = part.match(/^(.{2,}?)((?:ございます|です|ます)[。！!]*)$/u);
        return m ? [m[1], m[2]] : [part];
      });
    chunk.forEach((t, i) => out.push({ text: t, space: i === 0 && space }));
  }
  return out.length ? out : [{ text, space: false }];
}

/**
 * Splits text into the characters a reader sees (grapheme clusters), so the wave animation never pulls a
 * Thai vowel or tone mark, or an accent, away from its letter.
 */
const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export const graphemes = (s: string) => (graphemeSegmenter ? [...graphemeSegmenter.segment(s)].map((g) => g.segment) : Array.from(s));

// Below this, a one-line greeting would look too small, so it wraps between words instead.
const MIN_ONE_LINE_SCALE = 0.7;

/**
 * The big waving greeting. Each word is unbreakable, and the text is scaled down just enough
 * to fit on one line when that keeps it a good size; otherwise it wraps between words.
 */
function Greeting({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const words = greetingWords(text);

  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return;
    let lastWidth = -1;
    const fit = (force = false) => {
      const avail = h.clientWidth;
      if (!avail || (!force && avail === lastWidth)) return;
      lastWidth = avail;
      h.style.removeProperty('--fit');
      // Layout widths (offsetWidth/scrollWidth) ignore the wave animation's transforms.
      h.classList.add('is-measuring');
      const oneLine = h.scrollWidth;
      h.classList.remove('is-measuring');
      const longest = Math.max(...[...h.querySelectorAll<HTMLElement>('.greeting__word')].map((w) => w.offsetWidth));
      let scale = oneLine > avail ? avail / oneLine : 1;
      if (scale < MIN_ONE_LINE_SCALE) scale = Math.min(1, avail / longest);
      // A little room for italic overhang.
      if (scale < 1) h.style.setProperty('--fit', String(scale * 0.97));
    };
    fit(true);
    const ro = new ResizeObserver(() => fit());
    ro.observe(h);
    // Web fonts change the text's width once they arrive, so measure again then.
    const refit = () => fit(true);
    document.fonts?.ready.then(refit);
    document.fonts?.addEventListener('loadingdone', refit);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener('loadingdone', refit);
    };
  }, [text]);

  let c = 0;
  return (
    <h1 ref={ref} className="hero__greeting reveal" style={{ '--i': 1 } as CSSProperties}>
      {words.map((w, n) => (
        <span key={n}>
          {w.space ? ' ' : n > 0 && <wbr />}
          <span className="greeting__word">
            {graphemes(w.text).map((ch) => <span key={c} className="wave" style={{ '--c': c++ } as CSSProperties}>{ch}</span>)}
          </span>
        </span>
      ))}
    </h1>
  );
}

export function Home() {
  const { lang, t } = useLang();
  const period = usePeriod();
  usePageHue(PERIOD_HUE[period]);
  usePageTitle('');
  const text = settings.text;
  const greeting = text[period][lang] || text[period].en;
  const featured = allItems.filter((i) => i.doc.featured).slice(0, 4);
  const fan = (featured.length >= 3 ? featured : allItems).slice(0, 5);
  let i = 3;

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow reveal" style={{ '--i': 0 } as CSSProperties}>{t.tagline}</p>
          <Greeting key={greeting} text={greeting} />
          <p className="hero__intro reveal" style={{ '--i': 2 } as CSSProperties}>{text.intro[lang] || text.intro.en}</p>
          <p className="hero__signoff reveal" style={{ '--i': 3 } as CSSProperties}>— {text.signoff[lang] || text.signoff.en}</p>
          <div className="hero__ctas reveal" style={{ '--i': 4 } as CSSProperties}>
            {enabledMedia.map((m, n) => (
              <VLink key={m} to={SECTION_UI[m].to} className={`btn ${n === 0 ? 'btn--primary' : 'btn--ghost'}`}>
                {SECTION_UI[m].icon} {SECTION_UI[m].nav(t)}
              </VLink>
            ))}
          </div>
        </div>
        <div className="hero__fan" aria-hidden>
          {fan.map((item, n) => (
            <div key={itemKey(item)} className="hero__fan-card" style={{ '--n': n, '--total': fan.length } as CSSProperties}>
              <Art item={item} eager />
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <header className="section__head reveal" style={{ '--i': 2 } as CSSProperties}>
            <h2>✦ {t.featured}</h2>
          </header>
          <div className="features">
            {featured.map((item, n) => <FeaturedCard key={itemKey(item)} item={item} index={n} />)}
          </div>
        </section>
      )}

      {enabledMedia.map((m) => {
        const items = itemsIn(m);
        if (!items.length) return null;
        return (
          <section className="section" key={m}>
            <header className="section__head reveal" style={{ '--i': i++ } as CSSProperties}>
              <h2>{SECTION_UI[m].icon} {SECTION_UI[m].title(t)}</h2>
              <VLink to={SECTION_UI[m].to} className="section__more">{t.seeAll} →</VLink>
            </header>
            <Shelf items={items} instance={`shelf-${m}`} />
          </section>
        );
      })}

      <section className="section">
        <header className="section__head reveal" style={{ '--i': i++ } as CSSProperties}>
          <h2># {t.genres}</h2>
          <VLink to="/search" className="section__more">{t.advancedSearch} →</VLink>
        </header>
        <div className="genre-pools">
          {enabledMedia.map((m) => {
            const pool = genresOf(m)
              .map((g) => ({ g, n: itemsInGenre(m, g.doc.slug).length }))
              .filter((x) => x.n > 0)
              .sort((a, b) => b.n - a.n);
            if (!pool.length) return null;
            return (
              <div className="genre-pool reveal" key={m} style={{ '--i': i++ } as CSSProperties}>
                <h3 className="genre-pool__title">{SECTION_UI[m].icon} {t.sectionName[m]}</h3>
                <div className="tag-cloud">
                  {pool.map(({ g, n }) => <GenreTag key={g.slug} medium={m} slug={g.doc.slug} count={n} />)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
