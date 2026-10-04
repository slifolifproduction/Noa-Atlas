/**
 * The conversation with the agent: what was said, which model answers, and the previews waiting to be applied.
 *
 * A message is checked first (scope.ts): what is plainly outside is answered here, and never sent. Then Claude
 * answers if it was chosen (or, on Auto, if it can be asked from here: in claude.ai, or with the person's own API
 * key), and the agent on this device otherwise; on Auto, if Claude cannot answer, the device does, and says so. The
 * conversation is kept on this device.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { claudeReady } from '../ai/access';
import { sampleErrorText } from '../ai/account';
import { t } from '../i18n';
import { todayISO } from '../lib/dates';
import { createId } from '../lib/ids';
import { safeLocalStorage } from '../persistence/local';
import type { SampleError } from '../runtime/claude';
import { useAtlas } from '../state/atlasStore';
import { applyChanges, check, draftChanges, undoChanges } from './changes';
import { claudeTurn, INSTRUCTIONS } from './claude';
import { localReply } from './local';
import { citationsIn } from './refs';
import { check as inScope, clean, refusal } from './scope';
import type { AgentMessage, AgentMode, ChangeSet, Citation } from './types';

interface AgentState {
  mode: AgentMode;
  messages: AgentMessage[];
  busy: boolean;
  setMode(mode: AgentMode): void;
  newChat(): void;
  send(text: string): Promise<void>;
  stop(): void;
  toggleChange(messageId: string, key: string): void;
  apply(messageId: string): Promise<void>;
  discard(messageId: string): void;
  undo(messageId: string): void;
}

const KEEP = 60;
let controller: AbortController | null = null;
const now = () => new Date().toISOString();
const unique = (cites: Citation[]) => cites.filter((c, i) => cites.findIndex((x) => x.kind === c.kind && x.id === c.id) === i);

export const useAgent = create<AgentState>()(
  persist(
    (set, get) => {
      const push = (m: AgentMessage) => set((s) => ({ messages: [...s.messages, m].slice(-KEEP) }));
      const patch = (id: string, p: Partial<AgentMessage>) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
      const changesOf = (id: string) => get().messages.find((m) => m.id === id)?.changes;
      const setChanges = (id: string, changes: ChangeSet) => patch(id, { changes });

      const answerHere = (text: string, prefix?: string): Omit<AgentMessage, 'id' | 'at' | 'role'> => {
        const data = useAtlas.getState().data;
        const r = localReply(text, data, todayISO());
        return {
          by: 'local',
          text: prefix ? `${prefix}\n\n${r.text}` : r.text,
          cites: unique([...citationsIn(data, r.text), ...(r.cites ?? [])]),
          open: r.open,
          changes: r.changes?.length ? draftChanges(data, r.changes) : undefined,
        };
      };

      return {
        mode: 'auto',
        messages: [],
        busy: false,
        setMode: (mode) => set({ mode }),
        newChat: () => {
          controller?.abort();
          set({ messages: [], busy: false });
        },
        stop: () => controller?.abort(),

        async send(raw) {
          const text = raw.trim();
          if (!text || get().busy) return;
          const history = get().messages;
          push({ id: createId('msg'), role: 'user', text, at: now() });

          // Plainly outside what the agent is for: answered here, never sent anywhere.
          const verdict = inScope(text);
          if (!verdict.ok) {
            push({ id: createId('msg'), role: 'agent', text: refusal(verdict.why), at: now(), by: 'local', refused: true });
            return;
          }

          const mode = get().mode;
          if (mode === 'local' || (mode === 'auto' && !claudeReady())) {
            push({ id: createId('msg'), role: 'agent', at: now(), ...answerHere(text) });
            return;
          }

          const id = createId('msg');
          push({ id, role: 'agent', text: '', at: now(), by: 'claude', streaming: true });
          set({ busy: true });
          controller = new AbortController();
          const signal = controller.signal;
          try {
            const turn = await claudeTurn(history, text, useAtlas.getState().data, todayISO(), {
              signal,
              onText: (partial) => patch(id, { text: clean(partial, INSTRUCTIONS).text }),
            });
            const data = useAtlas.getState().data;
            const shown = clean(turn.text, INSTRUCTIONS);
            patch(id, {
              text: shown.text,
              streaming: false,
              refused: shown.withheld || undefined,
              cites: shown.withheld ? [] : citationsIn(data, shown.text),
              changes: turn.drafts.length && !shown.withheld ? { id: createId('cs'), state: 'draft', items: check(data, turn.drafts) } : undefined,
            });
          } catch (error) {
            const { code, message } = (error ?? {}) as Partial<SampleError>;
            const partial = get().messages.find((m) => m.id === id)?.text ?? '';
            if (signal.aborted || code === 'aborted') patch(id, { streaming: false, text: partial || t('Stopped.') });
            else if (mode === 'auto')
              patch(id, {
                streaming: false,
                ...answerHere(
                  text,
                  t('Claude could not answer just now ({reason}), so this is from the agent on this device.', { reason: sampleErrorText(code, message) }),
                ),
              });
            else patch(id, { streaming: false, error: true, text: sampleErrorText(code, message) });
          } finally {
            controller = null;
            set({ busy: false });
          }
        },

        toggleChange(messageId, key) {
          const cs = changesOf(messageId);
          if (!cs || cs.state !== 'draft') return;
          const items = cs.items.map((i) => (i.key === key ? { ...i, include: !i.include } : i));
          setChanges(messageId, { ...cs, items: check(useAtlas.getState().data, items) });
        },

        async apply(messageId) {
          const cs = changesOf(messageId);
          if (!cs || cs.state !== 'draft' || get().busy) return;
          set({ busy: true });
          try {
            setChanges(messageId, await applyChanges(cs));
          } finally {
            set({ busy: false });
          }
        },

        discard(messageId) {
          const cs = changesOf(messageId);
          if (cs?.state === 'draft') setChanges(messageId, { ...cs, state: 'discarded' });
        },

        undo(messageId) {
          const cs = changesOf(messageId);
          if (cs?.state === 'applied') setChanges(messageId, undoChanges(cs));
        },
      };
    },
    {
      name: 'cognitive-atlas:agent',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ mode: s.mode, messages: s.messages.filter((m) => !m.streaming).slice(-KEEP) }),
    },
  ),
);
