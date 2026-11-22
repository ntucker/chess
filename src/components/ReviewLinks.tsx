import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline } from '@reactive/silk-native';
import { type Href, useRouter } from 'expo-router';

import { Tip } from '@/components/Tip';

/** The review's mark: a line graph, as the review charts the game. */
const ICON = 'analytics-outline';
const LABEL = 'Review the game';

/** "Review the game", under the headline of a game that ended: opens its review on top of the game. */
export function ReviewGameButton({ href }: { readonly href: Href }) {
  const router = useRouter();
  return (
    <Inline>
      <Button onPress={() => router.push(href)}>
        <Ionicons name={ICON} size={15} /> {LABEL}
      </Button>
    </Inline>
  );
}

/**
 * The Review button by the scoresheet's title: opens the review at `href`,
 * or, while `shut` says why it doesn't open yet, shows disabled with that in
 * its tip. `compact` draws only its icon, for the narrow scoresheet drawer's
 * head; screen readers hear its name either way.
 */
export function ScoresheetReview({
  href,
  shut,
  compact,
}: {
  readonly href: Href;
  readonly shut?: string;
  readonly compact?: boolean;
}) {
  const router = useRouter();
  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={shut !== undefined}
      accessibilityLabel={LABEL}
      onPress={() => router.push(href)}
    >
      <Ionicons name={ICON} size={16} />
      {compact ? null : ' Review'}
    </Button>
  );
  if (shut === undefined) return button;
  // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
  return (
    <Tip tip={shut} focusable>
      {button}
    </Tip>
  );
}
