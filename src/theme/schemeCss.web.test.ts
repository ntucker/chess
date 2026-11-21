import { describe, expect, it } from '@jest/globals';

import { parseSettings } from '@/settings/settings';

import { PRE_PAINT_SCRIPT, SCHEME_CSS } from './schemeCss';
// On the web the hook reads no context, so it can run outside a component.
import { shownThemes, useSchemeColors as webSchemeColors } from './shownTheme';
import { schemeColors, themes } from './theme';

/** Every string in `tree`, by its path. */
function leaves(tree: object, path = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]: [string, unknown]) =>
    typeof value === 'string'
      ? [[`${path}${key}`, value]]
      : leaves(value as object, `${path}${key}.`),
  );
}

/** The declarations of each of SCHEME_CSS's rules, by its selector. */
function rules() {
  const found = new Map<string, Map<string, string>>();
  for (const [, selector, body] of SCHEME_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = body
      .split(';')
      .filter(Boolean)
      .map((d): [string, string] => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]);
    found.set(selector.trim(), new Map(declarations));
  }
  return found;
}

/** Every color the web shows (the theme's and the scheme colors), and its value in each scheme. */
const colors = () => ({
  shown: [...leaves(shownThemes.light.semantic.color), ...leaves(webSchemeColors())],
  light: [...leaves(themes.light.semantic.color), ...leaves(schemeColors.light)],
  dark: [...leaves(themes.dark.semantic.color), ...leaves(schemeColors.dark)],
});

describe('the web\'s themes', () => {
  it('write the same color strings, all CSS variables, in both schemes', () => {
    const light = leaves(shownThemes.light.semantic.color);
    expect(light.length).toBeGreaterThan(50);
    expect(colors().shown.every(([, value]) => /^var\(--[a-z-]+\)$/.test(value))).toBe(true);
    expect(leaves(shownThemes.dark.semantic.color)).toEqual(light);
  });

  it("keep each scheme's other tokens", () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(shownThemes[scheme].colorScheme).toBe(scheme);
      expect(shownThemes[scheme].semantic.shadow).toBe(themes[scheme].semantic.shadow);
    }
  });
});

describe('SCHEME_CSS', () => {
  const found = rules();
  const light = found.get(':root')!;
  const dark = found.get(':root[data-theme=dark]')!;
  const darkDevice = found.get(':root:not([data-theme=light])')!;

  it("gives each color its scheme's value", () => {
    const { shown, light: lightValues, dark: darkValues } = colors();
    shown.forEach(([path, variable], i) => {
      const name = variable.slice('var('.length, -1);
      expect([path, light.get(name)]).toEqual([path, lightValues[i][1]]);
      expect([path, dark.get(name)]).toEqual([path, darkValues[i][1]]);
    });
  });

  it('shows dark when the learner chose Dark, or System on a dark device', () => {
    expect(SCHEME_CSS).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme=light]){');
    expect(darkDevice).toEqual(dark);
    expect(dark.get('color-scheme')).toBe('dark');
    expect(light.get('color-scheme')).toBe('light');
  });
});

describe('PRE_PAINT_SCRIPT', () => {
  /** <html data-theme> after the script runs with `text` saved as the settings. */
  function run(text: string | null, storage: 'works' | 'blocked' = 'works') {
    const dataset: { theme?: string } = {};
    const localStorage = {
      getItem: (key: string) => {
        if (storage === 'blocked') throw new Error('SecurityError');
        return key === 'settings' ? text : null;
      },
    };
    // Runs the script as the page's head does, against stand-ins for the page.
    new Function('localStorage', 'document', PRE_PAINT_SCRIPT)(localStorage, {
      documentElement: { dataset },
    });
    return dataset.theme;
  }

  it('picks the theme settings.ts reads, leaving System to the device', () => {
    const saved = [
      null,
      'x',
      '[]',
      'null',
      '"dark"',
      '{}',
      '{"theme":"blue"}',
      '{"theme":"system"}',
      '{"theme":"light"}',
      '{"theme":"dark","opponent":1900}',
    ];
    for (const text of saved) {
      const theme = parseSettings(text ?? '').theme;
      expect([text, run(text)]).toEqual([text, theme === 'system' ? undefined : theme]);
    }
  });

  it('leaves the device to choose when storage is blocked', () => {
    expect(run('{"theme":"dark"}', 'blocked')).toBeUndefined();
  });
});
