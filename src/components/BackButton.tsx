import { useRouter } from 'expo-router';

import { HeaderButton } from '@/components/HeaderButton';
import { goBack } from '@/components/navigation';
import type { Destination } from '@/components/PlaceLink';

/**
 * A back chevron in the header: back to the page underneath, which kept its
 * state (a stack keeps the pages under the top one mounted), or to `href`
 * when there is none, such as after a reload. `label` is what a screen
 * reader says, such as "Back to the board".
 */
export function BackButton({ href, label }: Destination) {
  const router = useRouter();
  return (
    <HeaderButton
      icon="chevron-back"
      iconSize={22}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => goBack(router, href)}
    />
  );
}
