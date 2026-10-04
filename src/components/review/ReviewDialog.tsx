import { Check, Sparkles, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import type { SampleError } from '../../runtime/claude';
import { sampleErrorText } from '../../ai/account';
import type { Review } from '../../ai/review';
import { EFFECT_META } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { EntityRef } from '../../domain/types';
import { useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';

type Phase = { kind: 'idle' } | { kind: 'thinking' } | { kind: 'done'; review: Review } | { kind: 'error'; message: string };

/** A cited note, happening or decision, opened in the panel. */
function Cites({ ids }: { ids: string[] }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const refs = ids.flatMap((id): { ref: EntityRef; label: string }[] =>
    data.entries[id]
      ? [{ ref: { kind: 'entry', id }, label: data.entries[id].title }]
      : data.occurrences[id]
        ? [{ ref: { kind: 'occurrence', id }, label: data.occurrences[id].label }]
        : data.decisions[id]
          ? [{ ref: { kind: 'decision', id }, label: data.decisions[id].title }]
          : [],
  );
  if (!refs.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {refs.map((r) => (
        <button
          key={r.ref.id}
          type="button"
          className="tap rounded-[2px] border border-line px-1.5 py-px text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
          onClick={() => open(r.ref)}
        >
          {r.label}
        </button>
      ))}
    </span>
  );
}

/**
 * The weekly review: what goes to Claude is said first, nothing is sent
 * until the person asks, it can be stopped, and nothing from it enters the
 * atlas unless the person keeps it (a reason as a proposal, a question).
 */
export function ReviewDialog() {
  const open = useUI((s) => s.reviewOpen);
  const setOpen = useUI((s) => s.setReviewOpen);
  const data = useAtlas((s) => s.data);
  const addClaim = useAtlas((s) => s.addClaim);
  const addNode = useAtlas((s) => s.addNode);
  const openEntity = useUI((s) => s.openEntity);
  const today = useToday();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [kept, setKept] = useState<Record<string, string>>({});
  const stop = useRef<AbortController | null>(null);

  const ask = async () => {
    const ctl = new AbortController();
    stop.current = ctl;
    setPhase({ kind: 'thinking' });
    setKept({});
    try {
      const { runReview } = await import('../../ai/review');
      const review = await runReview(data, today, { signal: ctl.signal });
      setPhase({ kind: 'done', review });
    } catch (e) {
      const { code, message } = (e ?? {}) as Partial<SampleError>;
      setPhase(code === 'cancelled' ? { kind: 'idle' } : { kind: 'error', message: sampleErrorText(code, message) });
    }
  };

  const close = () => {
    stop.current?.abort();
    setOpen(false);
  };

  const name = (id: string) => displayNode(data, id)?.label ?? '';

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('Weekly review with Claude')}
      description={t('On your own claude.ai account. Claude reads, suggests and asks; nothing changes in your atlas unless you keep it.')}
      width="max-w-[640px]"
      footer={
        phase.kind === 'thinking' ? (
          <Button variant="ghost" icon={Square} onClick={() => stop.current?.abort()}>
            {t('Stop')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {t('Close')}
            </Button>
            <Button variant="primary" icon={Sparkles} onClick={() => void ask()}>
              {phase.kind === 'idle' ? t('Ask Claude') : t('Ask again')}
            </Button>
          </>
        )
      }
    >
      {phase.kind === 'idle' && (
        <div className="space-y-2 text-[13px] leading-snug text-ink-2">
          <p>
            {t(
              'What is sent: your elements and possible reasons, the notes and happenings of the last six weeks, how predictions went, and what the Atlas has learned from you. Claude may also search and read older notes.',
            )}
          </p>
          <p className="text-ink-3">{t('The first time, claude.ai asks you to allow it. It uses your own usage and can take a minute.')}</p>
        </div>
      )}

      {phase.kind === 'thinking' && <p className="text-[13px] text-ink-3">{t('Thinking…')}</p>}

      {phase.kind === 'error' && <p className="text-[13px] text-ink-2">{phase.message}</p>}

      {phase.kind === 'done' && (
        <div className="space-y-5 text-[13px] leading-snug">
          <section>
            <div className="label mb-1">{t('What the records show lately')}</div>
            <p className="text-ink-2">{phase.review.summary}</p>
          </section>

          {phase.review.readings.length > 0 && (
            <section>
              <div className="label mb-1.5">{t('Possible reasons not on the map yet')}</div>
              <ul className="space-y-2.5">
                {phase.review.readings.map((r, i) => {
                  const key = `r${i}`;
                  return (
                    <li key={key} className="rounded-[2px] border border-line p-2.5">
                      <p className="text-ink">{r.text}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        {name(r.from_id)} → {EFFECT_META[r.effect].label.toLowerCase()} → {name(r.to_id)}
                      </p>
                      <p className="mt-1 text-[12.5px] text-ink-2">{r.why}</p>
                      <Cites ids={r.cites} />
                      <div className="mt-2">
                        {kept[key] ? (
                          <Button size="sm" variant="ghost" icon={Check} onClick={() => openEntity({ kind: 'claim', id: kept[key] })}>
                            {t('Added as a proposal · open')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              const id = addClaim({ from: r.from_id, to: r.to_id, effect: r.effect, author: 'inferred', state: 'suggested' });
                              setKept((k) => ({ ...k, [key]: id }));
                            }}
                          >
                            {t('Add as a possible reason')}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[12px] text-ink-3">{t('Added reasons stay proposals, off the map, until you adopt them.')}</p>
            </section>
          )}

          {phase.review.tensions.length > 0 && (
            <section>
              <div className="label mb-1.5">{t('What does not fit together')}</div>
              <ul className="space-y-2">
                {phase.review.tensions.map((x, i) => (
                  <li key={i}>
                    <p className="text-ink">{x.text}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">{x.why}</p>
                    <Cites ids={x.cites} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {phase.review.questions.length > 0 && (
            <section>
              <div className="label mb-1.5">{t('Questions that would tell readings apart')}</div>
              <ul className="space-y-2.5">
                {phase.review.questions.map((q, i) => {
                  const key = `q${i}`;
                  return (
                    <li key={key}>
                      <p className="text-ink">{q.text}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">{q.why}</p>
                      <div className="mt-1.5">
                        {kept[key] ? (
                          <Button size="sm" variant="ghost" icon={Check} onClick={() => openEntity({ kind: 'node', id: kept[key] })}>
                            {t('Kept · open')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const about = q.about_id ? data.nodes[q.about_id] : undefined;
                              const id = addNode({ label: q.text, kind: 'question', area: about?.area ?? 'self', origin: 'inferred', adopted: true });
                              setKept((k) => ({ ...k, [key]: id }));
                            }}
                          >
                            {t('Keep as a question')}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
