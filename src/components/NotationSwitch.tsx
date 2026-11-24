import { StyleSheet, Text } from 'react-native';

import { HeaderButton } from '@/components/HeaderButton';
import { Tip } from '@/components/Tip';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { fonts } from '@/theme/theme';

const TIPS = {
  icons: 'Moves show pieces as icons. Tap for letters.',
  letters: 'Moves show pieces as letters. Tap for icons.',
} as const;

/**
 * Whether moves show their pieces as icons or letters (the `notation`
 * setting), beside the scoresheet's eyebrow: a round button whose face is
 * the knight as moves show it now, the icon (♞) or the letter (N). A tap
 * switches, and its tooltip says so.
 */
export function NotationSwitch() {
  const { notation } = useSettings();
  const dispatch = useSettingsDispatch();
  const icons = notation === 'icons';
  return (
    <Tip tip={TIPS[notation]}>
      <HeaderButton
        accessibilityRole="switch"
        accessibilityLabel="Piece icons in moves"
        checked={icons}
        onPress={() =>
          dispatch({ type: 'chosen', choice: { notation: icons ? 'letters' : 'icons' } })
        }
        face={(ink) => <Text style={[icons ? styles.icon : styles.letter, { color: ink }]}>N</Text>}
      />
    </Tip>
  );
}

const styles = StyleSheet.create({
  icon: { fontFamily: fonts.figurines, fontSize: 18 },
  letter: { fontFamily: fonts.mono, fontSize: 16 },
});
