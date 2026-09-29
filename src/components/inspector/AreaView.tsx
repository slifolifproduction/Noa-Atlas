import { Check, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { showOnMap } from '../../app/showOnMap';
import { AREA_META, areaHubId, LAYERS, layerOf, YOU_ID } from '../../domain/constants';
import { areaActivity, mapElements, patternsForNode, recordsFor, thinSpots } from '../../domain/selectors';
import type { AreaKey } from '../../domain/types';
import { useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { AreaGlyph } from '../graph/AreaGlyph';
import { AddNodeModal } from '../graph/AddNodeModal';
import { Button } from '../ui/Button';
import { Muted, NodeChip, PanelSection, PatternRow, RecordRow } from './parts';
import { t, tn } from '../../i18n';

/**
 * An area of life, or the person at the centre: what it holds on each ring,
 * where it is thin, and what was written about it.
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
  const records = useMemo(() => recordsFor(data, hub), [data, hub]);
  const patterns = useMemo(() => patternsForNode(data, hub), [data, hub]);
  const activity = areaActivity(data, area, 60, today);
  const [name, setName] = useState(data.profile.name);
  const [statement, setStatement] = useState(record?.statement ?? '');
  const [summary, setSummary] = useState(record?.summary ?? '');

  const unexplained = thin.unexplained.filter((n) => n.area === area);
  const untested = thin.untestedBeliefs.filter((n) => n.area === area);
  const quiet = thin.quietAreas.includes(area) || (!center && elements.length === 0);

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
            <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">{center ? data.profile.name || t('You') : meta.label}</h2>
            <p className="mt-1 text-[14px] text-ink">
              {record?.statement ? `“${record.statement}”` : <span className="text-ink-3">{t('No one-line statement yet.')}</span>}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{record?.summary || meta.description}</p>
            <p className="mt-2 text-[12px] text-ink-3">
              {tn(activity, '{n} note in the last 60 days', '{n} notes in the last 60 days')}
              {quiet && ` · ${elements.length === 0 ? t('uncharted') : t('quiet lately')}`}
            </p>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => showOnMap('orbit', hub)}>
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

      {center ? (
        <PanelSection title={t('What defines you')} count={elements.length}>
          {elements.length ? (
            <div className="flex flex-wrap gap-1.5">
              {elements.map((n) => (
                <NodeChip key={n.id} id={n.id} />
              ))}
            </div>
          ) : (
            <Muted>{t('Nothing here yet: add a value, a role you hold, or a belief about yourself.')}</Muted>
          )}
        </PanelSection>
      ) : (
        LAYERS.map((l) => {
          const list = elements.filter((n) => layerOf(n.kind) === l.key);
          return (
            <PanelSection key={l.key} title={l.label} count={list.length}>
              {list.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((n) => (
                    <NodeChip key={n.id} id={n.id} />
                  ))}
                </div>
              ) : (
                <Muted>{l.description}</Muted>
              )}
            </PanelSection>
          );
        })
      )}

      {(unexplained.length > 0 || untested.length > 0 || quiet) && (
        <PanelSection title={t('Where understanding is thin')}>
          <div className="space-y-2">
            {quiet && (
              <Muted>
                {elements.length === 0
                  ? t('Uncharted: nothing on the map here yet. That can mean it is fine, or that it has not been looked at.')
                  : t('Nothing written here in 60 days. What you do not write about cannot show up in patterns.')}
              </Muted>
            )}
            {unexplained.length > 0 && (
              <div>
                <div className="text-[11.5px] text-ink-3">{t('Outcomes you care about, with no explanation yet')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {unexplained.map((n) => (
                    <NodeChip key={n.id} id={n.id} />
                  ))}
                </div>
              </div>
            )}
            {untested.length > 0 && (
              <div>
                <div className="text-[11.5px] text-ink-3">{t('Beliefs never checked against the record')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {untested.map((n) => (
                    <NodeChip key={n.id} id={n.id} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </PanelSection>
      )}

      <PanelSection title={t('Patterns')} count={patterns.length}>
        {patterns.length ? (
          <ul className="-mx-1.5">
            {patterns.map((p) => (
              <PatternRow key={p.id} id={p.id} />
            ))}
          </ul>
        ) : (
          <Muted>{t('No active pattern involves this area.')}</Muted>
        )}
      </PanelSection>

      <PanelSection title={t('Notes and decisions')} count={records.entries.length + records.decisions.length}>
        {records.entries.length + records.decisions.length ? (
          <ul className="-mx-1.5">
            {records.decisions.slice(0, 3).map((d) => (
              <RecordRow key={d.id} kind="decision" id={d.id} />
            ))}
            {records.entries.slice(0, 6).map((e) => (
              <RecordRow key={e.id} kind="entry" id={e.id} />
            ))}
          </ul>
        ) : (
          <Muted>{t('No notes touch this area yet.')}</Muted>
        )}
      </PanelSection>
      {adding && <AddNodeModal onClose={() => setAdding(false)} defaultArea={area} />}
    </div>
  );
}
