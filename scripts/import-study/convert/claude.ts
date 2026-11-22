/**
 * Asks Claude through the Claude Code CLI (`claude -p`), so a conversion runs
 * on the account Claude Code is signed in to (or CLAUDE_CODE_OAUTH_TOKEN in
 * CI) and needs no API key. Each answer is kept by its comment, model and
 * prompt in the study's committed answers file, so a stopped run resumes, a
 * rerun anywhere asks nothing, and only comments whose text or position
 * changed are asked again.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { Color } from 'chessops/types';
import { opposite } from 'chessops/util';

import { colorName } from '@/game/replay';
import type { AiModel } from '@/lesson/lesson';

import { answersFile } from '../jsonLines';

import { asAnswer, SCHEMA, type Answer } from './answer';
import type { Comment } from './comments';
import { PROMPT } from './prompt';

/**
 * The models the AI steps use: Sonnet converts, Opus retries what the checker
 * refused, and Fable writes the idea of a book move no guide explains (../explain).
 */
export const MODELS = {
  convert: 'claude-sonnet-5-5',
  retry: 'claude-opus-5-5',
  explain: 'claude-fable-5-2',
} as const satisfies Record<string, AiModel>;

/**
 * Answers for `items` (comments, unless the CLI was made for others) by id; an
 * item left out could not be answered this time. `addendum` goes after the
 * prompt, for a retry that needs more instructions (`REWORD`); without one,
 * the cache keys are the same as before addenda existed, so stored answers
 * still match.
 */
export type Ask<T = Comment> = (
  model: AiModel,
  items: readonly T[],
  addendum?: string,
) => Promise<Map<string, Answer>>;

/** Comments per request by default: enough to share the prompt, few enough to answer carefully. */
const BATCH = 20;
/** Requests at once. */
const PARALLEL = 4;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface Options<T> {
  readonly learner: Color;
  /** The system prompt, with {LEARNER} and {OPPONENT} for the sides; the comment converter's by default. */
  readonly prompt?: string;
  /**
   * What an answer is stored by, besides the model and the prompt: the whole
   * item by default, so an answer is asked again when anything in it changes.
   */
  readonly keyOf?: (item: T) => unknown;
  /** How hard the model thinks (`claude --effort`); the CLI's default when absent. */
  readonly effort?: Effort;
  /** Items per request. */
  readonly batch?: number;
  /** The step's name in log lines. */
  readonly step?: string;
  /** The study's answers file (JSON lines), committed beside the importer. */
  readonly cacheFile: string;
  /** False answers only from the file and calls no model: other items stay unanswered. */
  readonly callModel?: boolean;
  readonly log?: (message: string) => void;
}

export interface ClaudeCli<T> {
  readonly ask: Ask<T>;
  /** Rewrites the answers file with only the answers this run used, so stale ones don't pile up. */
  readonly saveUsed: () => void;
}

export function claudeCli<T extends { readonly id: string } = Comment>({
  learner,
  prompt: template = PROMPT,
  keyOf: itemKey = (item) => item,
  effort,
  batch = BATCH,
  step = 'convert',
  cacheFile,
  callModel = true,
  log = console.log,
}: Options<T>): ClaudeCli<T> {
  const prompt = template
    .replaceAll('{LEARNER}', colorName(learner))
    .replaceAll('{OPPONENT}', colorName(opposite(learner)));
  const cache = answersFile<{ key: string; answer: Answer }>(
    cacheFile,
    (row) => row.key,
    (row) => asAnswer(row.answer) !== undefined,
  );
  const keyOf = (model: AiModel, system: string, item: T) =>
    createHash('sha256')
      .update(JSON.stringify([model, system, itemKey(item)]))
      .digest('hex');

  const ask: Ask<T> = async (model, items, addendum = '') => {
    const system = prompt + addendum;
    const answers = new Map<string, Answer>();
    const keys = new Map(items.map((item) => [item.id, keyOf(model, system, item)]));
    const asking: T[] = [];
    for (const item of items) {
      const key = keys.get(item.id)!;
      const cached = cache.get(key)?.answer;
      if (cached) {
        answers.set(item.id, { ...cached, id: item.id });
      } else asking.push(item);
    }
    if (!callModel) {
      log(
        `${step}: ${answers.size} answered from ${cacheFile}; ${asking.length} missing there, which stay as the importer left them`,
      );
      return answers;
    }
    const batches = chunks(asking, batch);
    log(
      `${step}: ${answers.size} cached, asking ${model} about ${asking.length} in ${batches.length} requests`,
    );
    let done = 0;
    let cost = 0;
    await pool(batches, PARALLEL, async (group) => {
      try {
        const result = await request(model, system, group, effort);
        cost += result.cost;
        const asked = new Set(group.map((item) => item.id));
        for (const answer of result.answers) {
          if (!asked.has(answer.id)) continue;
          const key = keys.get(answer.id)!;
          answers.set(answer.id, answer);
          cache.add({ key, answer });
        }
      } catch (error) {
        log(
          `${step}: a request failed, its ${group.length} items stay unanswered: ${String(error)}`,
        );
      }
      log(`${step}: ${++done}/${batches.length} requests, ${cost.toFixed(2)} USD at list price`);
    });
    return answers;
  };

  return { ask, saveUsed: cache.saveUsed };
}

/** One `claude -p` run: the prompt as the system prompt, the items as the message, no tools. */
async function request(
  model: AiModel,
  prompt: string,
  items: readonly unknown[],
  effort: Effort | undefined,
): Promise<{ answers: Answer[]; cost: number }> {
  const { output, cost } = await claudeJson(model, prompt, JSON.stringify(items), SCHEMA, effort);
  const { comments: answers } = (output ?? {}) as { comments?: unknown[] };
  return { answers: (answers ?? []).flatMap((answer) => asAnswer(answer) ?? []), cost };
}

/**
 * One `claude -p` run with no tools: `system` as the system prompt and `message`
 * as the message. Resolves to the answer that `schema` (a JSON schema) shapes,
 * and what the run cost at list price.
 */
export function claudeJson(
  model: AiModel,
  system: string,
  message: string,
  schema: object,
  effort?: Effort,
): Promise<{ output: unknown; cost: number }> {
  const args = [
    '-p',
    '--model',
    model,
    ...(effort ? ['--effort', effort] : []),
    '--system-prompt',
    system,
    '--json-schema',
    JSON.stringify(schema),
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
    const child = spawn(process.env.CLAUDE_BIN ?? 'claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
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
        if (code !== 0 || result.is_error)
          throw new Error(`claude exited ${code}: ${result.result ?? err}`);
        resolve({ output: result.structured_output, cost: result.total_cost_usd ?? 0 });
      } catch (error) {
        reject(
          error instanceof SyntaxError ? new Error(`claude exited ${code}: ${err || out}`) : error,
        );
      }
    });
    child.stdin.end(message);
  });
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `work` on every item, at most `limit` at once. */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
