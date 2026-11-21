// jsdom lacks matchMedia, which Silk's useReducedMotion (and Reanimated) ask,
// as does React Native Web's Appearance (with the older addListener).
window.matchMedia = ((media: string) => ({
  matches: false,
  media,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})) as unknown as typeof window.matchMedia;
