import Head from 'expo-router/head';

import { EndingGallery } from '@/components/dev/EndingGallery';

/** Every way a game ends, for checking them by eye. Not linked from the app. */
export default function EndingsScreen() {
  return (
    <>
      <Head>
        <title>Game endings · Opening Night</title>
        <meta name="robots" content="noindex" />
      </Head>
      <EndingGallery />
    </>
  );
}
