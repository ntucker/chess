// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Maia's networks (assets/maia/*.bin) and Stockfish (assets/stockfish: the
// engine's .wasm and its loader as .txt) ship with the app as assets.
config.resolver.assetExts.push('bin', 'wasm', 'txt');

// An app's build (`expo export:embed`, which Gradle runs) copies public/ into
// the app beside its DOM components' pages. public/ holds only full Stockfish
// (99 MB, scripts/copy-stockfish.mjs), which the app downloads instead, so the
// build reads public/ from a folder that doesn't exist, unless one is set. Web
// builds keep it.
if (process.argv.includes('export:embed')) process.env.EXPO_PUBLIC_FOLDER ??= 'no-public-in-apps';

module.exports = config;
