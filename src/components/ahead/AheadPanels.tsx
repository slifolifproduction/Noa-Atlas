import { ArrowRight, Check, Pencil, Rows3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { navigate } from '../../app/router';
import { pathCode } from '../../domain/selectors';
import type { StrategicPath } from '../../domain/types';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { BAND_LABEL, BANDS, KIND_LABEL, type Answer, type AnswerKind, type Band } from './answers';

/*
 * What Ahead reads out beside its picture: an answer, an option, or one
 * question across every option; and the marks that tell the kinds of answer
 * apart.
 */

/** A mark for an answer, drawn round (0, 0). */
export function Glyph({ kind, item, size = 1 }: { kind: AnswerKind; item?: Partial<Answer>; size?: number }) {
  const warn = item?.warn ? 'g-warn' : '';
  const s = (n: number) => n * size;
  switch (kind) {
    case 'requirement':
      return <rect x={s(-3.2)} y={s(-3.2)} width={s(6.4)} height={s(6.4)} className="g-fill" />;
    case 'dependency':
      return <rect x={s(-3.2)} y={s(-3.2)} width={s(6.4)} height={s(6.4)} className="g-line" />;
    case 'capital':
      return <path d={`M0 ${s(-4.6)}L${s(4.6)} 0L0 ${s(4.6)}L${s(-4.6)} 0Z`} className="g-fill" />;
    case 'time':
      return (
        <>
          <circle r={s(4.2)} className="g-line" />
          <path d={`M0 0V${s(-3)}M0 0L${s(2.2)} ${s(1.3)}`} className="g-line" />
        </>
      );
    case 'skill':
      return item?.skill === 'have' ? (
        <circle r={s(3.7)} className="g-fill" />
      ) : item?.skill === 'developing' ? (
        <>
          <circle r={s(3.7)} className="g-line" />
          <path d={`M0 ${s(-3.7)}A${s(3.7)} ${s(3.7)} 0 0 1 0 ${s(3.7)}Z`} className="g-fill" />
        </>
      ) : (
        <circle r={s(3.7)} className="g-line g-warn" />
      );
    case 'risk':
      return <path d={`M0 ${s(-4.8)}L${s(4.3)} ${s(3.3)}H${s(-4.3)}Z`} className="g-line" />;
    case 'tradeoff':
      return <path d={`M0 ${s(-4.6)}L${s(4.6)} 0L0 ${s(4.6)}L${s(-4.6)} 0Z`} className="g-line" />;
    case 'cost':
      return <path d={`M${s(-3.5)} ${s(-3.5)}L${s(3.5)} ${s(3.5)}M${s(3.5)} ${s(-3.5)}L${s(-3.5)} ${s(3.5)}`} className="g-line" />;
    case 'unknown':
      return (
        <>
          <circle r={s(4.3)} className="g-line g-dots" />
          <circle r={s(1)} className="g-fill" />
        </>
      );
    case 'assumption':
      return (
        <>
          <circle r={s(4.6)} className={cn('g-line', warn)} style={{ strokeDasharray: item?.dash, opacity: item?.opacity }} />
          <circle r={s(1.7)} className={cn('g-fill', warn)} />
        </>
      );
    case 'test':
    case 'idea':
      return (
        <>
          <circle r={s(3.6)} className={cn('g-line', kind === 'idea' && 'g-dots')} />
          <path
            d={`M${s(-6.5)} 0H${s(-2)}M${s(2)} 0H${s(6.5)}M0 ${s(-6.5)}V${s(-2)}M0 ${s(2)}V${s(6.5)}`}
            className={cn('g-line', kind === 'idea' && 'g-dots')}
          />
        </>
      );
    case 'repeat':
      return (
        <>
          <circle cx={s(-2.5)} r={s(2.7)} className="g-line" />
          <circle cx={s(2.5)} r={s(2.7)} className="g-line" />
        </>
      );
  }
}

/** The key, as an anatomical plate has: each mark and what it is. */
export const KEY: { kind: AnswerKind; item?: Partial<Answer>; label: () => string }[] = [
  { kind: 'requirement', label: () => t('Requirement') },
  { kind: 'dependency', label: () => t('Dependency') },
  { kind: 'capital', label: () => t('Capital') },
  { kind: 'time', label: () => t('Time') },
  { kind: 'skill', item: { skill: 'have' }, label: () => t('Skill you have') },
  { kind: 'skill', item: { skill: 'developing' }, label: () => t('Developing') },
  { kind: 'skill', item: { skill: 'gap', warn: true }, label: () => t('Gap') },
  { kind: 'risk', label: () => t('Risk') },
  { kind: 'tradeoff', label: () => t('Trade-off') },
  { kind: 'cost', label: () => t('Opportunity cost') },
  { kind: 'unknown', label: () => t('Unknown') },
  { kind: 'assumption', label: () => t('Relies on') },
  { kind: 'test', label: () => t('Test') },
  { kind: 'idea', label: () => t('Idea for a test') },
  { kind: 'repeat', label: () => t('Repeat in play') },
];

export function Section({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

export function ItemPanel({
  item,
  path,
  onPath,
  onEditPath,
  onOpen,
}: {
  item: Answer & { index: string };
  path: StrategicPath;
  onPath(id: string): void;
  onEditPath(id: string): void;
  onOpen(ref: NonNullable<Answer['ref']>): void;
}) {
  return (
    <Section
      label={
        <>
          {item.index} · {BAND_LABEL[item.band]()} · {KIND_LABEL[item.kind]()}
        </>
      }
    >
      <p className="mt-2 text-[14px] leading-snug text-ink">{item.text}</p>
      {item.status && <p className={cn('label-sm mt-1.5', item.warn ? 'text-accent' : 'text-ink-3')}>{item.status}</p>}
      <button type="button" className="mt-3 text-left text-[12px] text-ink-3 hover:text-ink" onClick={() => onPath(path.id)}>
        {pathCode(path.code)} · {path.title}
      </button>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.ref && (
          <Button size="sm" icon={ArrowRight} onClick={() => onOpen(item.ref!)}>
            {t('Open')}
          </Button>
        )}
        {item.kind === 'idea' && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const id = adoptExperimentDraft(
                {
                  title: item.text,
                  hypothesis: t('Trying “{idea}” will reduce an unknown in {path}.', { idea: item.text.toLowerCase(), path: pathCode(path.code) }),
                  design: item.text,
                  durationDays: 30,
                  prediction: '',
                  criteria: '',
                  measures: [],
                },
                { pathId: path.id },
              );
              useAtlas.getState().updatePath(path.id, { proposedExperiments: path.proposedExperiments.filter((x) => x !== item.text) });
              useUI.getState().openEntity({ kind: 'experiment', id });
            }}
          >
            {t('Design it')}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEditPath(path.id)}>
          {t('Edit this option')}
        </Button>
      </div>
    </Section>
  );
}

export function PathPanel({
  path,
  chosen,
  since,
  counts,
  gaps,
  confirming,
  busy,
  hasPlan,
  onConfirm,
  onCancel,
  onChoose,
  onEdit,
  onCompare,
}: {
  path: StrategicPath;
  chosen: boolean;
  since?: string;
  counts(b: Band): number;
  gaps: number;
  confirming: boolean;
  busy?: boolean;
  hasPlan: boolean;
  onConfirm(): void;
  onCancel(): void;
  onChoose(): void;
  onEdit(): void;
  onCompare(): void;
}) {
  return (
    <Section
      label={
        <span className="flex items-center gap-2">
          {pathCode(path.code)}
          {chosen && since && (
            <span className="rounded-[2px] border border-accent/40 px-1.5 text-accent normal-case tracking-normal">
              {t('What you chose · since {date}', { date: formatDate(since) })}
            </span>
          )}
        </span>
      }
    >
      <h3 className="display mt-1.5 text-[20px] leading-[1.15] text-ink">{path.title}</h3>
      {path.objective && <p className="mt-1.5 text-[13px] leading-snug text-ink">{path.objective}</p>}
      {path.summary && <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{path.summary}</p>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 text-[12.5px]">
        {path.capital && (
          <>
            <dt className="label pt-[2px]">{t('Capital')}</dt>
            <dd className="text-ink-2">{path.capital}</dd>
          </>
        )}
        {path.time && (
          <>
            <dt className="label pt-[2px]">{t('Time')}</dt>
            <dd className="text-ink-2">{path.time}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
        {BANDS.map((b, i) => (
          <div key={b}>
            <div className="label-sm text-ink-3">
              {['I', 'II', 'III', 'IV'][i]} {BAND_LABEL[b]()}
            </div>
            <div className="num mt-0.5 text-[17px] text-ink">{counts(b)}</div>
          </div>
        ))}
      </div>
      {gaps > 0 && (
        <p className="mt-2 text-[12px] text-accent">
          {tn(
            gaps,
            'One mark wants attention: a gap, or a reason the exceptions outweigh.',
            '{n} marks want attention: gaps, or reasons the exceptions outweigh.',
          )}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {chosen ? (
          <Button size="sm" variant="primary" icon={ArrowRight} onClick={() => navigate('navigation')}>
            {t('Open my plan')}
          </Button>
        ) : confirming ? (
          <div className="w-full space-y-2">
            <p className="text-[12px] text-ink-2">
              {hasPlan
                ? t('This replaces your current navigation plan with a draft for this path.')
                : t('A draft navigation plan will be created for you to edit.')}
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="primary" loading={busy} onClick={onChoose}>
                {t('Choose {code}', { code: pathCode(path.code) })}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                {t('Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" icon={Check} onClick={onConfirm}>
            {t('Choose as direction')}
          </Button>
        )}
        {!confirming && (
          <>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="ghost" icon={Rows3} onClick={onCompare}>
              {t('Compare in detail')}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

export function BandPanel({
  band,
  paths,
  counts,
  onPath,
}: {
  band: Band;
  paths: StrategicPath[];
  counts(id: string, b: Band): number;
  onPath(id: string): void;
}) {
  const max = Math.max(1, ...paths.map((p) => counts(p.id, band)));
  return (
    <Section label={`${['I', 'II', 'III', 'IV'][BANDS.indexOf(band)]} · ${BAND_LABEL[band]()}`}>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
        {{
          needs: () => t('What each option needs: requirements, what it depends on, capital and time.'),
          skills: () => t('The skills each option takes, and where you stand on each.'),
          costs: () => t('What each option risks, trades away and rules out.'),
          unknowns: () => t('What is not known yet: open questions, the reasons it relies on, tests, and repeats in play.'),
        }[band]()}
      </p>
      <ul className="mt-3 space-y-2 border-t border-line pt-3">
        {paths.map((p) => (
          <li key={p.id}>
            <button type="button" className="group w-full text-left" onClick={() => onPath(p.id)}>
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink-2 group-hover:text-ink">
                  {pathCode(p.code)} · {p.title}
                </span>
                <span className="num text-ink">{counts(p.id, band)}</span>
              </div>
              <div className="mt-1 h-[2px] bg-ink/[0.08]">
                <div className="h-full bg-ink/60" style={{ width: `${(counts(p.id, band) / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">{t('More marks is not better or worse: it is how much there is to read.')}</p>
    </Section>
  );
}
