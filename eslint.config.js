// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'vendor/*'] },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: [
                'Pressable',
                'TouchableOpacity',
                'TouchableHighlight',
                'TouchableWithoutFeedback',
                'TouchableNativeFeedback',
              ],
              message:
                "Use Pressable from '@reactive/silk-native', which shows the keyboard focus ring.",
            },
            {
              name: '@/theme/theme',
              importNames: ['rgba', 'spotlight'],
              message:
                'On the web theme colors are CSS variables: add a color to src/theme/schemeColors.ts and read it with useSchemeColors.',
            },
          ],
        },
      ],
    },
  },
  {
    // On the web theme colors are CSS variables and the scheme lives in the
    // page (src/theme/schemeCss.ts); a branch on it would show the wrong colors
    // in the pre-rendered page.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='colorScheme']",
          message:
            'Add a color that differs by scheme to src/theme/schemeColors.ts and read it with useSchemeColors.',
        },
      ],
    },
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
