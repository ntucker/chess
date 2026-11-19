#!/usr/bin/env node
/**
 * Silk isn't published to npm yet, so the app installs it from tarballs in
 * vendor/. This rebuilds them from a Silk checkout (default: ../silk).
 *
 *   yarn vendor:silk [path-to-silk]
 *   yarn install
 *
 * Once @reactive/silk-native is on npm, depend on it there and delete vendor/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const silk = resolve(app, process.argv[2] ?? '../silk');
const run = (args, cwd = silk) => execFileSync('yarn', args, { cwd, stdio: 'inherit' });

run(['workspaces', 'focus', '@reactive/silk-core', '@reactive/silk-native']);
for (const name of ['silk-core', 'silk-native']) {
  run(['workspace', `@reactive/${name}`, 'build']);
}
mkdirSync(resolve(app, 'vendor'), { recursive: true });
for (const name of ['silk-core', 'silk-native']) {
  run(['pack', '-o', resolve(app, `vendor/reactive-${name}.tgz`)], resolve(silk, 'packages', name));
}
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: silk })
  .toString()
  .trim();
console.log(`\nVendored Silk at ${commit}. Run \`yarn install\` to pick it up.`);
