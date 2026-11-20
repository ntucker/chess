import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractChapter } from '../extract';
import { STUDY_PGN } from '../fixture';
import { parseStudy } from '../study';
import { claudeCli, MODELS } from './claude';
import { noteComment, type Comment } from './comments';
import { REWORD } from './prompt';

const [advance] = parseStudy(STUDY_PGN, () => true);
const chapter = extractChapter(advance, 'black');
const comments = chapter.moveNotes
  .flatMap((moveNote) => noteComment(moveNote, chapter) ?? [])
  .slice(0, 2);

/**
 * A stand-in for the `claude` CLI that answers every comment it reads on stdin
 * with one note, which says whether the system prompt asked for a rewording.
 */
const FAKE_CLAUDE = `#!/usr/bin/env node
const prompt = process.argv[process.argv.indexOf('--system-prompt') + 1];
const text = prompt.includes('refusedText') ? 'Reworded.' : 'A note.';
let input = '';
process.stdin.on('data', (data) => (input += data));
process.stdin.on('end', () => {
  const comments = JSON.parse(input).map(({ id }) => ({ id, notes: [{ about: 'move', text, ideas: [] }] }));
  console.log(JSON.stringify({ structured_output: { comments }, total_cost_usd: 0.01 }));
});
`;

describe('claudeCli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-cli-'));
  const log = () => {};
  const ids = (answers: Map<string, unknown>) => [...answers.keys()];
  const previousBin = process.env.CLAUDE_BIN;
  let files = 0;
  /** A new answers file, with an answer for each of `seeded` asked of the stand-in CLI. */
  const answersFile = async (seeded: readonly Comment[] = []) => {
    const cacheFile = join(dir, `answers-${files++}.jsonl`);
    if (seeded.length > 0)
      await claudeCli({ learner: 'black', cacheFile, log }).ask(MODELS.convert, seeded);
    return cacheFile;
  };
  const lines = (file: string) => readFileSync(file, 'utf8').split('\n').filter(Boolean);

  beforeAll(() => {
    process.env.CLAUDE_BIN = join(dir, 'claude');
    writeFileSync(process.env.CLAUDE_BIN, FAKE_CLAUDE);
    chmodSync(process.env.CLAUDE_BIN, 0o755);
  });
  afterAll(() => {
    if (previousBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = previousBin;
    rmSync(dir, { recursive: true, force: true });
  });

  it('asks the CLI about comments it has no answer for, and keeps each answer in the file', async () => {
    const cacheFile = await answersFile();
    const answers = await claudeCli({ learner: 'black', cacheFile, log }).ask(
      MODELS.convert,
      comments,
    );
    expect(ids(answers)).toEqual(comments.map((comment) => comment.id));
    expect(lines(cacheFile)).toHaveLength(2);
  });

  it('keeps only the answers a run used', async () => {
    const cacheFile = await answersFile(comments);
    const cli = claudeCli({ learner: 'black', cacheFile, log });
    await cli.ask(MODELS.convert, [comments[0]]);
    cli.saveUsed();
    expect(lines(cacheFile)).toHaveLength(1);
  });

  it('sends an addendum after the prompt, and keeps those answers apart', async () => {
    const cacheFile = await answersFile([comments[0]]);
    // The same comment, asked again with the text the checker refused.
    const reword = { ...comments[0], refusedText: ['Play e6 Nf3 c5 Be2 next.'] };
    const text = async (cli: ReturnType<typeof claudeCli>, comment: Comment, addendum?: string) =>
      (await cli.ask(MODELS.retry, [comment], addendum)).get(comment.id)?.notes[0].text;
    const cli = claudeCli({ learner: 'black', cacheFile, log });
    expect(await text(cli, reword, REWORD)).toBe('Reworded.');
    expect(await text(cli, comments[0])).toBe('A note.');
    cli.saveUsed();
    const fromFile = claudeCli({ learner: 'black', cacheFile, log, callModel: false });
    expect(await text(fromFile, reword, REWORD)).toBe('Reworded.');
    expect(await text(fromFile, comments[0])).toBe('A note.');
  });

  it('answers from the file alone without the model, and drops nothing', async () => {
    const cacheFile = await answersFile([comments[0], comments[1]]);
    const bin = process.env.CLAUDE_BIN;
    process.env.CLAUDE_BIN = join(dir, 'missing');
    try {
      const cli = claudeCli({ learner: 'black', cacheFile, log, callModel: false });
      expect(ids(await cli.ask(MODELS.convert, [comments[0]]))).toEqual([comments[0].id]);
      expect(ids(await cli.ask(MODELS.retry, [comments[1]]))).toEqual([]);
      cli.saveUsed();
      expect(lines(cacheFile)).toHaveLength(2);
    } finally {
      process.env.CLAUDE_BIN = bin;
    }
  });
});
