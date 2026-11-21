// jsdom lacks matchMedia, which Silk's useReducedMotion (and Reanimated) ask.
window.matchMedia = ((media: string) => ({
  matches: false,
  media,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia;
