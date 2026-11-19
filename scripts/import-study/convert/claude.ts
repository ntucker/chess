/**
 * Asks Claude through the Claude Code CLI (`claude -p`), so a conversion runs
 * on the account Claude Code is signed in to (or CLAUDE_CODE_OAUTH_TOKEN in
 * CI) and needs no API key. Each answer is cached by its comment, model and
 * prompt in a JSON-lines file, so a stopped run resumes, a rerun asks
 * nothing, and only comments whose text or position changed are asked again.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import type { Color } from 'chessops/types';
import { opposite } from 'chessops/util';

import { asAnswer, SCHEMA, type Answer } from './answer';
import type { Comment } from './comments';
import { PROMPT } from './prompt';

/** The models a conversion uses: Sonnet converts, Opus retries what Sonnet got wrong. */
export const MODELS = { convert: 'claude-sonnet-5-5', retry: 'claude-opus-5-5' } as const;
export type Model = (typeof MODELS)[keyof typeof MODELS];

/** Answers for `comments` by comment id; a comment left out could not be converted this time. */
export type Ask = (model: Model, comments: readonly Comment[]) => Promise<Map<string, Answer>>;

interface Options {
  readonly learner: Color;
  readonly cacheFile: string;
  /** Comments per request: enough to share the prompt, few enough to answer carefully. */
  readonly batch?: number;
  /** Requests at once. */
  readonly parallel?: number;
  readonly log?: (message: string) => void;
}

export function claudeCli({ learner, cacheFile, batch = 20, parallel = 4, log = console.log }: Options): Ask {
  const prompt = PROMPT.replaceAll('{LEARNER}', title(learner)).replaceAll('{OPPONENT}', title(opposite(learner)));
  const cache = readCache(cacheFile);
  const keyOf = (model: Model, comment: Comment) =>
    createHash('sha256').update(JSON.stringify([model, prompt, comment])).digest('hex');

  return async (model, comments) => {
    const answers = new Map<string, Answer>();
    const asking: Comment[] = [];
    for (const comment of comments) {
      const cached = cache.get(keyOf(model, comment));
      if (cached) answers.set(comment.id, { ...cached, id: comment.id });
      else asking.push(comment);
    }
    const batches = chunks(asking, batch);
    log(`convert: ${answers.size} cached, asking ${model} about ${asking.length} in ${batches.length} requests`);
    let done = 0;
    let cost = 0;
    await pool(batches, parallel, async (group) => {
      try {
        const byId = new Map(group.map((comment) => [comment.id, comment]));
        const result = await request(model, prompt, group);
        cost += result.cost;
        for (const answer of result.answers) {
          const comment = byId.get(answer.id);
          if (!comment) continue;
          answers.set(answer.id, answer);
          cache.set(keyOf(model, comment), answer);
          appendFileSync(cacheFile, `${JSON.stringify({ key: keyOf(model, comment), answer })}\n`);
        }
      } catch (error) {
        log(`convert: a request failed, its ${group.length} comments stay unconverted: ${String(error)}`);
      }
      log(`convert: ${++done}/${batches.length} requests, ${cost.toFixed(2)} USD at list price`);
    });
    return answers;
  };
}

const title = (color: Color) => (color === 'white' ? 'White' : 'Black');

function readCache(file: string): Map<string, Answer> {
  const cache = new Map<string, Answer>();
  if (!existsSync(file)) return cache;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const { key, answer } = JSON.parse(line) as { key: string; answer: unknown };
    const valid = asAnswer(answer);
    if (valid) cache.set(key, valid);
  }
  return cache;
}

/** One `claude -p` run: the prompt as the system prompt, the comments as the message, no tools. */
function request(
  model: Model,
  prompt: string,
  comments: readonly Comment[],
): Promise<{ answers: Answer[]; cost: number }> {
  const args = [
    '-p',
    '--model',
    model,
    '--system-prompt',
    prompt,
    '--json-schema',
    JSON.stringify(SCHEMA),
    '--output-format',
    'json',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? 'claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill(), 20 * 60_000);
    let out = '';
    let err = '';
    child.stdout.on('data', (data: Buffer) => (out += data));
    child.stderr.on('data', (data: Buffer) => (err += data));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out) as {
          is_error?: boolean;
          result?: string;
          structured_output?: unknown;
          total_cost_usd?: number;
        };
        if (code !== 0 || result.is_error) throw new Error(`claude exited ${code}: ${result.result ?? err}`);
        const { comments: answers } = (result.structured_output ?? {}) as { comments?: unknown[] };
        resolve({
          answers: (answers ?? []).flatMap((answer) => asAnswer(answer) ?? []),
          cost: result.total_cost_usd ?? 0,
        });
      } catch (error) {
        reject(error instanceof SyntaxError ? new Error(`claude exited ${code}: ${err || out}`) : error);
      }
    });
    child.stdin.end(JSON.stringify(comments));
  });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `work` on every item, at most `limit` at once. */
async function pool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
