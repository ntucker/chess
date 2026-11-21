import { Text } from '@reactive/silk-native';
import { Fragment, use } from 'react';
import { Text as Span } from 'react-native';

import { ExternalLink } from '@/components/ExternalLink';
import {
  type CreditGroup,
  creditGroups,
  listSeparator,
  sourceNamer,
  sourcesOf,
} from '@/lesson/credits';
import type { License, LessonSource } from '@/lesson/lesson';
import { LessonIndexContext } from '@/resources/lesson';

/**
 * The footnote crediting what a lesson was made from: "Lesson from Matkun's
 * lichess study; Chess Opening Theory, 1.e4 c6 by Wikibooks contributors (CC
 * BY-SA 4.0)", each source and license a link. Sources of one site are
 * credited together (`creditGroups`): "lichess studies by A and B (1, 2)",
 * "Chess Opening Theory by Wikibooks contributors (CC BY-SA 4.0): 1.e4 c6,
 * 1.e4 e5". A share-alike license asks for its link wherever its text is
 * shown.
 */
export function SourceCredits({ sources }: { readonly sources: readonly LessonSource[] }) {
  const name = sourceNamer(sourcesOf(use(LessonIndexContext), sources));
  return (
    <Text role="caption" tone="secondary">
      {/*
       * All of it in a span, none straight in the paragraph. Android redoes a
       * paragraph's text each time the paragraph moves if any text sits straight in
       * it, and redone text of the same size loses its links' underlines
       * (facebook/react-native#58579). A span's text doesn't move with it.
       */}
      <Span>
        Lesson from{' '}
        {creditGroups(sources).map((group, i) => (
          <Span key={i}>
            {i > 0 ? '; ' : null}
            <Group group={group} name={name} />
          </Span>
        ))}
      </Span>
    </Text>
  );
}

function Group({
  group,
  name,
}: {
  readonly group: CreditGroup;
  /** How the app names a source credited alone, as every screen names it (`sourceNamer`). */
  readonly name: (source: LessonSource) => string;
}) {
  switch (group.kind) {
    case 'source':
      return (
        <>
          <ExternalLink url={group.source.url}>{name(group.source)}</ExternalLink>
          <LicenseNote license={group.source.license} />
        </>
      );
    case 'studies':
      return (
        <>
          lichess studies by{' '}
          {group.authors.map((author, i) => (
            <Fragment key={author.author}>
              {listSeparator(i, group.authors.length)}
              <AuthorStudies {...author} />
            </Fragment>
          ))}
          <LicenseNote license={group.license} />
        </>
      );
    case 'pages': {
      const pages = group.pages.map(({ label, source }, i) => (
        <Fragment key={source.url}>
          {listSeparator(i, group.pages.length)}
          <ExternalLink url={source.url}>{byMove(label)}</ExternalLink>
        </Fragment>
      ));
      const titled = group.title !== undefined;
      return (
        <>
          {titled ? group.title : pages} by {group.author}
          <LicenseNote license={group.license} />
          {titled ? <>: {pages}</> : null}
        </>
      );
    }
  }
}

/** An author's studies: their name linking to one, else a numbered link to each. */
function AuthorStudies({
  author,
  studies,
}: {
  readonly author: string;
  readonly studies: readonly LessonSource[];
}) {
  if (studies.length === 1) return <ExternalLink url={studies[0].url}>{author}</ExternalLink>;
  return (
    <>
      {author} (
      {studies.map((study, n) => (
        <Fragment key={study.url}>
          {n > 0 ? ', ' : null}
          <ExternalLink url={study.url} label={`${n + 1}: ${study.title}`}>
            {String(n + 1)}
          </ExternalLink>
        </Fragment>
      ))}
      )
    </>
  );
}

function LicenseNote({ license }: { readonly license?: License }) {
  return license ? (
    <>
      {' ('}
      <ExternalLink url={license.url}>
        {/* Kept on one line: "CC BY-SA 4.0" broken in two reads as two things. */}
        {unbroken(license.name)}
      </ExternalLink>
      )
    </>
  ) : null;
}

/** `text` with no-break spaces, so it wraps as one word. */
const unbroken = (text: string) => text.replaceAll(' ', '\u00a0');

/**
 * `moves` kept whole move by move: "1.e4 c6" broken in two reads as two, but
 * a long line of moves may still break before a move number to fit a phone.
 */
const byMove = (moves: string) => moves.replace(/ (?!\d+\.)/g, '\u00a0');
