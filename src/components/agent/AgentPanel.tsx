import { ArrowUp, CalendarClock, ChevronsRight, CircleHelp, HelpCircle, ListChecks, MessageSquarePlus, PenLine, Square, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { navigate } from '../../app/router';
import { applicable, describe, LENS_LABEL, LENS_OF, LENS_ORDER, summary } from '../../agent/changes';
import { citationLabel, splitCitations } from '../../agent/refs';
import { useAgentPanel } from '../../agent/panel';
import { useAgent } from '../../agent/store';
import { useClaudeVia } from '../../ai/access';
import type { AgentMessage, AgentMode, ChangeSet, Citation } from '../../agent/types';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { whereOpened } from '../../runtime/claude';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { ClaudeElsewhere } from '../shell/ClaudeElsewhere';
import { Button, IconButton } from '../ui/Button';

/** The agent's mark: a small atlas, a dot on its ring. */
function AgentMark({ size = 28, live }: { size?: number; live?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="15" fill="var(--color-ink)" fillOpacity="0.06" stroke="var(--color-line-strong)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--color-ink-3)" strokeDasharray="2 3" />
      <circle cx="16" cy="16" r="2.4" fill="var(--color-ink)" />
      <circle cx="24.5" cy="11" r="2" fill={live ? 'var(--color-accent)' : 'var(--color-ink-2)'} className={live ? 'animate-pulse' : undefined} />
    </svg>
  );
}

function Chip({ c }: { c: Citation }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const label = citationLabel(data, c);
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={() => open({ kind: c.kind, id: c.id })}
      title={label}
      className="mx-0.5 inline-flex max-w-[16rem] items-baseline rounded-[2px] border border-line bg-ink/[0.03] px-1 align-baseline text-[11.5px] leading-[17px] text-ink-2 hover:border-line-strong hover:text-ink"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

/** What the agent would add, lens by lens, to apply or not. Drawn dashed while it is only a possibility. */
function Preview({ messageId, set }: { messageId: string; set: ChangeSet }) {
  const { toggleChange, apply, discard, undo, busy } = useAgent();
  const draft = set.state === 'draft';
  const n = applicable(set).length;
  return (
    <div className={cn('mt-2.5 rounded-[2px] border', draft ? 'border-dashed border-line-strong' : 'border-line')}>
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <span className="label">
          {draft ? t('Preview') : set.state === 'applied' ? t('Applied') : set.state === 'undone' ? t('Taken back') : t('Not applied')}
        </span>
        <span className="truncate text-[11.5px] text-ink-3">{summary(set)}</span>
      </div>
      <div className="divide-y divide-line">
        {LENS_ORDER.filter((lens) => set.items.some((i) => LENS_OF[i.change.kind] === lens)).map((lens) => (
          <div key={lens} className="px-3 py-2">
            <div className="label-sm mb-1 text-ink-3">{LENS_LABEL[lens]()}</div>
            <ul className="space-y-1">
              {set.items
                .filter((i) => LENS_OF[i.change.kind] === lens)
                .map((i) => {
                  const d = describe(i.change);
                  const blocked = Boolean(i.problem) || (i.exists && i.change.kind !== 'note');
                  return (
                    <li key={i.key}>
                      <label className={cn('flex gap-2 text-[12.5px] leading-snug', draft && !blocked ? 'cursor-pointer' : '')}>
                        {draft && (
                          <input
                            type="checkbox"
                            className="mt-[3px] accent-[var(--color-accent)]"
                            checked={i.include && !blocked}
                            disabled={blocked || busy}
                            onChange={() => toggleChange(messageId, i.key)}
                          />
                        )}
                        <span className={cn('min-w-0', !i.include && 'opacity-50')}>
                          <span className="text-ink">{d.title}</span>
                          {d.detail && <span className="block text-[11.5px] text-ink-3">{d.detail}</span>}
                          {i.problem && <span className="block text-[11.5px] text-counter">{i.problem}</span>}
                          {!i.problem && i.exists && i.change.kind !== 'note' && (
                            <span className="block text-[11.5px] text-ink-3">{t('Already on your atlas: it is used as it is.')}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {draft ? (
          <>
            <Button size="sm" variant="primary" disabled={!n || busy} loading={busy} onClick={() => void apply(messageId)}>
              {n ? tn(n, 'Apply one change', 'Apply {n} changes') : t('Nothing to apply')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => discard(messageId)}>
              {t('Discard')}
            </Button>
            <span className="ml-auto text-[11px] text-ink-3">{t('A version is saved first.')}</span>
          </>
        ) : set.state === 'applied' ? (
          <>
            <span className="text-[12px] text-ink-2">{t('Added to your atlas.')}</span>
            <Button size="sm" variant="ghost" icon={Undo2} className="ml-auto" onClick={() => undo(messageId)}>
              {t('Undo all')}
            </Button>
          </>
        ) : (
          <span className="text-[12px] text-ink-3">{set.state === 'undone' ? t('Everything it added was taken back.') : t('Nothing was added.')}</span>
        )}
      </div>
    </div>
  );
}

function Message({ m }: { m: AgentMessage }) {
  const data = useAtlas((s) => s.data);
  if (m.role === 'user')
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[2px] bg-ink/[0.06] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{m.text}</p>
      </div>
    );
  const inline = splitCitations(data, m.text);
  const cited = new Set(inline.filter((x): x is Citation => typeof x !== 'string').map((c) => `${c.kind}:${c.id}`));
  const more = (m.cites ?? []).filter((c) => !cited.has(`${c.kind}:${c.id}`));
  return (
    <div className="flex gap-2.5">
      <AgentMark size={22} live={m.streaming} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] leading-relaxed whitespace-pre-wrap', m.error ? 'text-counter' : m.refused ? 'text-ink-2' : 'text-ink')}>
          {inline.map((part, i) => (typeof part === 'string' ? <span key={i}>{part}</span> : <Chip key={i} c={part} />))}
          {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-[-2px]" aria-hidden />}
        </p>
        {more.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-y-1">
            {more.map((c) => (
              <Chip key={`${c.kind}:${c.id}`} c={c} />
            ))}
          </div>
        )}
        {m.open && m.open.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.open.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => navigate(o.route, o.param)}
                className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              >
                {o.label} →
              </button>
            ))}
          </div>
        )}
        {m.changes && <Preview messageId={m.id} set={m.changes} />}
        {!m.streaming && (
          <div className="mt-1 text-[10.5px] text-ink-3">{m.by === 'claude' ? t('Claude, on your account') : t('The agent on this device')}</div>
        )}
      </div>
    </div>
  );
}

/** Ways to start, as in the empty panel: some ask at once, some start a sentence for the person to finish. */
const STARTS: { icon: typeof PenLine; label: () => string; text: () => string; send?: boolean }[] = [
  { icon: PenLine, label: () => t('Tell me what happened today'), text: () => t('Today ') },
  { icon: HelpCircle, label: () => t('Why does something keep happening?'), text: () => t('Why does ') },
  { icon: ListChecks, label: () => t('Summarise this week'), text: () => t('Summarise this week'), send: true },
  { icon: CalendarClock, label: () => t('Plan a quest with a deadline'), text: () => t('Deadline: ') },
  { icon: CircleHelp, label: () => t('What can you do?'), text: () => t('What can you do?'), send: true },
];

const MODES: { value: AgentMode; label: () => string }[] = [
  { value: 'auto', label: () => t('Auto') },
  { value: 'local', label: () => t('On this device') },
  { value: 'claude', label: () => t('Claude') },
];

/**
 * The agent, in a side panel (the whole screen on a phone): type, and it drafts your atlas or talks it through with
 * you. Opened from the top bar or with A.
 */
export function AgentPanel() {
  const { open, setOpen } = useAgentPanel();
  const { messages, send, busy, stop, mode, setMode, newChat } = useAgent();
  const via = useClaudeVia();
  const ready = via === 'account' || via === 'key';
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, last?.text, last?.changes?.state]);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  if (!open) return null;
  const submit = () => {
    const text = draft;
    if (!text.trim() || busy) return;
    setDraft('');
    void send(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const start = (s: (typeof STARTS)[number]) => {
    if (s.send) return void send(s.text());
    setDraft(s.text());
    setTimeout(() => {
      input.current?.focus();
      input.current?.setSelectionRange(s.text().length, s.text().length);
    }, 0);
  };
  const answering =
    mode === 'claude' && via === null
      ? t('Claude, not available here')
      : mode === 'claude' || (mode === 'auto' && ready)
        ? via === 'key'
          ? t('Claude, with your API key')
          : t('Claude, on your account')
        : t('The agent on this device');

  return (
    <aside
      aria-label={t('Atlas agent')}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))}
      className="fixed inset-0 z-[45] flex animate-slide-in-right flex-col bg-surface md:inset-y-0 md:bg-surface/[0.97] md:backdrop-blur-md md:top-[52px] md:right-0 md:left-auto md:z-40 md:w-[400px] md:border-l md:border-line-strong md:shadow-[-40px_0_80px_-40px_rgb(0_0_0/0.8)]"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-2">
        <span className="label shrink-0 px-2">{t('Atlas agent')}</span>
        <span className="truncate text-[11px] text-ink-3">{answering}</span>
        <IconButton icon={MessageSquarePlus} label={t('New chat')} size="sm" className="ml-auto" onClick={newChat} disabled={!messages.length} />
        <IconButton icon={ChevronsRight} label={t('Close')} size="sm" onClick={() => setOpen(false)} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!messages.length ? (
          <div className="flex h-full flex-col justify-end pb-2">
            <AgentMark size={56} />
            <h2 className="mt-4 display text-[21px] leading-tight text-ink">{t('What would you like to build or talk through?')}</h2>
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
              {t('I work on your atlas: tell me what happened and I’ll draft it into your lenses, or ask about it. Nothing is added until you apply it.')}
            </p>
            <ul className="mt-4 space-y-0.5">
              {STARTS.map((s) => (
                <li key={s.label()}>
                  <button
                    type="button"
                    onClick={() => start(s)}
                    className="flex w-full items-center gap-3 rounded-[2px] px-1.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
                  >
                    <s.icon size={16} strokeWidth={1.7} aria-hidden className="text-ink-3" />
                    {s.label()}
                  </button>
                </li>
              ))}
            </ul>
            {via === null && mode === 'auto' && <ClaudeElsewhere className="mt-4 border-t border-line pt-3" />}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="shrink-0 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {via === null && mode === 'claude' && (
          // Chosen where it cannot answer (the choice is kept from a visit in claude.ai): say so before anything is sent.
          <div role="note" className="mb-2.5">
            <ClaudeElsewhere />
            <button type="button" onClick={() => setMode('auto')} className="tap mt-1 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">
              {t('Let the agent on this device answer')}
            </button>
          </div>
        )}
        <div className="rounded-[2px] border border-line-strong bg-[rgb(236_232_223/0.025)] transition-colors hover:border-[rgb(236_232_223/0.26)] focus-within:border-accent!">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={t('Tell or ask the agent…')}
            aria-label={t('Message to the agent')}
            className="block max-h-40 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <label className="sr-only" htmlFor="agent-mode">
              {t('Who answers')}
            </label>
            <select
              id="agent-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentMode)}
              className="select-bare h-7 rounded-[2px] border border-transparent bg-transparent pl-1.5 text-[12px] text-ink-2 hover:border-line"
              title={
                ready
                  ? undefined
                  : whereOpened() === 'outside'
                    ? t('Claude answers here with your own Anthropic API key, added in Settings.')
                    : t('Claude answers when the Atlas is opened in claude.ai, signed in.')
              }
            >
              {MODES.map((o) => (
                <option key={o.value} value={o.value} disabled={o.value === 'claude' && !ready && mode !== 'claude'}>
                  {o.label()}
                </option>
              ))}
            </select>
            {busy ? (
              <IconButton icon={Square} label={t('Stop')} className="ml-auto" onClick={stop} />
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                aria-label={t('Send')}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-[2px] bg-ink text-canvas transition-opacity disabled:opacity-25"
              >
                <ArrowUp size={15} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-ink-3">{t('About your atlas only. It can be wrong: check what it drafts before you apply it.')}</p>
      </div>
    </aside>
  );
}
