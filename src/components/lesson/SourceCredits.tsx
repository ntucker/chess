import { Text } from '@reactive/silk-native';
import { Linking, Text as Span, StyleSheet } from 'react-native';

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

/** A link inside text: an anchor opening a new tab on the web, the browser elsewhere. */
function ExternalLink({ url, children }: { readonly url: string; readonly children: string }) {
  const opens =
    process.env.EXPO_OS === 'web'
      ? { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
      : { onPress: () => Linking.openURL(url) };
  return (
    <Span {...opens} role="link" style={styles.link}>
      {children}
    </Span>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
