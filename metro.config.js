// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Maia's networks (assets/maia/*.bin) and Stockfish (assets/stockfish: the
// engine's .wasm and its loader as .txt) ship with the app as assets.
config.resolver.assetExts.push('bin', 'wasm', 'txt');

module.exports = config;
