import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { SampleError, SampleTool } from '../runtime/claude';
import { converse, keySample, maskedKey, readJson, type Send } from './ownKey';

type Reply = { text?: string; tools?: { id: string; name: string; input: unknown }[]; stop?: string };
type Params = Parameters<Send>[0];

/** A stand-in for the API: answers each request with the next reply, its text streamed, and keeps what it was sent. */
function fakeApi(replies: (Reply | Error)[]) {
  const sent: Params[] = [];
  const send: Send = async (params, onText) => {
    sent.push(structuredClone(params));
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    if (reply.text) for (const word of reply.text.split(/(?<= )/)) onText(word);
    return {
      id: `msg_${sent.length}`,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content: [
        ...(reply.text ? [{ type: 'text' as const, text: reply.text, citations: null }] : []),
        ...(reply.tools ?? []).map((t) => ({ type: 'tool_use' as const, ...t })),
      ],
      stop_reason: (reply.stop ?? (reply.tools?.length ? 'tool_use' : 'end_turn')) as 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Anthropic.Beta.BetaMessage;
  };
  return { send, sent };
}

const lookup: SampleTool = {
  name: 'search_notes',
  description: 'Search the notes.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  execute: (input) => `found: ${String(input.query)}`,
};

describe('Claude with the person’s own key', () => {
  it('runs the tools Claude asks for and sends every result back together, then answers', async () => {
    const { send, sent } = fakeApi([
      {
        text: 'Let me look.',
        tools: [
          { id: 'tu_1', name: 'search_notes', input: { query: 'sleep' } },
          { id: 'tu_2', name: 'no_such_tool', input: {} },
        ],
      },
      { text: 'You slept badly before [N3].' },
    ]);
    const updates: string[] = [];
    const out = await converse(send, 'claude-opus-5-5', 'Why am I tired?', { tools: [lookup], onText: ({ text }) => updates.push(text) });

    expect(out.text).toBe('Let me look.\n\nYou slept badly before [N3].');
    expect(out.last).toBe('You slept badly before [N3].');
    expect(updates.at(-1)).toBe(out.text);
    expect(sent).toHaveLength(2);

    // The first reply goes back as it came, and both results in one message after it.
    const [, assistant, results] = sent[1].messages;
    expect(assistant.role).toBe('assistant');
    expect((assistant.content as { type: string }[]).map((b) => b.type)).toEqual(['text', 'tool_use', 'tool_use']);
    expect(results.role).toBe('user');
    expect(results.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'found: sleep' },
      { type: 'tool_result', tool_use_id: 'tu_2', is_error: true, content: 'Error: there is no tool called no_such_tool' },
    ]);

    // The request: the model, caching, effort, the fallback beta, and tools that stream their input.
    const params = sent[0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.cache_control).toEqual({ type: 'ephemeral' });
    expect(params.output_config).toEqual({ effort: 'medium' });
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.fallbacks).toBe('default');
    expect(params.tools?.[0]).toMatchObject({ name: 'search_notes', eager_input_streaming: true });
    expect(params.tool_choice).toBeUndefined();
  });

  it('makes the last round answer instead of calling more tools', async () => {
    const { send, sent } = fakeApi([{ text: 'Looking. ', tools: [{ id: 'tu', name: 'search_notes', input: { query: 'x' } }] }]);
    const out = await converse(send, 'claude-sonnet-5-5', 'Hi', { tools: [lookup] });
    expect(sent).toHaveLength(8);
    expect(sent[6].tool_choice).toBeUndefined();
    expect(sent[7].tool_choice).toEqual({ type: 'none' });
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('asks the smallest model without the settings it does not take', async () => {
    const { send, sent } = fakeApi([{ text: 'Hello.' }]);
    await converse(send, 'claude-haiku-4-5', 'Hi', { modelTier: 'complex' });
    expect(sent[0].output_config).toBeUndefined();
    expect(sent[0].betas).toBeUndefined();
    expect(sent[0].fallbacks).toBeUndefined();
    expect(sent[0].tools).toBeUndefined();
  });

  it('follows the tier a caller asks for', async () => {
    const { send, sent } = fakeApi([{ text: 'Hello.' }]);
    await converse(send, 'claude-opus-5-5', 'Hi', { modelTier: 'quick' });
    expect(sent[0].output_config).toEqual({ effort: 'low' });
  });

  it('says plainly when Claude declines, writes nothing, or is cut short', async () => {
    await expect(converse(fakeApi([{ stop: 'refusal' }]).send, 'claude-opus-5-5', 'x')).rejects.toMatchObject({ code: 'refused' });
    await expect(converse(fakeApi([{ text: '  ' }]).send, 'claude-opus-5-5', 'x')).rejects.toMatchObject({ code: 'empty_completion' });
    await expect(converse(fakeApi([{ text: 'A long', stop: 'max_tokens' }]).send, 'claude-opus-5-5', 'x')).resolves.toMatchObject({ truncated: true });
  });

  it('tells a failed request by its kind, and keeps what was written before it', async () => {
    const error = (status: number, message: string) =>
      Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message } }, message, new Headers());
    const codeOf = async (e: Error) => ((await converse(fakeApi([e]).send, 'claude-opus-5-5', 'x').catch((x) => x)) as SampleError).code;
    expect(await codeOf(error(401, 'invalid x-api-key'))).toBe('invalid_key');
    expect(await codeOf(error(403, 'forbidden'))).toBe('invalid_key');
    expect(await codeOf(error(404, 'model: not found'))).toBe('model_unavailable');
    expect(await codeOf(error(429, 'slow down'))).toBe('rate_limited');
    expect(await codeOf(error(500, 'oops'))).toBe('upstream_error');
    expect(await codeOf(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe('unreachable');

    const low = await converse(fakeApi([error(400, 'Your credit balance is too low to access the Anthropic API.')]).send, 'claude-opus-5-5', 'x').catch(
      (x) => x as SampleError,
    );
    expect(low).toMatchObject({ code: 'bad_request', message: 'Your credit balance is too low to access the Anthropic API.' });

    const stop = new AbortController();
    const send: Send = async (_params, onText) => {
      onText('Half an ');
      stop.abort();
      throw new Anthropic.APIUserAbortError();
    };
    await expect(converse(send, 'claude-opus-5-5', 'x', { signal: stop.signal })).rejects.toMatchObject({ code: 'cancelled', text: 'Half an ' });
  });

  it('answers in the shape of claude.ai’s own, JSON included', async () => {
    const sample = keySample('sk-ant-test', 'claude-opus-5-5', fakeApi([{ text: 'Here it is:\n```json\n{"learning_note":"It held."}\n```' }]).send);
    await expect(sample.json('x')).resolves.toEqual({ learning_note: 'It held.' });
    await expect(sample('x')).resolves.toMatchObject({ truncated: false });
    await expect(sample.limits()).resolves.toMatchObject({ tools: { maxCount: 64 } });

    const none = keySample('sk-ant-test', 'claude-opus-5-5', fakeApi([{ text: 'No JSON here.' }]).send);
    await expect(none.json('x')).rejects.toMatchObject({ code: 'invalid_json', text: 'No JSON here.' });
  });

  it('reads JSON however it is written, and shows only the ends of a key', () => {
    expect(readJson('{"a":1}')).toEqual({ a: 1 });
    expect(readJson('Sure.\n```\n[1, 2]\n```')).toEqual([1, 2]);
    expect(readJson('The answer: {"a": {"b": 2}} as asked.')).toEqual({ a: { b: 2 } });
    expect(() => readJson('nothing')).toThrow();
    expect(maskedKey('sk-ant-api03-abcdefghijklmnop-WXYZ')).toBe('sk-ant-…WXYZ');
    expect(maskedKey('short')).toBe('…');
  });
});
