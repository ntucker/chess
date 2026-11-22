// react-native-svg's web build imports React Native's asset registry, which
// the web preset doesn't resolve; nothing these tests draw loads an asset.
export const getAssetByID = () => undefined;
