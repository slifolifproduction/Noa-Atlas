import { ArrowUpRight, Trash } from 'lucide-react';
import { useEffect } from 'react';
import { claimCode, claimSentence, claimStatus, evidenceProfile } from '../../domain/claims';
import { LINK_META, LINKS, STATUS_META } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { LinkType } from '../../domain/types';
import type { SemanticEdge } from '../../graph/types';
import { t, tn } from '../../i18n';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { EffectSwatch, LinkSwatch } from './Legend';

/**
 * One line, explained. A claim shows what it says, how well it is supported
 * and on what; a declared link can be retyped or removed.
 */
export function EdgePopover({ edgeId, x, y, edges, onClose }: { edgeId: string; x: number; y: number; edges: SemanticEdge[]; onClose(): void }) {
  const data = useAtlas((s) => s.data);
  const updateLink = useAtlas((s) => s.updateLink);
  const deleteLink = useAtlas((s) => s.deleteLink);
  const openEntity = useUI((s) => s.openEntity);
  const e = edges.find((x) => x.id === edgeId);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!e?.data) return null;
  const box = 'absolute z-20 w-[312px] animate-rise rounded-[2px] border border-line-strong bg-overlay p-3 shadow-2xl';
  const style = { left: Math.max(12, x + 10), top: Math.max(12, y - 10) };

  if (e.data.family === 'claim' && e.data.claimId) {
    const claim = data.claims[e.data.claimId];
    if (!claim) return null;
    const status = claimStatus(data, claim);
    const p = evidenceProfile(data, claim);
    return (
      <div role="dialog" aria-label={t('Claim')} className={box} style={style}>
        <div className="flex items-center gap-2">
          <EffectSwatch effect={claim.effect} />
          <span className="label">{claimCode(claim.code)}</span>
          <span className="ml-auto font-mono text-[11px] tracking-wide text-ink-2 uppercase" title={STATUS_META[status].description}>
            {STATUS_META[status].label}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink">{claimSentence(data, claim, status)}</p>
        {claim.via && <p className="mt-1.5 text-[12px] text-ink-2">{t('How: {via}', { via: claim.via })}</p>}
        <p className="mt-2 text-[12px] text-ink-3">
          {tn(p.episodes, 'Seen in {n} episode', 'Seen in {n} episodes')}
          {p.contrast > 0 && ` · ${tn(p.contrast, '{n} contrast case', '{n} contrast cases')}`}
          {p.counter > 0 && ` · ${tn(p.counter, '{n} counter-case', '{n} counter-cases')}`}
          {p.testsFor + p.testsAgainst > 0 && ` · ${tn(p.testsFor + p.testsAgainst, '{n} test', '{n} tests')}`}
        </p>
        <p className="mt-1 text-[11.5px] text-ink-3">{claim.author === 'user' ? t('You made this claim.') : t('Proposed by the analysis.')}</p>
        <div className="mt-3 flex justify-between">
          <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => (openEntity({ kind: 'claim', id: claim.id }), onClose())}>
            {t('Open claim')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('Done')}
          </Button>
        </div>
      </div>
    );
  }

  const link = data.edges[edgeId];
  if (!link) return null;
  const a = displayNode(data, link.source);
  const b = displayNode(data, link.target);
  const meta = LINK_META[link.type];
  return (
    <div role="dialog" aria-label={t('Link')} className={box} style={style}>
      <div className="flex items-center gap-2">
        <LinkSwatch type={link.type} />
        <span className="label">{meta.label}</span>
        <span className="ml-auto font-mono text-[11px] tracking-wide text-ink-3 uppercase">{t('Declared')}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink">
        {a?.label} <span className="text-ink-3">{meta.verb}</span> {b?.label}
      </p>
      {link.note && <p className="mt-1.5 text-[12px] text-ink-2">{link.note}</p>}
      <p className="mt-2 text-[11.5px] text-ink-3">
        {t('True because you say so: a link organises the map and needs no evidence. It does not claim that one changes the other.')}
      </p>
      <label className="mt-3 block">
        <span className="label">{t('Link')}</span>
        <select className="field mt-1" value={link.type} onChange={(ev) => updateLink(edgeId, { type: ev.target.value as LinkType })}>
          {LINKS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="danger" icon={Trash} onClick={() => (deleteLink(edgeId), onClose())}>
          {t('Remove link')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('Done')}
        </Button>
      </div>
    </div>
  );
}
