import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractChapter } from '../extract';
import { STUDY_PGN } from '../fixture';
import { parseStudy } from '../study';
import { claudeCli, MODELS } from './claude';
import { noteComment, type Comment } from './comments';

const [advance] = parseStudy(STUDY_PGN, () => true);
const chapter = extractChapter(advance, 'black');
const comments = chapter.moveNotes.flatMap((moveNote) => noteComment(moveNote, chapter) ?? []).slice(0, 2);

/** A stand-in for the `claude` CLI that answers every comment it reads on stdin with one note. */
const FAKE_CLAUDE = `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (data) => (input += data));
process.stdin.on('end', () => {
  const comments = JSON.parse(input).map(({ id }) => ({ id, notes: [{ about: 'move', text: 'A note.', ideas: [] }] }));
  console.log(JSON.stringify({ structured_output: { comments }, total_cost_usd: 0.01 }));
});
`;

describe('claudeCli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-cli-'));
  const cacheFile = join(dir, 'answers.jsonl');
  const log = () => {};
  const lines = () => readFileSync(cacheFile, 'utf8').split('\n').filter(Boolean);
  const ids = (answers: Map<string, unknown>) => [...answers.keys()];
  const previousBin = process.env.CLAUDE_BIN;

  beforeAll(() => {
    process.env.CLAUDE_BIN = join(dir, 'claude');
    writeFileSync(process.env.CLAUDE_BIN, FAKE_CLAUDE);
    chmodSync(process.env.CLAUDE_BIN, 0o755);
  });
  afterAll(() => {
    process.env.CLAUDE_BIN = previousBin;
  });

  it('asks the CLI about comments it has no answer for, and keeps each answer in the file', async () => {
    const answers = await claudeCli({ learner: 'black', cacheFile, log }).ask(MODELS.convert, comments);
    expect(ids(answers)).toEqual(comments.map((comment: Comment) => comment.id));
    expect(lines()).toHaveLength(2);
  });

  it('answers from the file alone without calling a model, and keeps only the answers a run used', async () => {
    const cli = claudeCli({ learner: 'black', cacheFile, log, callModel: false });
    expect(ids(await cli.ask(MODELS.convert, [comments[0]]))).toEqual([comments[0].id]);
    expect(ids(await cli.ask(MODELS.retry, [comments[1]]))).toEqual([]);
    cli.saveUsed();
    expect(lines()).toHaveLength(1);
  });
});
