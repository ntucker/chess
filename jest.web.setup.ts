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

// jsdom lacks pointer capture, which Gesture Handler's web pointer tracking
// (Silk's Slider) calls on every press.
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
