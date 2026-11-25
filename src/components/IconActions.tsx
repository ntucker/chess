import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@reactive/silk-native';
import type { ComponentProps } from 'react';

import { Tip } from '@/components/Tip';

/** An action drawn as an icon, named by its tooltip. */
export interface IconAction {
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  readonly tip: string;
  /** Undefined when it does nothing now: the button is disabled. */
  readonly onPress?: () => void;
}

/** `actions` as outline icon buttons, each named by its tooltip; place them in a row. */
export function IconActions({ actions }: { readonly actions: readonly IconAction[] }) {
  return actions.map(({ icon, tip, onPress }) => (
    // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
    <Tip key={icon} tip={tip} focusable={!onPress}>
      <Button variant="outline" disabled={!onPress} onPress={onPress} accessibilityLabel={tip}>
        <Ionicons name={icon} size={17} />
      </Button>
    </Tip>
  ));
}
