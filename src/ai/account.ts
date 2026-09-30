/**
 * Claude on the viewer's own claude.ai account.
 *
 * Inside claude.ai the page can ask Claude directly (the `sample`
 * capability): no key, no proxy, and the viewer's own usage. The first call
 * in a visit asks the viewer to allow it. Each call is independent, so the
 * task's instructions, the input and the exact shape of the answer (the same
 * Zod schema the proxy uses, as JSON Schema) go into the prompt, and the
 * answer is checked against that schema again before anything reads it.
 */
import { z } from 'zod';
import { capability, type SampleError, type SampleOptions } from '../runtime/claude';
import { AnalysisError } from './errors';
import { LANGUAGE_RULE, TASKS, type TaskName, type TaskOutput } from './schemas';
import { getLang, t } from '../i18n';

/** What to tell the person when a call did not go through. */
export function sampleErrorText(code?: string): string {
  switch (code) {
    case 'not_granted':
      return t('This page was not allowed to use Claude, so the Atlas’s own rules are used.');
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return t('Claude is not available for this account here.');
    case 'rate_limited':
      return t('Claude is busy, or your usage limit is reached. Try again later.');
    case 'session_expired':
      return t('Sign in to claude.ai again to use Claude.');
    case 'refused':
      return t('Claude declined this request.');
    case 'prompt_too_large':
      return t('Too much to send at once.');
    case 'invalid_json':
    case 'empty_completion':
      return t('Claude’s answer could not be read. Try again.');
    default:
      return t('Claude could not be reached. Try again.');
  }
}

/** Instructions, the answer's shape and the input, in one prompt. */
export function jsonPrompt(system: string, schema: z.ZodType, input: unknown): string {
  return [
    system + (LANGUAGE_RULE[getLang()] ?? ''),
    'Reply with only one JSON object matching this JSON Schema, and nothing else:',
    JSON.stringify(z.toJSONSchema(schema)),
    'Input:',
    JSON.stringify(input),
  ].join('\n\n');
}

/** Ask Claude for structured data on the viewer's account; the answer is checked against the schema. */
export async function askJson<S extends z.ZodType>(schema: S, prompt: string, options: SampleOptions = {}): Promise<z.infer<S>> {
  const sample = await capability('sample');
  if (!sample) throw { code: 'not_declared', message: 'Claude is not available in this view.' } satisfies SampleError;
  const raw = await sample.json(prompt, options);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw { code: 'invalid_json', message: 'The answer did not match the expected structure.' } satisfies SampleError;
  return parsed.data;
}

/** One analysis task on the viewer's account, as the proxy would run it. */
export async function accountCall<T extends TaskName>(task: T, input: unknown): Promise<TaskOutput<T>> {
  const spec = TASKS[task];
  try {
    return (await askJson(spec.schema, jsonPrompt(spec.system, spec.schema, input), { cache: false })) as TaskOutput<T>;
  } catch (e) {
    throw new AnalysisError(sampleErrorText((e as SampleError)?.code), task);
  }
}
