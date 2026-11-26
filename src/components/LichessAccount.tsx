import { AsyncBoundary, useController, useSuspense } from '@data-client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@reactive/silk-native';
import { StyleSheet, Text, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { HeaderButton } from '@/components/HeaderButton';
import { Tip } from '@/components/Tip';
import { useLichessSignIn } from '@/lichess/useLichessSignIn';
import { getAccounts, signOutLichess } from '@/resources/accounts';
import { fonts } from '@/theme/theme';

const SIGN_IN_TIP =
  'Sign in with lichess: the opportunity finder then counts real games at your opponent’s rating, instead of Maia’s estimates.';
const FAILED_TIP = 'Signing in with lichess failed. Press to try again.';

/**
 * The learner's lichess account as one header button: signed out, a person
 * with a plus, it signs in (`useLichessSignIn`); signed in, the account's
 * initial on an accent disc, its tooltip names the account and it signs out.
 * lichess has no profile photos, and an outlined person beside a filled one
 * read alike, so the two states look nothing alike. The account is read on the device, so the page's static export
 * draws nothing here.
 */
export function LichessAccount() {
  return (
    <BrowserOnly fallback={null}>
      {/* The device answers at once; until then, and if it can't, no button. */}
      <AsyncBoundary fallback={null} errorComponent={NoButton}>
        <AccountButton />
      </AsyncBoundary>
    </BrowserOnly>
  );
}

const NoButton = () => null;

function AccountButton() {
  const ctrl = useController();
  const { lichess } = useSuspense(getAccounts);
  if (!lichess) return <SignInButton />;
  return (
    <Tip tip={`Signed in to lichess as ${lichess.username}. Press to sign out.`}>
      <HeaderButton
        face={() => <Initial name={lichess.username} />}
        accessibilityRole="button"
        accessibilityLabel={`Sign out of lichess (${lichess.username})`}
        onPress={() => void ctrl.fetch(signOutLichess)}
      />
    </Tip>
  );
}

/**
 * Signs in: its own component, so a signed-in learner's header never
 * prepares a sign-in. A failed sign-in changes its icon too, since a phone
 * shows the tip only on a press the button doesn't take.
 */
function SignInButton() {
  const { signIn, state } = useLichessSignIn();
  const { danger } = useTheme().theme.semantic.color.tones;
  const failed = state === 'failed';
  return (
    <Tip tip={failed ? FAILED_TIP : SIGN_IN_TIP}>
      <HeaderButton
        face={(ink) => (
          <Ionicons
            name={failed ? 'alert-circle-outline' : 'person-add-outline'}
            size={21}
            color={failed ? danger.text : ink}
          />
        )}
        accessibilityRole="button"
        accessibilityLabel={failed ? FAILED_TIP : 'Sign in with lichess'}
        disabled={!signIn || state === 'signing-in'}
        onPress={() => void signIn?.()}
      />
    </Tip>
  );
}

/** A signed-in account's face: the first letter of its name on an accent disc. */
function Initial({ name }: { readonly name: string }) {
  const { accent } = useTheme().theme.semantic.color.tones;
  return (
    <View style={[styles.disc, { backgroundColor: accent.solid }]} aria-hidden>
      <Text style={[styles.initial, { color: accent.onSolid }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  // The wordmark's serif, in its one weight.
  initial: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18 },
});
