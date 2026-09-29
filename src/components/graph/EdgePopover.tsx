import { ArrowUpRight, Trash } from 'lucide-react';
import { useEffect } from 'react';
import { claimSentence, claimStatus, evidenceProfile } from '../../domain/claims';
import { LINK_META, LINKS, STATUS_META } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { LinkType } from '../../domain/types';
import type { SemanticEdge } from '../../graph/types';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
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

  if (e.data.family === 'area') {
    const a = displayNode(data, e.source);
    const b = displayNode(data, e.target);
    const claims = (e.data.claimIds ?? []).map((id) => data.claims[id]).filter((c) => c !== undefined);
    const links = (e.data.linkIds ?? []).map((id) => data.edges[id]).filter((l) => l !== undefined);
    return (
      <div role="dialog" aria-label={t('Between two areas')} className={cn(box, 'max-h-[70vh] overflow-y-auto')} style={style}>
        <div className="flex items-center gap-2">
          <span className="label">{t('Between two areas')}</span>
          <span className="ml-auto text-[11px] text-ink-3">{t('drawn by the Atlas')}</span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink">
          {a?.label} → {b?.label}
        </p>
        <p className="mt-1 text-[11.5px] text-ink-3">{t('Everything that connects the two areas, gathered in one line. Open any of it to see why.')}</p>
        <ul className="mt-2 space-y-1">
          {claims.map((c) => {
            const status = claimStatus(data, c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.05]"
                  onClick={() => (openEntity({ kind: 'claim', id: c.id }), onClose())}
                >
                  <span className="flex items-center gap-2">
                    <EffectSwatch effect={c.effect} width={18} />
                    <span className="font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">{STATUS_META[status].label}</span>
                  </span>
                  <span className="block text-[12.5px] leading-snug text-ink-2">{claimSentence(data, c, status)}</span>
                </button>
              </li>
            );
          })}
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-1.5 py-1 text-[12.5px] text-ink-2">
              <LinkSwatch type={l.type} width={18} />
              <span>
                {displayNode(data, l.source)?.label} <span className="text-ink-3">{LINK_META[l.type].verb}</span> {displayNode(data, l.target)?.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (e.data.family === 'claim' && e.data.claimId) {
    const claim = data.claims[e.data.claimId];
    if (!claim) return null;
    const status = claimStatus(data, claim);
    const p = evidenceProfile(data, claim);
    return (
      <div role="dialog" aria-label={t('A possible reason')} className={box} style={style}>
        <div className="flex items-center gap-2">
          <EffectSwatch effect={claim.effect} />
          <span className="label">{t('A possible reason')}</span>
          <span className="ml-auto text-[11.5px] text-ink-2" title={STATUS_META[status].description}>
            {STATUS_META[status].label}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink">{claimSentence(data, claim, status)}</p>
        {claim.via && <p className="mt-1.5 text-[12px] text-ink-2">{t('How: {via}', { via: claim.via })}</p>}
        <p className="mt-2 text-[12px] text-ink-3">
          {tn(p.episodes, 'Seen in {n} separate week', 'Seen in {n} separate weeks')}
          {p.contrast > 0 && ` · ${tn(p.contrast, '{n} time without it', '{n} times without it')}`}
          {p.counter > 0 && ` · ${tn(p.counter, '{n} exception', '{n} exceptions')}`}
          {p.testsFor + p.testsAgainst > 0 && ` · ${tn(p.testsFor + p.testsAgainst, '{n} test', '{n} tests')}`}
        </p>
        <p className="mt-1 text-[11.5px] text-ink-3">{claim.author === 'user' ? t('Your idea.') : t('Suggested by the Atlas.')}</p>
        <div className="mt-3 flex justify-between">
          <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => (openEntity({ kind: 'claim', id: claim.id }), onClose())}>
            {t('Why do you think that?')}
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
        <span className="ml-auto text-[11px] text-ink-3">{t('drawn by you')}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink">
        {a?.label} <span className="text-ink-3">{meta.verb}</span> {b?.label}
      </p>
      {link.note && <p className="mt-1.5 text-[12px] text-ink-2">{link.note}</p>}
      <p className="mt-2 text-[11.5px] text-ink-3">
        {t('True because you say so. A link keeps the map in order; it does not say that one changes the other.')}
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
