import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SIDE_BY_SIDE_MIN } from '../components/sideBySide';
import {
  CSS_ONLY,
  NARROW_PARTS,
  NARROW_PX,
  NATIVE_PARTS,
  narrowLength,
  narrowStyles,
} from './narrow';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./narrow.css', () => ({}));

// The narrow rules sit inside the media query; the rules before it hide parts on a wide page.
const css = readFileSync(join(__dirname, 'narrow.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const start = css.indexOf('@media (max-width:');
const narrowCss = css.slice(start);
const wideCss = css.slice(0, start);

/** Each part's declarations in `source`, from every rule whose selectors name it alone. */
function declarations(source: string) {
  const byPart = new Map<string, string[]>();
  for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = [...selectors.matchAll(/^\s*:root \[data-narrow='([\w-]+)'\],?\s*$/gm)].map(
      ([, part]) => part,
    );
    const lines = body
      .split(';')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    for (const part of parts) byPart.set(part, [...(byPart.get(part) ?? []), ...lines]);
  }
  return byPart;
}

/** A native style as the CSS declarations it stands for. */
function asCss(style: object = {}) {
  const { flexGrow, flexShrink, flexBasis, ...rest } = style as Record<string, unknown>;
  const value = (v: unknown) => (typeof v === 'number' && v !== 0 ? `${v}px` : String(v));
  const lines = Object.entries(rest).map(
    ([key, v]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value(v)}`,
  );
  if (flexBasis !== undefined) lines.push(`flex: ${flexGrow} ${flexShrink} ${value(flexBasis)}`);
  else if (flexGrow !== undefined) lines.push(`flex-grow: ${flexGrow}`);
  return lines;
}

describe('narrow.css', () => {
  it('starts the media query just below where the board and panel fit side by side', () => {
    expect(css).toContain(`@media (max-width: ${SIDE_BY_SIDE_MIN - 0.02}px) {`);
  });

  it.each(Object.entries(NARROW_PX))('sets --%s to its native pixels, %ipx', (name, px) => {
    expect(narrowCss).toContain(`--${name}: ${px}px;`);
  });

  it('declares no length that native lacks', () => {
    const names = [...narrowCss.matchAll(/--([\w-]+): /g)].map(([, name]) => name);
    expect(names.sort()).toEqual(Object.keys(NARROW_PX).sort());
  });

  const narrowRules = declarations(narrowCss);
  const wideRules = declarations(wideCss);

  it.each(NARROW_PARTS)('lays out the %s as natively', (part) => {
    const native = [...asCss(NATIVE_PARTS[part].narrow), ...(CSS_ONLY[part] ?? [])];
    expect([...(narrowRules.get(part) ?? [])].sort()).toEqual(native.sort());
    expect([...(wideRules.get(part) ?? [])].sort()).toEqual(asCss(NATIVE_PARTS[part].wide).sort());
  });

  it('names each part alone, with no selector reaching inside another part', () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)]
      .flatMap(([, list]) => list.split(','))
      .map((selector) => selector.trim())
      .filter((selector) => selector.includes('data-narrow'));
    for (const selector of selectors) {
      const [, part] = /^:root \[data-narrow='([\w-]+)'\]$/.exec(selector) ?? [];
      expect(NARROW_PARTS).toContain(part);
    }
  });

  it('gives the panel a floor, so the page scrolls rather than squeeze it to nothing', () => {
    expect(narrowRules.get('program')).toContainEqual(
      expect.stringMatching(/^min-height: [1-9]\d*px$/),
    );
  });
});

describe('narrowLength', () => {
  it('works out the wide, the narrow and the CSS from one expression', () => {
    const offset = narrowLength('names-bar-height', 60).plus(4);
    const sum = narrowLength('page-space', 20).times(3).minus(offset);
    expect(sum.wide).toBe(60 - 64);
    expect(sum.narrow).toBe(NARROW_PX['page-space'] * 3 - (NARROW_PX['names-bar-height'] + 4));
    expect(sum.css).toBe('((var(--page-space, 20px) * 3) - (var(--names-bar-height, 60px) + 4px))');
  });
});

describe('narrowStyles', () => {
  // Jest builds the native code (EXPO_OS is inlined at build time).
  it('builds a wide and a narrow sheet off the web, from one builder', () => {
    const styles = narrowStyles((px) => ({
      logo: { width: px(narrowLength('header-height', 40)) },
    }));
    expect(styles.wide.logo.width).toBe(40);
    expect(styles.narrow.logo.width).toBe(NARROW_PX['header-height']);
  });
});
