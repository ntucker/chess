import { Text } from '@reactive/silk-native';
import { Text as Span } from 'react-native';

import { ExternalLink } from '@/components/ExternalLink';
import type { LessonSource } from '@/lesson/lesson';
import { listSeparator, sourceName } from '@/lesson/openings';

/**
 * The footnote crediting what a lesson was made from: "Lesson from MMatkun's
 * lichess study and Chess Opening Theory by Wikibooks contributors (CC BY-SA
 * 4.0)", each source and license a link. A share-alike license asks for its
 * link wherever its text is shown, which a note's plain text can't hold.
 */
export function SourceCredits({ sources }: { readonly sources: readonly LessonSource[] }) {
  return (
    <Text role="caption" tone="secondary">
      Lesson from{' '}
      {sources.map((source, i) => (
        <Span key={source.url}>
          {listSeparator(i, sources.length)}
          <ExternalLink url={source.url}>{sourceName(source)}</ExternalLink>
          {source.license ? (
            <>
              {' ('}
              <ExternalLink url={source.license.url}>
                {/* Kept on one line: "CC BY-SA 4.0" broken in two reads as two things. */}
                {source.license.name.replaceAll(' ', '\u00a0')}
              </ExternalLink>
              )
            </>
          ) : null}
        </Span>
      ))}
    </Text>
  );
}
