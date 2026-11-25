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
  const { signIn, state } = useLichessSignIn();
  if (lichess) {
    const tip = `Signed in to lichess as ${lichess.username}. Press to sign out.`;
    return (
      <Tip tip={tip}>
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
  const signingIn = state === 'signing-in' || !signIn;
  return (
    <Tip tip={state === 'failed' ? FAILED_TIP : SIGN_IN_TIP}>
      <HeaderButton
        icon="person-circle-outline"
        iconSize={21}
        accessibilityRole="button"
        accessibilityLabel="Sign in with lichess"
        disabled={signingIn}
        onPress={() => void signIn?.()}
      />
    </Tip>
  );
}
