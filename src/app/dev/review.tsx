import Head from 'expo-router/head';

import { ConversionReview } from '@/components/dev/ConversionReview';

/** The Caro-Kann lesson's notes beside the study's words, for reviewing an import. Not linked from the app. */
export default function ReviewScreen() {
  return (
    <>
      <Head>
        <title>Conversion review · Opening Night</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ConversionReview id="caro-kann" />
    </>
  );
}
