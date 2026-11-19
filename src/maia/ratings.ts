/** The ratings Maia has a network for, lowest first: each was trained on players of that rating. */
export const MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const;

export type MaiaRating = (typeof MAIA_RATINGS)[number];
