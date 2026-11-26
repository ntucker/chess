import { type Controller, useController } from '@data-client/react';
import { Spinner, Stack } from '@reactive/silk-native';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Page } from '@/components/Page';
import { PageIntro, textColumn } from '@/components/PageIntro';
import { STAGE_MAX } from '@/components/Stage';
import { finishSignIn, type SignInOutcome } from '@/lichess/finishSignIn';

/**
 * lichess's answer to a web sign-in, in the popup (`lichessRedirectUri`):
 * trades its code for a token and saves the account, which the page that
 * opened the popup takes in as it takes in another tab's sign-in
 * (`AccountsSync`), then closes the popup. lichess's page cut the popup off
 * from its opener (`takePendingSignIn`), so the popup can't hand the answer
 * back. With no sign-in waiting for this answer (a direct visit, or one
 * already finished), it goes home.
 */
export function LichessReturn() {
  const ctrl = useController();
  const [outcome, setOutcome] = useState<SignInOutcome>();
  useEffect(() => {
    void finishSignInOnce(ctrl).then((ended) => {
      setOutcome(ended);
      // The browser may refuse to close a window it no longer counts as opened by script: the page then says so.
      if (ended.type === 'signed-in') window.close();
    });
  }, [ctrl]);
  if (outcome?.type === 'none') return <Redirect href="/" />;
  return (
    <Page
      title="lichess · Opening Night"
      header={{ place: { name: 'lichess' }, back: { href: '/', label: 'Back to the board' } }}
      maxWidth={STAGE_MAX}
    >
      <View style={styles.content}>
        {outcome ? (
          <PageIntro
            eyebrow="lichess"
            title={outcome.type === 'signed-in' ? 'Signed in' : 'Not signed in'}
          >
            {outcomeText(outcome)}
          </PageIntro>
        ) : (
          <Stack gap="2" align="center">
            <Spinner tone="accent" label="Signing in with lichess" />
          </Stack>
        )}
      </View>
    </Page>
  );
}

/** What the popup says once the sign-in has ended (`none` goes home instead). */
function outcomeText(outcome: Exclude<SignInOutcome, { type: 'none' }>): string {
  switch (outcome.type) {
    case 'signed-in':
      return `Signed in as ${outcome.username}. You can close this window.`;
    case 'refused':
      return 'lichess was not allowed to sign you in. Close this window, and try again from the person button if you like.';
    case 'failed':
      return 'lichess could not sign you in. Close this window and try again from the person button.';
    case 'replaced':
      return 'A newer sign-in replaced this one. Close this window, and finish signing in in the newer one.';
  }
}

/**
 * This page's one `finishSignIn`. A second run would find the pending sign-in
 * already taken and go home, so React running the effect twice (Strict Mode)
 * shares the first run's answer.
 */
let signingIn: Promise<SignInOutcome> | undefined;

const finishSignInOnce = (ctrl: Controller) =>
  (signingIn ??= finishSignIn(ctrl, window.location.search));

const styles = StyleSheet.create({
  content: { ...textColumn, maxWidth: 680, gap: 32 },
});
