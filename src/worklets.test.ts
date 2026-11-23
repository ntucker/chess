import { type NodePath, parseSync, traverse, types as t } from '@babel/core';
import { expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Every non-test source file in src that holds a worklet, with its text. */
function workletSources(): { file: string; text: string }[] {
  return readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.join(__dirname, file))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
    .filter(({ text }) => text.includes("'worklet'"));
}

const isWorklet = (fn: NodePath<t.Function>) =>
  t.isBlockStatement(fn.node.body) &&
  fn.node.body.directives.some((directive) => directive.value.value === 'worklet');

// Jest runs worklets as plain functions. On the UI thread a worklet binds what
// it captured (module constants, imports) in its body, after its parameter
// defaults run, so a default that reads one throws there.
it('no worklet reads a captured value in a parameter default', () => {
  let worklets = 0;
  const early: string[] = [];
  for (const { file, text } of workletSources()) {
    const ast = parseSync(text, {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-typescript'],
    });
    traverse(ast!, {
      Function(fn) {
        if (!isWorklet(fn)) return;
        worklets++;
        for (const param of fn.get('params')) {
          param.traverse({
            ReferencedIdentifier(id) {
              const binding = id.scope.getBinding(id.node.name);
              const inDefault = id.findParent((parent) => parent.isAssignmentPattern());
              if (inDefault && binding && !binding.path.isDescendant(fn)) {
                early.push(`${path.relative(__dirname, file)}: ${id.node.name}`);
              }
            },
          });
        }
      },
    });
  }
  expect(worklets).toBeGreaterThan(0);
  expect(early).toEqual([]);
});
