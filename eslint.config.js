// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const PRESSABLE = {
  name: 'react-native',
  importNames: [
    'Pressable',
    'TouchableOpacity',
    'TouchableHighlight',
    'TouchableWithoutFeedback',
    'TouchableNativeFeedback',
  ],
  message: "Use Pressable from '@reactive/silk-native', which shows the keyboard focus ring.",
};

// The web pre-renders pages with no window, so layout comes from flexbox and
// narrow.css; only src/theme/Narrow.tsx reads the window's size.
const WINDOW_SIZE_MESSAGE =
  'Lay out with flexbox, or a narrow length or part (src/theme/narrow.ts); only src/theme/Narrow.tsx reads the window size.';
const WINDOW_SIZE = [
  {
    name: 'react-native',
    importNames: ['useWindowDimensions'],
    message: `${WINDOW_SIZE_MESSAGE} For the text scale, PixelRatio.getFontScale().`,
  },
  {
    name: 'react-native-safe-area-context',
    importNames: ['useSafeAreaFrame'],
    message: WINDOW_SIZE_MESSAGE,
  },
];
const WIDTH_QUERY = {
  selector:
    "CallExpression[callee.name='matchMedia'] > :matches(Literal[value=/width/], TemplateLiteral:has(TemplateElement[value.raw=/width/]))",
  message: WINDOW_SIZE_MESSAGE,
};

// Only a screen picks its panel's layout, so one place answers phone or wide.
const LAYOUT = {
  name: '@/theme/Narrow',
  importNames: ['useLayout'],
  message:
    'Only a screen picks a layout (LessonScreen.tsx, ReviewPage.tsx): pass a block its density instead.',
};

/** The screens that pick their panel's layout (`LAYOUT`). */
const SCREENS = ['src/components/lesson/LessonScreen.tsx', 'src/components/review/ReviewPage.tsx'];

const TESTS = 'src/**/*.test.{ts,tsx}';

/**
 * The imports a file may not use: Pressable's stand-ins everywhere, and
 * `paths` and `patterns` too. A later block's options replace an earlier
 * block's, so every block lists them all through this.
 */
const restrictImports = (paths = [], patterns = []) => [
  'error',
  { paths: [PRESSABLE, ...paths], ...(patterns.length && { patterns }) },
];

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'vendor/*'] },
  { rules: { 'no-restricted-imports': restrictImports() } },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [TESTS, 'src/theme/Narrow.tsx', ...SCREENS],
    rules: {
      'no-restricted-imports': restrictImports([LAYOUT, ...WINDOW_SIZE]),
    },
  },
  {
    files: SCREENS,
    rules: { 'no-restricted-imports': restrictImports(WINDOW_SIZE) },
  },
  {
    // A layout places the blocks its screen's model fills: what they show is
    // worked out in the model (useLessonScreen.ts), never here.
    files: ['src/components/lesson/layouts/**'],
    rules: {
      'no-restricted-imports': restrictImports(
        [LAYOUT, ...WINDOW_SIZE],
        [
          {
            group: ['@/lesson/*', '@/game/*', '@/settings/*', '@/resources/*', '@data-client/*'],
            allowTypeImports: true,
            message: 'A layout places blocks: work out what they show in useLessonScreen.ts.',
          },
        ],
      ),
    },
  },
  {
    // On the web theme colors are CSS variables and the scheme lives in the
    // page (src/theme/cssVariables.ts); a branch on it would show the wrong
    // colors in the pre-rendered page.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', TESTS],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='colorScheme'], ObjectPattern > Property[key.name='colorScheme']",
          message:
            "Add a color that differs by scheme to theme.ts's schemeColors and read it with useSchemeColors.",
        },
        WIDTH_QUERY,
      ],
    },
  },
  {
    files: ['src/theme/**/*.{ts,tsx}'],
    ignores: ['src/theme/Narrow.tsx', TESTS],
    rules: { 'no-restricted-syntax': ['error', WIDTH_QUERY] },
  },
  {
    // network.ts is a worklet file, run on a background runtime on Android.
    // Worklets can call only other worklets, created in order.
    files: ['src/maia/network.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration, ExportNamedDeclaration[source], ExportAllDeclaration',
          message: 'network.ts runs as worklets, which cannot use imports.',
        },
      ],
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: true, classes: true, variables: true, ignoreTypeReferences: true },
      ],
    },
  },
]);
