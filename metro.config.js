// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Maia's networks (assets/maia/*.bin) ship with the app as assets.
config.resolver.assetExts.push('bin');

module.exports = config;
