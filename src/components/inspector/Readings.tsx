import { Check, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { SentenceReading } from '../../domain/types';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { HEAD_NAMES, HEADS, type Head } from '../../ml/tasks';
import { useAtlas } from '../../state/atlasStore';

/** How far a reading must be from a toss-up to be drawn as said; under it, it is drawn dashed, as a maybe. */
const SURE = 0.6;

const ANSWER: { [H in Head]: Record<(typeof HEADS)[H][number], () => string> } = {
  act: {
    none: () => t('reports nothing in particular'),
    happened: () => t('something happened'),
    done: () => t('something done'),
    decided: () => t('a choice made'),
    planned: () => t('still to do'),
  },
  direction: { none: () => t('nothing went up or down'), up: () => t('something went up'), down: () => t('something went down') },
  cause: { no: () => t('no explanation'), yes: () => t('explains why') },
  time: { past: () => t('in the past'), now: () => t('now'), future: () => t('ahead') },
  mood: { neutral: () => t('no feeling said'), low: () => t('sounds low'), high: () => t('sounds good') },
};
const QUESTION: Record<Head, () => string> = {
  act: () => t('What it reports'),
  direction: () => t('Up or down'),
  cause: () => t('Why'),
  time: () => t('When'),
  mood: () => t('How it sounds'),
};
/** The answers that say nothing are left out of the chips, so a sentence shows only what it was read to say. */
const QUIET: Record<Head, string> = { act: 'none', direction: 'none', cause: 'no', time: 'past', mood: 'neutral' };
const answerLabel = (h: Head, a: string) => (ANSWER[h] as Record<string, () => string>)[a]?.() ?? a;

function Sentence({ r }: { r: SentenceReading }) {
  const teach = useAtlas((s) => s.teachReading);
  const [correcting, setCorrecting] = useState(false);
  const said = HEAD_NAMES.filter((h) => r.labels[h] !== QUIET[h] || r.taught?.includes(h));
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <p className="text-[12.5px] leading-snug text-ink-2">“{r.text}”</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {said.map((h) => (
          <span
            key={h}
            title={QUESTION[h]()}
            className={cn(
              'rounded-[2px] border px-1.5 text-[11.5px] leading-[18px]',
              r.taught?.includes(h) ? 'border-line-strong text-ink' : r.sure[h] >= SURE ? 'border-line text-ink-2' : 'border-dashed border-line text-ink-3',
            )}
          >
            {r.taught?.includes(h) && <Check size={10} className="mr-0.5 inline align-[-1px]" aria-hidden />}
            {answerLabel(h, r.labels[h])}
            {!r.taught?.includes(h) && r.sure[h] < SURE ? '?' : ''}
          </span>
        ))}
        {!said.length && <span className="text-[11.5px] text-ink-3">{t('nothing in particular')}</span>}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
          aria-expanded={correcting}
          onClick={() => setCorrecting((v) => !v)}
        >
          <Pencil size={11} aria-hidden />
          {correcting ? t('Done') : t('Correct')}
        </button>
      </div>
      {correcting && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {HEAD_NAMES.map((h, k) => (
            <label key={h} className="grid gap-0.5">
              <span className="label">{QUESTION[h]()}</span>
              <select
                className="field h-7 py-0 text-[12px]"
                value={r.labels[h]}
                onChange={(e) => teach(r.text, k, (HEADS[h] as readonly string[]).indexOf(e.target.value))}
              >
                {(HEADS[h] as readonly string[]).map((a) => (
                  <option key={a} value={a}>
                    {answerLabel(h, a)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * What the local AI read in each sentence of a note, and the place to correct it. A correction is kept (with your
 * atlas) and teaches it: the same sentence reads as you said from then on, and similar ones lean that way.
 */
export function Readings({ readings }: { readings: SentenceReading[] }) {
  const by = readings.some((r) => r.by === 'model') ? t('the language model') : t('the built-in model');
  return (
    <details>
      <summary className="cursor-pointer text-[11.5px] text-ink-3 hover:text-ink">{t('How the local AI read each sentence')}</summary>
      <ul className="mt-1.5 divide-y divide-line">
        {readings.map((r, i) => (
          <Sentence key={`${i}:${r.text}`} r={r} />
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
        {t('Read by {by}. Dashed with a question mark: not sure. Correct a sentence and it learns from you.', { by })}
      </p>
    </details>
  );
}
