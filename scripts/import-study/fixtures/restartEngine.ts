// Run by stockfish.test.ts in its own Node process, as the importer runs:
// Jest's module registry would hide what a real restart does.
import { type NodeEngine, startNodeEngine } from '@/stockfish/node';

/** Whether `engine` finishes the UCI handshake within a few seconds. */
const handshakes = (engine: NodeEngine) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 10_000);
    engine.listener = (line) => {
      if (line !== 'uciok') return;
      clearTimeout(timer);
      resolve(true);
    };
    engine.processCommand('uci');
  });

async function main() {
  for (let started = 1; started <= 2; started++) {
    const engine = await startNodeEngine();
    console.log(`engine ${started}: ${(await handshakes(engine)) ? 'ready' : 'silent'}`);
    engine.terminate?.();
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
