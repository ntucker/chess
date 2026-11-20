/**
 * The opening list: every lesson of each side with its named variations as
 * a tree, each with the moves that open it. Built from the lesson index
 * alone (`IndexEntry.variations`), so no lesson loads for it. Pure, like the
 * rest of src/lesson/.
 */
import { type Color, COLORS, lineSans, numberedLine } from '@/game/replay';

import type { LessonSource, Uci, VariationId } from './lesson';
import { type IndexVariation, type LessonIndex, startsWith, variationLine } from './openings';

/** A variation as the list shows it, with the variations that branch from it. */
export interface ListedVariation {
  readonly id: VariationId;
  /** Its name, without its parent's in front ("Tal Variation", under "Advance Variation"). */
  readonly name: string;
  /** Its moves in numbered SAN: past its parent's moves when it carries on from them, else all. */
  readonly line: string;
  readonly children: readonly ListedVariation[];
}

/** A lesson as the list shows it: the opening itself, its variations under it. */
export interface ListedOpening<Id extends string = string> {
  readonly id: Id;
  readonly sources: readonly LessonSource[];
  /** The opening itself, the variation without a parent, headed by the lesson's title. */
  readonly root: ListedVariation;
}

/** Each side's openings, in the index's order. */
export function openingList<Id extends string>(
  index: LessonIndex<Id>,
): Record<Color, ListedOpening<Id>[]> {
  const ids = Object.keys(index) as Id[];
  return Object.fromEntries(
    COLORS.map((side) => [
      side,
      ids
        .filter((id) => index[id].side === side)
        .flatMap((id) => {
          const { title, sources, variations } = index[id];
          // The index keeps the lesson's one variation without a parent (`variationLines`).
          const root = variations.find(({ parent }) => parent === undefined);
          // The list heads each opening with its lesson's title, as the board does.
          return root ? [{ id, sources, root: { ...listed(root, variations), name: title } }] : [];
        }),
    ]),
  ) as Record<Color, ListedOpening<Id>[]>;
}

/** `variation` and the variations under it, in the index's order. */
function listed(
  variation: IndexVariation,
  variations: readonly IndexVariation[],
  parent?: IndexVariation,
): ListedVariation {
  const prefix = parent && `${parent.name}: `;
  const carriesOn = parent && startsWith(variation.moves, parent.moves);
  return {
    id: variation.id,
    name:
      prefix && variation.name.startsWith(prefix)
        ? variation.name.slice(prefix.length)
        : variation.name,
    line: lineText(variation.moves, carriesOn ? parent.moves.length : 0),
    children: variations
      .filter((child) => child.parent === variation.id)
      .map((child) => listed(child, variations, variation)),
  };
}

/**
 * The ids from `variation` down to the one with `id`, both included: the
 * branches to open to show it. Empty when `id` isn't under `variation`, or none is given.
 */
export function listedPath(variation: ListedVariation, id?: VariationId): VariationId[] {
  if (variation.id === id) return [id];
  for (const child of variation.children) {
    const path = listedPath(child, id);
    if (path.length) return [variation.id, ...path];
  }
  return [];
}

/** `moves` from the one after `from` on, numbered: `1.e4 c6`, or `3...dxe4 4.Nxe4`. */
function lineText(moves: readonly Uci[], from: number): string {
  return numberedLine(lineSans(moves).slice(from), from + 1);
}

/** Where the board was when the list opened: a lesson, and a variation of it. */
export interface ListPlace<Id extends string = string> {
  readonly lesson: Id;
  readonly variation?: VariationId;
}

/**
 * The place an address's `lesson` and `variation` name in `index`, keeping
 * only what it has: none for an unknown lesson, no variation for an unknown one.
 */
export function listPlace<Id extends string>(
  index: LessonIndex<Id>,
  lesson?: string,
  variation?: string,
): ListPlace<Id> | undefined {
  if (lesson === undefined || !Object.hasOwn(index, lesson)) return undefined;
  const entry = index[lesson as Id];
  return { lesson: lesson as Id, ...(variationLine(entry, variation) && { variation }) };
}
