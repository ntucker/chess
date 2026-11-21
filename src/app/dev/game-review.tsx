import Head from 'expo-router/head';

import { ReviewGallery } from '@/components/dev/ReviewGallery';

/** Each state of the game review's panel, for checking them by eye. Not linked from the app. */
export default function GameReviewScreen() {
  return (
    <>
      <Head>
        <title>Game review · Opening Night</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ReviewGallery />
    </>
  );
}
