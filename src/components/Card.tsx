import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Item } from '../types';
import { isFreeNow, isLimitedNow, itemHue, itemKey, itemPath } from '../data';
import { formatDate, useLang } from '../i18n';
import { Art } from './Art';
import { VLink } from './VLink';
import { claimArt, isActiveArt } from '../transitions';

const NEW_DAYS = 21;
const isNew = (added?: string) => !!added && Date.now() - new Date(added).getTime() < NEW_DAYS * 864e5;

export function Card({ item, instance, size = 'md', index = 0 }: { item: Item; instance: string; size?: 'md' | 'lg'; index?: number }) {
  const { lang, t } = useLang();
  const loc = item[lang];
  const key = itemKey(item);

  // Gentle 3D tilt that follows the pointer (off for visitors who ask for reduced motion).
  const still = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 220, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-9, 9]), { stiffness: 220, damping: 18 });
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || still) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const reset = () => { mx.set(0.5); my.set(0.5); };

  const kindLabel = t[item.doc.kind];
  const free = isFreeNow(item);
  const limited = isLimitedNow(item);

  return (
    <motion.article
      className={`card card--${size} card--${item.section}`}
      style={{ '--h': itemHue(item), '--i': index } as CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <VLink to={itemPath(item)} className="card__link" onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        claimArt(e.currentTarget.querySelector('.vt-art'), key, instance);
      }}>
        <motion.div className="card__tilt" style={{ rotateX: rx, rotateY: ry }}>
          <Art
            item={item}
            className="vt-art"
            style={isActiveArt(key, instance) ? { viewTransitionName: 'art' } : undefined}
          />
          <span className="card__shine" aria-hidden />
          {isNew(item.en.added) && <span className="card__badge">{t.new}</span>}
          {(free || limited) && (
            <span className={`card__ribbon ${free ? 'card__ribbon--free' : ''}`}>{free ? t.freeShort : `⏳ ${t.limitedShort}`}</span>
          )}
        </motion.div>
        <div className="card__meta">
          <h3 className="card__title">{loc.title}</h3>
          <p className="card__sub">
            <span>{item.en.year}</span>
            <span aria-hidden>·</span>
            <span>{kindLabel}</span>
          </p>
          {item.en.added && <p className="card__added">＋ {formatDate(item.en.added, lang)}</p>}
        </div>
      </VLink>
    </motion.article>
  );
}
