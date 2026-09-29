import { Check, Crosshair, Pencil, Plus, Sparkle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { showOnMap } from '../../app/showOnMap';
import { momentsOf, optionsTouching } from '../../domain/ask';
import { byStrength, claimsInto, claimsOutOf } from '../../domain/claims';
import { AREA_META, areaHubId, LAYERS, layerOf, YOU_ID } from '../../domain/constants';
import { areaActivity, mapElements, patternsForNode, thinSpots } from '../../domain/selectors';
import type { AreaKey } from '../../domain/types';
import { useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { PLACE_ICONS } from '../icons';
import { AreaGlyph } from '../graph/AreaGlyph';
import { AddNodeModal } from '../graph/AddNodeModal';
import { Button } from '../ui/Button';
import { Lately, Question, Reason, RepeatRow, SeeIn } from './Ask';
import { Muted, NodeChip, PanelSection } from './parts';
import { t, tn } from '../../i18n';

/**
 * An area of life, or the person at the centre, told the same way as one
 * thing: a short story, then the questions, answered for everything it holds.
 */
export function AreaView({ area }: { area: AreaKey }) {
  const data = useAtlas((s) => s.data);
  const updateArea = useAtlas((s) => s.updateArea);
  const setProfileName = useAtlas((s) => s.setProfileName);
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const center = area === 'self';
  const hub = center ? YOU_ID : areaHubId(area);
  const meta = AREA_META[area];
  const record = data.areas[area];
  const elements = useMemo(() => mapElements(data).filter((n) => n.area === area), [data, area]);
  const thin = useMemo(() => thinSpots(data, today), [data, today]);
  const open = useUI((s) => s.openEntity);
  const moments = useMemo(() => momentsOf(data, { kind: 'area', id: area }).filter((h) => h.mode === 'actual' && h.kind !== 'reading'), [data, area]);
  const inside = useMemo(() => new Set(elements.map((n) => n.id)), [elements]);
  const reasons = useMemo(
    () => [...new Map(elements.flatMap((n) => claimsInto(data, n.id)).map((c) => [c.id, c])).values()].sort(byStrength(data)),
    [data, elements],
  );
  const reaches = useMemo(
    () => [...new Map(elements.flatMap((n) => claimsOutOf(data, n.id)).map((c) => [c.id, c])).values()].filter((c) => !inside.has(c.to)).sort(byStrength(data)),
    [data, elements, inside],
  );
  const patterns = useMemo(() => [...new Map([hub, ...inside].flatMap((x) => patternsForNode(data, x)).map((p) => [p.id, p])).values()], [data, hub, inside]);
  const options = useMemo(() => optionsTouching(data, [...inside]), [data, inside]);
  const activity = areaActivity(data, area, 60, today);
  const [name, setName] = useState(data.profile.name);
  const [statement, setStatement] = useState(record?.statement ?? '');
  const [summary, setSummary] = useState(record?.summary ?? '');

  const unexplained = thin.unexplained.filter((n) => n.area === area);
  const untested = thin.untestedBeliefs.filter((n) => n.area === area);
  const quiet = thin.quietAreas.includes(area) || (!center && elements.length === 0);
  const noticed = quiet
    ? elements.length === 0
      ? t('Nothing on the map here yet.')
      : t('Nothing written about it for two months.')
    : unexplained.length
      ? tn(unexplained.length, '{n} thing you care about here has no explanation yet.', '{n} things you care about here have no explanation yet.')
      : activity
        ? tn(activity, '{n} note about it in the last two months.', '{n} notes about it in the last two months.')
        : undefined;

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[2px] border" style={{ borderColor: `${meta.color}66` }}>
            <AreaGlyph area={area} size={14} color={meta.color} strokeWidth={1.6} />
          </span>
          <span className="label">{center ? t('You · the centre') : t('Area of life')}</span>
        </div>
        {editing ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (center) setProfileName(name.trim());
              updateArea(area, { statement: statement.trim(), summary: summary.trim() });
              setEditing(false);
            }}
          >
            {center && (
              <label className="block">
                <span className="label">{t('Your name')}</span>
                <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <label className="block">
              <span className="label">{center ? t('Who you take yourself to be, in one line') : t('Where things stand, in one line')}</span>
              <input className="field mt-1" value={statement} onChange={(e) => setStatement(e.target.value)} autoFocus />
            </label>
            <label className="block">
              <span className="label">{t('More, if you like')}</span>
              <textarea className="field mt-1 min-h-[72px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" type="submit" icon={Check}>
                {t('Save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">{meta.label}</h2>
            <p className="mt-1 text-[14px] text-ink">
              {record?.statement ? `“${record.statement}”` : <span className="text-ink-3">{t('No one-line statement yet.')}</span>}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{record?.summary || meta.description}</p>
            <div className="mt-3.5">
              <div className="label mb-1">{t('Lately')}</div>
              <Lately items={moments.slice(0, 3)} empty={t('Nothing written about this area yet.')} />
              {noticed && (
                <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-snug text-ink">
                  <Sparkle size={12} className="mt-[3px] shrink-0 text-accent" aria-hidden />
                  <span>{noticed}</span>
                </p>
              )}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <Button size="sm" icon={Crosshair} onClick={() => showOnMap('orbit', hub)}>
                {t('Show on map')}
              </Button>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                {t('Edit')}
              </Button>
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
                {t('Add here')}
              </Button>
            </div>
          </>
        )}
      </div>

      <PanelSection title={center ? t('What defines you') : t('What it holds')} count={elements.length}>
        {center ? (
          elements.length ? (
            <div className="flex flex-wrap gap-1.5">
              {elements.map((n) => (
                <NodeChip key={n.id} id={n.id} />
              ))}
            </div>
          ) : (
            <Muted>{t('Nothing here yet: add a value, a role you hold, or a belief about yourself.')}</Muted>
          )
        ) : elements.length ? (
          <div className="space-y-2">
            {LAYERS.map((l) => {
              const list = elements.filter((n) => layerOf(n.kind) === l.key);
              if (!list.length) return null;
              return (
                <div key={l.key}>
                  <div className="mb-1 text-[11.5px] text-ink-3">{l.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((n) => (
                      <NodeChip key={n.id} id={n.id} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Muted>{t('Nothing on the map here yet. That can mean it is fine, or that it has not been looked at.')}</Muted>
        )}
      </PanelSection>

      <Question
        id="happening"
        title={t("What's been happening?")}
        hint={moments.length ? tn(moments.length, '{n} moment so far', '{n} moments so far') : t('Nothing dated yet')}
      >
        {() => (
          <>
            <Lately items={moments.slice(0, 8)} empty={t('Nothing written about this area yet.')} />
            {moments.length > 8 && <p className="mt-1 text-[11.5px] text-ink-3">{t('+{n} more', { n: moments.length - 8 })}</p>}
            <SeeIn route="timeline">{t('See it all in Time')}</SeeIn>
          </>
        )}
      </Question>
      <Question
        id="why"
        title={t('Why might this be happening?')}
        hint={reasons.length ? tn(reasons.length, '{n} possible reason', '{n} possible reasons') : t('Nothing explains it yet')}
      >
        {() => (
          <>
            {reasons.length ? (
              <ul className="space-y-1.5">
                {reasons.slice(0, 8).map((c) => (
                  <Reason key={c.id} claim={c} />
                ))}
              </ul>
            ) : (
              <Muted>{t('Nothing on the map explains what happens here yet. Open one of the things it holds and add a reason.')}</Muted>
            )}
            {unexplained.length > 0 && (
              <div className="mt-3">
                <div className="text-[11.5px] text-ink-3">{t('You care about these, and nothing explains them yet')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {unexplained.map((n) => (
                    <NodeChip key={n.id} id={n.id} />
                  ))}
                </div>
              </div>
            )}
            {untested.length > 0 && (
              <div className="mt-3">
                <div className="text-[11.5px] text-ink-3">{t('Things you believe that your notes have never checked')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {untested.map((n) => (
                    <NodeChip key={n.id} id={n.id} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Question>
      <Question
        id="before"
        title={t('Has this happened before?')}
        hint={patterns.length ? tn(patterns.length, '{n} thing that repeats', '{n} things that repeat') : undefined}
      >
        {() => (
          <>
            {patterns.length ? (
              <ul className="-mx-1.5">
                {patterns.map((p) => (
                  <RepeatRow key={p.id} id={p.id} />
                ))}
              </ul>
            ) : (
              <Muted>{t('Not that the Atlas can see yet. A repeat shows once something similar happens in separate weeks.')}</Muted>
            )}
            <SeeIn route="patterns">{t('See everything that repeats')}</SeeIn>
          </>
        )}
      </Question>
      <Question id="whatif" title={t('What if I change it?')}>
        {() => (
          <>
            {reaches.length ? (
              <>
                <p className="mb-1.5 text-[12px] text-ink-3">{t('What happens here seems to reach other parts of your life:')}</p>
                <ul className="space-y-1.5">
                  {reaches.slice(0, 6).map((c) => (
                    <Reason key={c.id} claim={c} />
                  ))}
                </ul>
              </>
            ) : (
              <Muted>{t('Nothing on the map says this area reaches the others yet.')}</Muted>
            )}
            {options.length > 0 && (
              <>
                <div className="label mt-3 mb-1">{t('Directions that count on it')}</div>
                <ul className="-mx-1.5">
                  {options.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
                        onClick={() => open({ kind: 'path', id: p.id })}
                      >
                        <PLACE_ICONS.ahead size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                        <span className="min-w-0 flex-1 text-[13px] text-ink-2 group-hover:text-ink">{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <SeeIn route="paths">{t('See what could come next')}</SeeIn>
          </>
        )}
      </Question>

      {adding && <AddNodeModal onClose={() => setAdding(false)} defaultArea={area} />}
    </div>
  );
}
