import { AsyncBoundary, useController, useSuspense } from '@data-client/react';

import { BrowserOnly } from '@/components/BrowserOnly';
import { HeaderButton } from '@/components/HeaderButton';
import { Tip } from '@/components/Tip';
import { useLichessSignIn } from '@/lichess/useLichessSignIn';
import { getAccounts, signOutLichess } from '@/resources/accounts';

const SIGN_IN_TIP =
  'Sign in with lichess: the opportunity finder then counts real games at your opponent’s rating, instead of Maia’s estimates.';
const FAILED_TIP = 'Signing in with lichess failed. Press to try again.';

/**
 * The learner's lichess account as one header button: signed out, it signs
 * in (`useLichessSignIn`); signed in, its tooltip names the account and it
 * signs out. The account is read on the device, so the page's static export
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
        icon="person-circle"
        iconSize={21}
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
  const failed = state === 'failed';
  return (
    <Tip tip={failed ? FAILED_TIP : SIGN_IN_TIP}>
      <HeaderButton
        icon={failed ? 'alert-circle-outline' : 'person-circle-outline'}
        iconSize={21}
        accessibilityRole="button"
        accessibilityLabel={failed ? FAILED_TIP : 'Sign in with lichess'}
        disabled={!signIn || state === 'signing-in'}
        onPress={() => void signIn?.()}
      />
    </Tip>
  );
}
