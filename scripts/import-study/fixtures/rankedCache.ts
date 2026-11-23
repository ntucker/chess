// Run by stockfish.test.ts in its own Node process, as the importer runs the engine.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { positionKey } from '@/game/replay';

import { nodeStockfish } from '../stockfish';

async function main() {
  const file = join(mkdtempSync(join(tmpdir(), 'ranked-')), 'stockfish.jsonl');
  const search = { ranks: 3, nodes: 20_000 };
  const pos = Chess.default();
  pos.play(parseUci('e2e4')!);
  const key = positionKey(pos);
  const first = await nodeStockfish(file, search);
  const searched = await first.evaluate(['e2e4'], key);
  first.stop();
  const again = await nodeStockfish(file, search);
  const cached = await again.evaluate(['e2e4'], key);
  again.stop();
  console.log(`rows: ${readFileSync(file, 'utf8').trim().split('\n').length}`);
  console.log(`lines: ${cached.lines.length}`);
  console.log(`same: ${JSON.stringify(cached.lines) === JSON.stringify(searched.lines)}`);
  console.log(`final: ${cached.final}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
