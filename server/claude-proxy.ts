/**
 * Minimal analysis proxy for Cognitive Atlas.
 *
 *   ANTHROPIC_API_KEY=... npm run proxy
 *
 * Keeps the API key on the server. Each task has a Zod schema (shared with the
 * browser in src/ai/schemas.ts) that is sent as the structured output format,
 * so responses are guaranteed to parse. In development, Vite forwards
 * /api/analysis to this server (see vite.config.ts).
 */
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { TASKS, type TaskName } from '../src/ai/schemas.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.ATLAS_MODEL ?? 'claude-opus-5';
const PREFIX = '/api/analysis';
const MAX_BODY = 512 * 1024;

const client = new Anthropic();

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': process.env.ALLOW_ORIGIN ?? 'http://localhost:5173',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// The interface language the text fields should be written in (ids and quotes stay as they are).
const LANGUAGE_RULE: Record<string, string> = {
  id: '\nWrite every free-text field in Indonesian (Bahasa Indonesia). Quotes from the records stay exactly as written.',
};

async function runTask(task: TaskName, input: unknown, language?: string) {
  const spec = TASKS[task];
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Route safety-classifier declines to Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(spec.schema) },
    system: spec.system + (LANGUAGE_RULE[language ?? ''] ?? ''),
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });
  if (message.stop_reason === 'refusal') throw new Error('The model declined this request.');
  if (!message.parsed_output) throw new Error(`No structured output (stop reason: ${message.stop_reason}).`);
  return message.parsed_output;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(PREFIX)) return send(res, 404, { error: 'Not found' });
  const task = url.pathname.slice(PREFIX.length + 1);

  if (req.method === 'GET' && task === 'health') return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== 'POST' || !(task in TASKS)) return send(res, 404, { error: `Unknown task "${task}"` });

  try {
    const body = (await readJson(req)) as { input?: unknown; language?: string };
    const output = await runTask(task as TaskName, body.input ?? {}, body.language);
    send(res, 200, { output });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited. Try again shortly.' });
    if (error instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'Invalid or missing ANTHROPIC_API_KEY.' });
    if (error instanceof Anthropic.APIError) return send(res, 502, { error: error.message });
    send(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, () => {
  console.log(`Cognitive Atlas analysis proxy on http://localhost:${PORT}${PREFIX} (model: ${MODEL})`);
});
