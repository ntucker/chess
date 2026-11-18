// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'vendor/*'] },
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
