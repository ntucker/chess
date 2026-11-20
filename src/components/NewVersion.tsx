import { AsyncBoundary } from '@data-client/react';
import { Button, Stack } from '@reactive/silk-native';
import { use } from 'react';
import { StyleSheet } from 'react-native';

import { StatusHeadline } from '@/components/GameStatus';
import { BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { explainLoadFailure, NEW_VERSION, NewVersionError, reload } from '@/files/newVersion';

/**
 * The page in place of one that couldn't load because a newer deploy removed
 * a file it needed: the stage with an empty board, and a reload. `detail`
 * says what reloading brings back.
 */
export function NewVersionPage({ detail }: { readonly detail: string }) {
  return (
    <ReloadPage tab="New version" eyebrow="Site updated" title={NEW_VERSION} detail={detail} />
  );
}

/**
 * A screen that failed, in place of the whole app: NewVersionPage when the
 * site has a newer build than the page (which is why a screen's file goes
 * missing), or else the error with a reload. Shows nothing while it checks
 * the site.
 */
export function ScreenFailure({ error }: { readonly error: unknown }) {
  // Anything can be thrown, but AsyncBoundary drops a falsy one and the page
  // shows an Error's message.
  const failure = error instanceof Error ? error : new Error(String(error));
  return (
    <AsyncBoundary fallback={null} errorComponent={ScreenErrorPage}>
      <NewVersionOrThrow error={failure} />
    </AsyncBoundary>
  );
}

function NewVersionOrThrow({ error }: { readonly error: Error }) {
  if (!(use(explainOnce(error)) instanceof NewVersionError)) throw error;
  return <NewVersionPage detail="Reload to get it. Your settings and lesson progress stay." />;
}

/** Any other failure of a screen. */
function ScreenErrorPage({ error }: { readonly error: Error }) {
  return (
    <ReloadPage
      tab="Error"
      eyebrow="Opening Night"
      title="Curtain stays down."
      detail={error.message || 'Something went wrong.'}
    />
  );
}

/** The stage with an empty board, a headline and a reload; `tab` names the browser tab. */
function ReloadPage({
  tab,
  eyebrow,
  title,
  detail,
}: {
  readonly tab: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <Stage
      title={`${tab} · Opening Night`}
      board={<BoardColumnPlaceholder />}
      program={
        <Stack gap="4" align="start" style={styles.program}>
          <StatusHeadline eyebrow={eyebrow} title={title} detail={detail} />
          <Button onPress={reload}>Reload</Button>
        </Stack>
      }
    />
  );
}

/** `use` needs the same promise on every render that asks. */
const explained = new WeakMap<Error, Promise<unknown>>();
function explainOnce(error: Error) {
  let explaining = explained.get(error);
  if (!explaining) explained.set(error, (explaining = explainLoadFailure(error)));
  return explaining;
}

const styles = StyleSheet.create({
  program: { minHeight: 200 },
});
