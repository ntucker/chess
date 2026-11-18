// Maia's API, shared by the app and the proxy (see src/server/maiaProxy.ts).
export const MAIA_API_ORIGIN = 'https://www.maiachess.com/api/v1';
/** The one call the app makes: Maia's move after the moves so far. */
export const MAIA_MOVE_PATH = '/play/get_move';
