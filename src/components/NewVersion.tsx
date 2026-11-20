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
    <Stage
      title="New version · Opening Night"
      board={<BoardColumnPlaceholder />}
      program={
        <Stack gap="4" align="start" style={styles.program}>
          <StatusHeadline eyebrow="Site updated" title={NEW_VERSION} detail={detail} />
          <Button onPress={reload}>Reload</Button>
        </Stack>
      }
    />
  );
}

/**
 * Rethrows a screen's `error`, as if this weren't there, unless the site has
 * a newer build than the page (which is why a screen's file goes missing):
 * then NewVersionPage. Suspends while it checks the site.
 */
export function ScreenFailure({ error }: { readonly error: unknown }) {
  // A WeakMap keys on objects only, and only errors come from a missing file.
  if (typeof error !== 'object' || error === null) throw error;
  if (!(use(explainOnce(error)) instanceof NewVersionError)) throw error;
  return <NewVersionPage detail="Reload to get it. Your settings and lesson progress stay." />;
}

/** `use` needs the same promise on every render that asks. */
const explained = new WeakMap<object, Promise<unknown>>();
function explainOnce(error: object) {
  let explaining = explained.get(error);
  if (!explaining) explained.set(error, (explaining = explainLoadFailure(error)));
  return explaining;
}

const styles = StyleSheet.create({
  program: { minHeight: 200 },
});
