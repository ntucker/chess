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

import { appendJsonLine, readJsonLines, writeJsonLines } from '../jsonLines';

import { asAnswer, SCHEMA, type Answer } from './answer';
import type { Comment } from './comments';
import { PROMPT } from './prompt';

/** The models a conversion uses: Sonnet converts, Opus retries what the checker refused. */
export const MODELS = { convert: 'claude-sonnet-5-5', retry: 'claude-opus-5-5' } as const;
export type Model = (typeof MODELS)[keyof typeof MODELS];

/**
 * Answers for `comments` by comment id; a comment left out could not be
 * converted this time. `addendum` goes after the prompt, for a retry that
 * needs more instructions (`REWORD`); without one, the cache keys are the same
 * as before addenda existed, so stored answers still match.
 */
export type Ask = (
  model: Model,
  comments: readonly Comment[],
  addendum?: string,
) => Promise<Map<string, Answer>>;

/** Comments per request: enough to share the prompt, few enough to answer carefully. */
const BATCH = 20;
/** Requests at once. */
const PARALLEL = 4;

interface Options {
  readonly learner: Color;
  /** The study's answers file (JSON lines), committed beside the importer. */
  readonly cacheFile: string;
  /** False answers only from the file and calls no model: other comments stay unconverted. */
  readonly callModel?: boolean;
  readonly log?: (message: string) => void;
}

export interface ClaudeCli {
  readonly ask: Ask;
  /**
   * Rewrites the answers file with only the answers this run used, so stale
   * ones don't pile up. Does nothing without the model: a run that could not
   * replace a stale answer must not drop it.
   */
  readonly saveUsed: () => void;
}

export function claudeCli({
  learner,
  cacheFile,
  callModel = true,
  log = console.log,
}: Options): ClaudeCli {
  const prompt = PROMPT.replaceAll('{LEARNER}', colorName(learner)).replaceAll(
    '{OPPONENT}',
    colorName(opposite(learner)),
  );
  const cache = readCache(cacheFile);
  const keyOf = (model: Model, system: string, comment: Comment) =>
    createHash('sha256')
      .update(JSON.stringify([model, system, comment]))
      .digest('hex');

  const used = new Set<string>();

  const ask: Ask = async (model, comments, addendum = '') => {
    const system = prompt + addendum;
    const answers = new Map<string, Answer>();
    const keys = new Map(comments.map((comment) => [comment.id, keyOf(model, system, comment)]));
    const asking: Comment[] = [];
    for (const comment of comments) {
      const key = keys.get(comment.id)!;
      const cached = cache.get(key);
      if (cached) {
        used.add(key);
        answers.set(comment.id, { ...cached, id: comment.id });
      } else asking.push(comment);
    }
    if (!callModel) {
      log(
        `convert: ${answers.size} answered from ${cacheFile}; ${asking.length} missing there, which keep the importer's notes`,
      );
      return answers;
    }
    const batches = chunks(asking, BATCH);
    log(
      `convert: ${answers.size} cached, asking ${model} about ${asking.length} in ${batches.length} requests`,
    );
    let done = 0;
    let cost = 0;
    await pool(batches, PARALLEL, async (group) => {
      try {
        const result = await request(model, system, group);
        cost += result.cost;
        const asked = new Set(group.map((comment) => comment.id));
        for (const answer of result.answers) {
          if (!asked.has(answer.id)) continue;
          const key = keys.get(answer.id)!;
          used.add(key);
          answers.set(answer.id, answer);
          cache.set(key, answer);
          appendJsonLine(cacheFile, { key, answer });
        }
      } catch (error) {
        log(
          `convert: a request failed, its ${group.length} comments stay unconverted: ${String(error)}`,
        );
      }
      log(`convert: ${++done}/${batches.length} requests, ${cost.toFixed(2)} USD at list price`);
    });
    return answers;
  };

  const saveUsed = () => {
    if (!callModel) return;
    writeJsonLines(
      cacheFile,
      [...used].sort().map((key) => ({ key, answer: cache.get(key) })),
    );
  };

  return { ask, saveUsed };
}

function readCache(file: string): Map<string, Answer> {
  const cache = new Map<string, Answer>();
  for (const line of readJsonLines(file)) {
    const { key, answer } = line as { key: string; answer: unknown };
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
        const { comments: answers } = (result.structured_output ?? {}) as { comments?: unknown[] };
        resolve({
          answers: (answers ?? []).flatMap((answer) => asAnswer(answer) ?? []),
          cost: result.total_cost_usd ?? 0,
        });
      } catch (error) {
        reject(
          error instanceof SyntaxError ? new Error(`claude exited ${code}: ${err || out}`) : error,
        );
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
