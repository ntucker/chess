import { Popover, Pressable, Text } from '@reactive/silk-native';
import { type ComponentRef, type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  /** What the mark means, in a sentence or two. */
  readonly tip: string;
  /** The mark: a small icon or badge. */
  readonly children: ReactNode;
}

/**
 * A small mark that explains itself in a tooltip, in place of words beside
 * it: shown while a mouse or pen points at the mark, and toggled by a tap,
 * which a finger needs. A press elsewhere closes it. The tooltip takes no
 * focus, and the mark isn't a Tab stop: a mark inside a control is spoken
 * through the control's label, which should say what the tooltip says.
 */
export function Tip({ tip, children }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<ComponentRef<typeof View>>(null);
  return (
    <>
      <Pressable
        ref={anchor}
        accessible={false}
        focusable={false}
        hitSlop={6}
        // A finger doesn't hover: React Native Web reports only a mouse's or pen's.
        onHoverIn={() => setOpen(true)}
        onHoverOut={() => setOpen(false)}
        onPress={() => setOpen((was) => !was)}
      >
        {children}
      </Pressable>
      <Popover.Root open={open} onOpenChange={setOpen} anchor={anchor}>
        <Popover.Content
          side="top"
          sideOffset={6}
          // A tooltip leaves focus where it is.
          onOpenAutoFocus={(event) => event.preventDefault()}
          style={styles.tip}
        >
          <Text role="caption">{tip}</Text>
        </Popover.Content>
      </Popover.Root>
    </>
  );
}

const styles = StyleSheet.create({
  tip: { maxWidth: 240, paddingHorizontal: 10, paddingVertical: 6 },
});
