import { type NodePath, parseSync, traverse, types as t } from '@babel/core';
import { describe, expect, it } from '@jest/globals';
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

const hasWorkletDirective = (block: t.BlockStatement | t.Program) =>
  block.directives.some((directive) => directive.value.value === 'worklet');

/** A function the worklets plugin ships to the UI thread: marked itself, or in a file marked so. */
const isWorklet = (fn: NodePath<t.Function>, program: t.Program) =>
  hasWorkletDirective(program) ||
  (t.isBlockStatement(fn.node.body) && hasWorkletDirective(fn.node.body));

/**
 * The file's worklets, and the names their parameter defaults read from
 * outside them (imports, module constants). Jest runs worklets as plain
 * functions, but on the UI thread a worklet binds what it captured in its
 * body, after its parameter defaults run, so such a default throws there.
 */
function checkWorklets(file: string, text: string) {
  let worklets = 0;
  const readEarly: string[] = [];
  const ast = parseSync(text, {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: ['@babel/preset-typescript'],
  })!;
  traverse(ast, {
    Function(fn) {
      if (!isWorklet(fn, ast.program)) return;
      worklets++;
      for (const param of fn.get('params')) {
        param.traverse({
          ReferencedIdentifier(id) {
            const binding = id.scope.getBinding(id.node.name);
            const inDefault = id.findParent((parent) => parent.isAssignmentPattern());
            if (inDefault && binding && !binding.path.isDescendant(fn)) {
              readEarly.push(id.node.name);
            }
          },
        });
      }
    },
  });
  return { worklets, readEarly };
}

describe('worklet parameter defaults', () => {
  it('read nothing a worklet captured, in every worklet in src', () => {
    let worklets = 0;
    const readEarly: string[] = [];
    for (const { file, text } of workletSources()) {
      const found = checkWorklets(file, text);
      worklets += found.worklets;
      readEarly.push(
        ...found.readEarly.map((name) => `${path.relative(__dirname, file)}: ${name}`),
      );
    }
    expect(worklets).toBeGreaterThan(0);
    expect(readEarly).toEqual([]);
  });

  it('are checked in a worklet marked itself', () => {
    const text = `const SUB = 1;
      export function f(a: number, { p = SUB, q = a } = {}) {
        'worklet';
        return a + p + q + Math.max(a, p);
      }`;
    expect(checkWorklets('f.ts', text)).toEqual({ worklets: 1, readEarly: ['SUB'] });
  });

  it('are checked in every function of a file marked as worklets', () => {
    const text = `'worklet';
      import { SUB } from './spring';
      export const f = (a: number, p = SUB) => a + p;`;
    expect(checkWorklets('f.ts', text)).toEqual({ worklets: 1, readEarly: ['SUB'] });
  });

  it('leave functions that are not worklets alone', () => {
    const text = `const SUB = 1;
      export function f(a: number, p = SUB) {
        return a + p;
      }`;
    expect(checkWorklets('f.ts', text)).toEqual({ worklets: 0, readEarly: [] });
  });
});
