import { transformSync } from '@babel/core';
import { expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Every source file in src that holds a worklet. */
function workletSources(): string[] {
  return readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.join(__dirname, file))
    .filter((file) => readFileSync(file, 'utf8').includes("'worklet'"));
}

/**
 * A worklet as the worklets Babel plugin ships it to the UI thread: its
 * parameters, then the names it captured, bound at the top of its body
 * (an array or an object pattern, by plugin version).
 */
const SHIPPED_WORKLET = /code: "\(function \w+\((.*?)\)\{const[[{]([^\]}]*)[\]}]=this\.__closure;/g;

// Jest runs worklets as plain functions, so this checks what the worklets
// Babel plugin makes of them, as the Android build does.
it('no worklet reads a captured value in a parameter default', () => {
  const files = workletSources();
  expect(files.length).toBeGreaterThan(0);
  let checked = 0;
  for (const file of files) {
    const { code } = transformSync(readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: [
        ['@babel/preset-typescript', { isTSX: file.endsWith('.tsx'), allExtensions: true }],
      ],
      plugins: ['react-native-worklets/plugin'],
    })!;
    // On the UI thread a worklet binds what it captured in its body, after its defaults run.
    for (const [, params, captured] of code!.matchAll(SHIPPED_WORKLET)) {
      checked++;
      const early = captured!
        .split(',')
        .filter((name) => new RegExp(`=[^,{}]*\\b${name.replaceAll('$', '\\$')}\\b`).test(params!));
      expect({ file, early }).toEqual({ file, early: [] });
    }
  }
  // A plugin update that changes its output would otherwise pass this silently.
  expect(checked).toBeGreaterThan(0);
});
