/**
 * Claude with the person's own Anthropic API key, wherever claude.ai does not lend its own: the app on GitHub Pages,
 * installed, or a build of one's own. The key is theirs (console.anthropic.com), and so is what it costs. It stays in
 * this browser, apart from the atlas (never exported, synced or kept in a version), and goes only to api.anthropic.com,
 * straight from the page: there is no server in between.
 *
 * It answers in the same shape as claude.ai's own (`Sample`, runtime/claude.ts): a prompt, the answer streamed as it is
 * written, the page's functions as tools, and a JSON variant. So the agent, the analysis and the weekly review run on
 * either without knowing which. The official SDK is fetched only when the key is first used.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import { t } from '../i18n';
import { safeLocalStorage } from '../persistence/local';
import type { Sample, SampleError, SampleOptions, SampleTool } from '../runtime/claude';

type Message = Anthropic.Beta.BetaMessage;
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

const KEY = 'cognitive-atlas:claude-key';
const MODEL = 'cognitive-atlas:claude-model';

/** The models offered: the most capable by default; the others answer sooner and cost less, the person's choice. */
export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: () => t('The most capable (the default)') },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: () => t('Faster and cheaper') },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', note: () => t('Fastest and cheapest, for simple questions') },
] as const;
export type ModelId = (typeof MODELS)[number]['id'];
const known = (m: string | null): ModelId => MODELS.find((x) => x.id === m)?.id ?? MODELS[0].id;
const read = (name: string) => (safeLocalStorage.getItem(name) as string | null) ?? '';

interface OwnKey {
  key: string;
  model: ModelId;
  save(key: string): void;
  forget(): void;
  choose(model: ModelId): void;
}

export const useOwnKey = create<OwnKey>()((set) => ({
  key: typeof window === 'undefined' ? '' : read(KEY),
  model: typeof window === 'undefined' ? MODELS[0].id : known(read(MODEL)),
  save(key) {
    safeLocalStorage.setItem(KEY, key.trim());
    set({ key: key.trim() });
  },
  forget() {
    safeLocalStorage.removeItem(KEY);
    set({ key: '' });
  },
  choose(model) {
    safeLocalStorage.setItem(MODEL, model);
    set({ model });
  },
}));

// A key saved or removed in another tab holds here too.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) useOwnKey.setState({ key: e.newValue ?? '' });
    if (e.key === MODEL) useOwnKey.setState({ model: known(e.newValue) });
  });

/** The key as it may be shown: its start and its last four characters. */
export const maskedKey = (key: string) => (key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : '…');

/* ---- Asking ---------------------------------------------------------------------------------------------------- */

/** One request, its text streamed through `onText` as it is written: the API, or a stand-in in tests. */
export type Send = (params: Params, onText: (delta: string) => void, signal?: AbortSignal) => Promise<Message>;

/** Tool rounds before Claude must answer; claude.ai allows a handful too. */
const ROUNDS = 8;
/** The largest tool result sent back, as claude.ai's. */
const RESULT_MAX = 32_000;

/** How hard the model thinks, by the tier a caller asks for (the smallest model has no such setting). */
const EFFORT = { quick: 'low', default: 'medium', complex: 'high' } as const;

function request(model: ModelId, tier: SampleOptions['modelTier']): Omit<Params, 'messages'> {
  const base = { model, max_tokens: 64_000, cache_control: { type: 'ephemeral' as const } };
  if (model === 'claude-haiku-4-5') return base;
  // A request the model declines is run again on a model that can take it, in the same call.
  return {
    ...base,
    output_config: { effort: EFFORT[tier ?? 'default'] },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
}

const asTool = (tool: SampleTool): Anthropic.Beta.BetaTool => ({
  name: tool.name,
  description: tool.description,
  input_schema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Anthropic.Beta.BetaTool.InputSchema,
  eager_input_streaming: true,
});

async function runTool(
  tool: SampleTool | undefined,
  use: Anthropic.Beta.BetaToolUseBlock,
  signal: AbortSignal,
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  try {
    if (!tool) throw new Error(`there is no tool called ${use.name}`);
    const out = await tool.execute((use.input ?? {}) as Record<string, unknown>, { signal });
    const text = typeof out === 'string' ? out : JSON.stringify(out ?? null);
    return { type: 'tool_result', tool_use_id: use.id, content: text.length > RESULT_MAX ? `${text.slice(0, RESULT_MAX)}…` : text };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Error: ${(e as Error)?.message ?? String(e)}` };
  }
}

/**
 * A turn with Claude, tools and all: each round's text joins the answer so far (a blank line between rounds), the
 * tools Claude calls run here, and the last round must answer. Every round's reply goes back exactly as it came, as
 * the model needs it.
 */
export async function converse(
  send: Send,
  model: ModelId,
  input: string,
  options: SampleOptions = {},
): Promise<{ text: string; last: string; truncated: boolean }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: input }];
  const tools = options.tools?.length ? options.tools : undefined;
  let whole = '';
  for (let round = 0; ; round++) {
    let last = '';
    const onText = (delta: string) => {
      if (!delta) return;
      const add = !last && whole ? `\n\n${delta}` : delta;
      last += delta;
      whole += add;
      options.onText?.({ text: whole, delta: add });
    };
    let message: Message;
    try {
      message = await send(
        {
          ...request(model, options.modelTier),
          messages,
          ...(tools ? { tools: tools.map(asTool), ...(round === ROUNDS - 1 ? { tool_choice: { type: 'none' as const } } : {}) } : {}),
        },
        onText,
        options.signal,
      );
    } catch (e) {
      throw await sampleError(e, whole, options.signal);
    }
    if (message.stop_reason === 'refusal') throw { code: 'refused', message: 'Claude declined this request.' } satisfies SampleError;
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (message.stop_reason !== 'tool_use' || !uses.length || !tools || round >= ROUNDS - 1) {
      if (!whole.trim()) throw { code: 'empty_completion', message: 'Claude produced no text.' } satisfies SampleError;
      return { text: whole, last, truncated: message.stop_reason === 'max_tokens' };
    }
    messages.push({ role: 'assistant', content: message.content });
    const signal = options.signal ?? new AbortController().signal;
    messages.push({
      role: 'user',
      content: await Promise.all(
        uses.map((u) =>
          runTool(
            tools.find((x) => x.name === u.name),
            u,
            signal,
          ),
        ),
      ),
    });
  }
}

/** A failed request, as claude.ai's own failures are told (see sampleErrorText): by kind, never by message. */
async function sampleError(e: unknown, text: string, signal?: AbortSignal): Promise<SampleError> {
  const partial = text ? { text } : {};
  if (signal?.aborted) return { code: 'cancelled', message: 'Stopped.', ...partial };
  if (typeof e === 'object' && e && 'code' in e && typeof (e as SampleError).code === 'string' && !(e instanceof Error)) return e as SampleError;
  const { default: SDK } = await import('@anthropic-ai/sdk');
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof SDK.APIUserAbortError) return { code: 'cancelled', message, ...partial };
  if (e instanceof SDK.AuthenticationError || e instanceof SDK.PermissionDeniedError) return { code: 'invalid_key', message, ...partial };
  if (e instanceof SDK.NotFoundError) return { code: 'model_unavailable', message, ...partial };
  if (e instanceof SDK.RateLimitError) return { code: 'rate_limited', message, ...partial };
  if (e instanceof SDK.BadRequestError) return { code: 'bad_request', message: apiMessage(e), ...partial };
  if (e instanceof SDK.APIConnectionError) return { code: 'unreachable', message, ...partial };
  return { code: 'upstream_error', message, ...partial };
}

/** What the API said was wrong (a credit balance too low, say), for the person to read. */
function apiMessage(e: Error): string {
  const error = (e as Error & { error?: { error?: { message?: string } } }).error?.error?.message;
  return error ?? e.message;
}

/** One JSON value from a reply: the whole of it, a fenced block, or the span from the first bracket to the last. */
export function readJson(text: string): unknown {
  const tries = [text.trim(), /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]?.trim()];
  const open = text.search(/[[{]/);
  const close = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (open >= 0 && close > open) tries.push(text.slice(open, close + 1));
  for (const candidate of tries) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* the next way */
    }
  }
  throw { code: 'invalid_json', message: 'The answer held no JSON.', text } satisfies SampleError;
}

let client: { key: string; sdk: Promise<Anthropic> } | undefined;
/** The SDK's client for this key, made once: fetched with the SDK the first time Claude is asked. */
function clientFor(key: string): Promise<Anthropic> {
  if (client?.key !== key)
    client = {
      key,
      sdk: import('@anthropic-ai/sdk').then(({ default: SDK }) => new SDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 })),
    };
  return client.sdk;
}

/** The API, streamed. */
const apiSend =
  (key: string): Send =>
  async (params, onText, signal) => {
    const sdk = await clientFor(key);
    const stream = sdk.beta.messages.stream(params, { signal });
    stream.on('text', (delta) => onText(delta));
    return stream.finalMessage();
  };

/** Claude on this key, in the shape of claude.ai's own: what the agent, the analysis and the review ask. */
export function keySample(key: string, model: ModelId, send: Send = apiSend(key)): Sample {
  const sample = (async (input: string, options: SampleOptions = {}) => {
    const { text, truncated } = await converse(send, model, input, options);
    return { text, truncated };
  }) as Sample;
  sample.json = async <T>(input: string, options: SampleOptions = {}) => {
    const { last, text } = await converse(send, model, input, options);
    try {
      return readJson(last || text) as T;
    } catch (e) {
      throw { ...(e as SampleError), text } satisfies SampleError;
    }
  };
  sample.limits = async () => ({ maxPromptBytes: 262_144, tools: { maxCount: 64 } });
  return sample;
}

/** Whether a key works, and for this model: asks for the model's description, which costs nothing. */
export async function checkKey(key: string, model: ModelId): Promise<{ ok: true } | { ok: false; error: SampleError }> {
  try {
    await (await clientFor(key)).models.retrieve(model);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: await sampleError(e, '') };
  }
}
