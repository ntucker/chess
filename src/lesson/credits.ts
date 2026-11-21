/**
 * How the app credits the sources lessons are made from: the names it gives
 * them, which it credits, and how it groups them.
 */
import { type License, onDomain, type LessonSource } from './lesson';
import type { LessonIndex } from './openings';

const isLichessStudy = ({ url }: LessonSource) => {
  const parsed = new URL(url);
  return onDomain(parsed, 'lichess.org') && parsed.pathname.startsWith('/study/');
};

/**
 * How the app names a source among `credited` (every source the app credits,
 * from `sourcesOf`). A lichess study is "author's lichess study" when it is
 * the only lichess study by its author among them, so one study reads the
 * same on every screen; any other source is its title and author. Each URL
 * parses once per name and once here, not once per other source: the checker
 * has read every shipped lesson's sources.
 */
export function sourceNamer(credited: readonly LessonSource[]): (source: LessonSource) => string {
  const studies = new Map<string, string[]>();
  for (const { author, url } of credited.filter(isLichessStudy)) {
    const urls = studies.get(author) ?? [];
    studies.set(author, urls);
    urls.push(url);
  }
  return (source) => {
    const { title, author, url } = source;
    const hasSiblingStudy = studies.get(author)?.some((other) => other !== url);
    return isLichessStudy(source) && !hasSiblingStudy
      ? `${author}'s lichess study`
      : `${title} by ${author}`;
  };
}

/** Every source the index's lessons and `more` credit, each once (the same URL is the same source). */
export const sourcesOf = (
  index: LessonIndex,
  more: readonly LessonSource[] = [],
): LessonSource[] => [
  ...new Map(
    [...Object.values(index).flatMap(({ sources }) => sources), ...more].map(
      (source) => [source.url, source] as const,
    ),
  ).values(),
];

/** What comes before item `i` of `count` in an English list: "a", "a and b", "a, b and c". */
export const listSeparator = (i: number, count: number) =>
  i === 0 ? '' : i === count - 1 ? ' and ' : ', ';

/**
 * Sources credited together, so a long list (the start position credits
 * every lesson's) names each site once:
 * - `source`: one source alone, named as `sourceNamer` names it.
 * - `studies`: two or more lichess studies under one license (or none), by
 *   their authors, each author's studies in the order given.
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
      readonly license?: License;
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
  return [...groupBy(sources, groupKey).values()].map((group) => {
    const [first] = group;
    if (group.length === 1) return { kind: 'source', source: first };
    if (isLichessStudy(first)) {
      const authors = [...groupBy(group, ({ author }) => author)];
      return {
        kind: 'studies',
        license: first.license,
        authors: authors.map(([author, studies]) => ({ author, studies })),
      };
    }
    const title = sharedTitle(group);
    return {
      kind: 'pages',
      title,
      author: first.author,
      license: first.license,
      pages: group.map((source) => ({
        label:
          title === undefined
            ? source.title
            : source.title.slice(title.length + TITLE_SEPARATOR.length),
        source,
      })),
    };
  });
}

/** Lichess studies share a group by license; other pages share one by site, author and license. */
const groupKey = (source: LessonSource) =>
  [
    isLichessStudy(source) ? 'lichess study' : `${new URL(source.url).hostname}\n${source.author}`,
    source.license?.name ?? '',
  ].join('\n');

/** `items` by `keyOf`, each key's items in order, the keys in the order first seen. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    groups.set(key, group);
    group.push(item);
  }
  return groups;
}

/** What a page's title puts between its book's title and its own ("Chess Opening Theory, 1.e4 c6"). */
const TITLE_SEPARATOR = ', ';

/** The title before `TITLE_SEPARATOR` that every one of `pages` starts with, if they share one. */
function sharedTitle(pages: readonly LessonSource[]): string | undefined {
  const [first, ...rest] = pages.map(({ title }) => title.split(TITLE_SEPARATOR)[0]);
  return pages.every(({ title }) => title.includes(TITLE_SEPARATOR)) &&
    rest.every((title) => title === first)
    ? first
    : undefined;
}
