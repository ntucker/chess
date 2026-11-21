import { Text } from '@reactive/silk-native';

import { HeaderButton } from '@/components/HeaderButton';
import { ExternalLink, opensUrl } from '@/components/ExternalLink';

/** Where Opening Night's source code lives. */
export const SOURCE_URL = 'https://github.com/ntucker/chess';

/** The GitHub mark, linking to the app's source. */
export function SourceLink() {
  return (
    <HeaderButton
      {...opensUrl(SOURCE_URL)}
      icon="logo-github"
      iconSize={20}
      accessibilityRole="link"
      accessibilityLabel="Source code on GitHub"
    />
  );
}

/** A footnote linking to the source, where the header has no room for its button. */
export function SourceFootnote() {
  return (
    <Text role="caption" tone="secondary">
      <ExternalLink url={SOURCE_URL}>Source code on GitHub</ExternalLink>
    </Text>
  );
}
