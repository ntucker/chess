/**
 * How the app credits the sources lessons are made from: the names it gives
 * them, and which it credits.
 */
import { onDomain, type LessonSource } from './lesson';
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
