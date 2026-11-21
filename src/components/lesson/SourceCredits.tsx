import { Text } from '@reactive/silk-native';
import { Fragment, use } from 'react';
import { Text as Span } from 'react-native';

import { ExternalLink } from '@/components/ExternalLink';
import { type CreditGroup, creditGroups } from '@/lesson/credits';
import type { License, LessonSource } from '@/lesson/lesson';
import { listSeparator, sourceName, sourcesOf } from '@/lesson/openings';
import { LessonIndexContext } from '@/resources/lesson';

/**
 * The footnote crediting what a lesson was made from: "Lesson from MMatkun's
 * lichess study; Chess Opening Theory, 1.e4 c6 by Wikibooks contributors (CC
 * BY-SA 4.0)", each source and license a link. Sources of one site are
 * credited together (`creditGroups`): "lichess studies by A and B (1, 2)",
 * "Chess Opening Theory by Wikibooks contributors (CC BY-SA 4.0): 1.e4 c6,
 * 1.e4 e5". A share-alike license asks for its link wherever its text is
 * shown, which a note's plain text can't hold.
 */
export function SourceCredits({ sources }: { readonly sources: readonly LessonSource[] }) {
  const credited = sourcesOf(use(LessonIndexContext), sources);
  return (
    <Text role="caption" tone="secondary">
      Lesson from{' '}
      {creditGroups(sources).map((group, i) => (
        <Span key={i}>
          {i > 0 ? '; ' : null}
          <Group group={group} credited={credited} />
        </Span>
      ))}
    </Text>
  );
}

function Group({
  group,
  credited,
}: {
  readonly group: CreditGroup;
  /** Every source the app credits, so one study reads the same everywhere (`sourceName`). */
  readonly credited: readonly LessonSource[];
}) {
  switch (group.kind) {
    case 'source':
      return (
        <>
          <ExternalLink url={group.source.url}>{sourceName(group.source, credited)}</ExternalLink>
          <LicenseNote license={group.source.license} />
        </>
      );
    case 'studies':
      return (
        <>
          lichess studies by{' '}
          {group.authors.map(({ author, studies }, i) => (
            <Fragment key={author}>
              {listSeparator(i, group.authors.length)}
              {studies.length === 1 ? (
                <ExternalLink url={studies[0].url}>{author}</ExternalLink>
              ) : (
                <>
                  {author} (
                  {studies.map((study, n) => (
                    <Fragment key={study.url}>
                      {n > 0 ? ', ' : null}
                      <ExternalLink url={study.url} label={study.title}>
                        {String(n + 1)}
                      </ExternalLink>
                    </Fragment>
                  ))}
                  )
                </>
              )}
            </Fragment>
          ))}
        </>
      );
    case 'pages': {
      const pages = group.pages.map(({ label, source }, i) => (
        <Fragment key={source.url}>
          {listSeparator(i, group.pages.length)}
          {/* Kept on one line, as a license's name is: "1.e4 c6" broken in two reads as two. */}
          <ExternalLink url={source.url}>{unbroken(label)}</ExternalLink>
        </Fragment>
      ));
      return group.title === undefined ? (
        <>
          {pages} by {group.author}
          <LicenseNote license={group.license} />
        </>
      ) : (
        <>
          {group.title} by {group.author}
          <LicenseNote license={group.license} />: {pages}
        </>
      );
    }
  }
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
