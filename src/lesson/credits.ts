import type { License, LessonSource } from './lesson';
import { isLichessStudy } from './openings';

/**
 * Sources credited together, so a long list (the start position credits
 * every lesson's) names each site once:
 * - `source`: one source alone, named as `sourceNamer` names it.
 * - `studies`: two or more lichess studies, by their authors, each author's
 *   studies in the order given.
 * - `pages`: two or more pages of one site by one author under one license,
 *   such as Wikibooks' Chess Opening Theory, each labelled by what follows the
 *   `title` they share ("1.e4 c6" of "Chess Opening Theory, 1.e4 c6"), or by
 *   its whole title when they share none. Each page keeps its link, since a
 *   share-alike license asks for one.
 */
export type CreditGroup =
  | { readonly kind: 'source'; readonly source: LessonSource }
  | {
      readonly kind: 'studies';
      readonly authors: readonly {
        readonly author: string;
        readonly studies: readonly LessonSource[];
      }[];
    }
  | {
      readonly kind: 'pages';
      readonly title?: string;
      readonly author: string;
      readonly license?: License;
      readonly pages: readonly { readonly label: string; readonly source: LessonSource }[];
    };

/** `sources` grouped by site (`CreditGroup`), each group where its first source was. */
export function creditGroups(sources: readonly LessonSource[]): CreditGroup[] {
  const groups = new Map<string, LessonSource[]>();
  for (const source of sources) {
    const key = groupKey(source);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups.values()].map((group) => {
    const [first] = group;
    if (group.length === 1) return { kind: 'source', source: first };
    if (isLichessStudy(first)) return { kind: 'studies', authors: byAuthor(group) };
    const title = sharedTitle(group);
    return {
      kind: 'pages',
      title,
      author: first.author,
      license: first.license,
      pages: group.map((source) => ({
        label: title === undefined ? source.title : source.title.slice(title.length + 2),
        source,
      })),
    };
  });
}

/** Lichess studies share a group; other pages share one by site, author and license. */
const groupKey = (source: LessonSource) =>
  isLichessStudy(source)
    ? 'lichess study'
    : [new URL(source.url).hostname, source.author, source.license?.name ?? ''].join('\n');

function byAuthor(studies: readonly LessonSource[]) {
  const authors = new Map<string, LessonSource[]>();
  for (const study of studies) {
    authors.set(study.author, [...(authors.get(study.author) ?? []), study]);
  }
  return [...authors].map(([author, ofAuthor]) => ({ author, studies: ofAuthor }));
}

/** The title before ", " that every one of `pages` starts with, if they share one. */
function sharedTitle(pages: readonly LessonSource[]): string | undefined {
  const [first, ...rest] = pages.map(({ title }) => title.split(', ')[0]);
  return pages.every(({ title }) => title.includes(', ')) && rest.every((title) => title === first)
    ? first
    : undefined;
}
