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
    void finishing(ctrl).then(setOutcome);
  }, [ctrl]);
  useEffect(() => {
    // The browser may refuse to close a window it no longer counts as opened by script: the page then says so.
    if (outcome?.type === 'signed-in') window.close();
  }, [outcome]);
  if (outcome?.type === 'none') return <Redirect href="/" />;
  return (
    <Page
      title="lichess · Opening Night"
      header={{ place: { name: 'lichess' }, back: { href: '/', label: 'Back to the board' } }}
      maxWidth={STAGE_MAX}
    >
      <View style={styles.content}>
        {outcome ? (
          <PageIntro eyebrow="lichess" title={TITLES[outcome.type]}>
            {outcome.type === 'signed-in'
              ? `Signed in as ${outcome.username}. You can close this window.`
              : outcome.type === 'refused'
                ? 'lichess was not allowed to sign you in. Close this window, and try again from the person button if you like.'
                : 'lichess could not sign you in. Close this window and try again from the person button.'}
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

const TITLES = { 'signed-in': 'Signed in', refused: 'Not signed in', failed: 'Not signed in' };

let finished: Promise<SignInOutcome> | undefined;

/** `finishSignIn` for this page's address, once per page, however often React runs the effect that asks. */
const finishing = (ctrl: Controller) => (finished ??= finishSignIn(ctrl, window.location.search));

const styles = StyleSheet.create({
  content: { ...textColumn, maxWidth: 680, gap: 32 },
});
