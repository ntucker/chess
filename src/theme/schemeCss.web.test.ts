import { describe, expect, it } from '@jest/globals';

import { parseSettings } from '@/settings/settings';

import { SCHEME_VALUES, schemeVariable } from './schemeColors';
import { cssThemes, PRE_PAINT_SCRIPT, SCHEME_CSS } from './schemeCss';
import { themes } from './theme';

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

describe('cssThemes', () => {
  it('writes the same color strings, all CSS variables, in both schemes', () => {
    const light = leaves(cssThemes.light.semantic.color);
    expect(light.length).toBeGreaterThan(50);
    expect(light.every(([, value]) => /^var\(--silk-color-[a-z-]+\)$/.test(value))).toBe(true);
    expect(leaves(cssThemes.dark.semantic.color)).toEqual(light);
  });

  it("keeps each scheme's other tokens", () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(cssThemes[scheme].colorScheme).toBe(scheme);
      expect(cssThemes[scheme].semantic.shadow).toBe(themes[scheme].semantic.shadow);
    }
  });
});

describe('SCHEME_CSS', () => {
  const found = rules();
  const light = found.get(':root')!;
  const dark = found.get(':root[data-theme=dark]')!;
  const darkDevice = found.get(':root:not([data-theme=light])')!;

  it("gives each theme color its scheme's value", () => {
    const values = {
      light: leaves(themes.light.semantic.color),
      dark: leaves(themes.dark.semantic.color),
    };
    leaves(cssThemes.light.semantic.color).forEach(([path, variable], i) => {
      const name = variable.slice('var('.length, -1);
      expect([path, light.get(name)]).toEqual([path, values.light[i][1]]);
      expect([path, dark.get(name)]).toEqual([path, values.dark[i][1]]);
    });
  });

  it("gives each scheme color its scheme's value", () => {
    for (const [name, value] of Object.entries(SCHEME_VALUES.dark)) {
      const variable = schemeVariable(name as keyof typeof SCHEME_VALUES.dark);
      expect(dark.get(variable)).toBe(value);
      expect(light.get(variable)).toBe(
        SCHEME_VALUES.light[name as keyof typeof SCHEME_VALUES.light],
      );
    }
  });

  it('shows dark when the learner chose Dark, or System on a dark device', () => {
    expect(SCHEME_CSS).toContain(
      '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){',
    );
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
