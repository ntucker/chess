/** Where the web site is served from (app.config.ts), with no slash at the end: empty at a domain's root. */
export const BASE_PATH = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
