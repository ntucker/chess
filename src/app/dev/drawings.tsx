import Head from 'expo-router/head';

import { DrawingGallery } from '@/components/dev/DrawingGallery';

/** Every board drawing on one page, for checking them by eye. Not linked from the app. */
export default function DrawingsScreen() {
  return (
    <>
      <Head>
        <title>Board drawings · Opening Night</title>
        <meta name="robots" content="noindex" />
      </Head>
      <DrawingGallery />
    </>
  );
}
