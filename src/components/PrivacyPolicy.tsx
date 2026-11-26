import { Stack, Text } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/ExternalLink';
import { Page } from '@/components/Page';
import { PageIntro, textColumn } from '@/components/PageIntro';
import { SOURCE_URL } from '@/components/SourceLink';
import { STAGE_MAX } from '@/components/Stage';

/** When the policy below last changed. */
const UPDATED = 'November 26, 2026';

const LICHESS_PRIVACY = 'https://lichess.org/privacy';

const GITHUB_PRIVACY =
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';

/**
 * The privacy policy (/privacy), which Google Play's listing links to. Keep it
 * true to what the app does: a new network request or stored value may need a
 * line here and a change to the Data safety answers in `store/listing.md`.
 */
export function PrivacyPolicy() {
  return (
    <Page
      title="Privacy · Opening Night"
      header={{ place: { name: 'Privacy' }, back: { href: '/', label: 'Back to the board' } }}
      maxWidth={STAGE_MAX}
    >
      <View style={styles.content}>
        <PageIntro eyebrow={`Updated ${UPDATED}`} title="Privacy">
          Opening Night collects nothing about you. It has no accounts of its own, ads, analytics or
          tracking, and it sends nothing you do to anyone, except to lichess if you sign in with it.
        </PageIntro>
        <Section heading="What stays on your device">
          Your settings, your progress through the lessons and the opportunities you save are saved
          on your device, in the app&apos;s own storage (or, on the web, the browser&apos;s). They
          never leave it. Uninstalling the app, or clearing the site&apos;s data in your browser,
          deletes them.
        </Section>
        <Section heading="Signing in with lichess">
          You can sign in with your lichess account, so the opportunity finder counts real lichess
          games instead of estimating them. You sign in on lichess&apos;s own page; the app gets
          your lichess username and a token that lets it ask lichess&apos;s opening explorer, and
          keeps both on your device. On the website, starting a sign-in also keeps a one-time check
          code on your device, which the app uses only to finish that sign-in, within ten minutes.
          While you are signed in, the app sends lichess each position it asks about, with that
          token, and nothing else. Signing out deletes both from your device and asks lichess to
          revoke the token. lichess handles these requests under its{' '}
          <ExternalLink url={LICHESS_PRIVACY}>privacy policy</ExternalLink>.
        </Section>
        <Section heading="What the app downloads">
          The engines and lessons run on your device. The Android app comes with them, except Full
          Stockfish, the strongest opponent: the first time you pick it, the app downloads it from
          this website, which GitHub Pages hosts, and keeps it. On the web, they load from this
          website like the rest of the page. Like any web server, GitHub may log the address your
          device connects from when it asks for a file; its{' '}
          <ExternalLink url={GITHUB_PRIVACY}>privacy statement</ExternalLink> says how it handles
          that.
        </Section>
        <Section heading="Links">
          Links to opening guides and to the source code open in your browser, under those
          sites&apos; own policies.
        </Section>
        <Section heading="Children">
          The app collects no information from anyone, including children under 13. Signing in with
          lichess, described above, is the only time it sends anything about you, and only to
          lichess.
        </Section>
        <Section heading="Questions">
          Ask on the app&apos;s{' '}
          <ExternalLink url={`${SOURCE_URL}/issues`}>GitHub issues</ExternalLink> page. If this
          policy changes, the new version will be on this page with a new date.
        </Section>
      </View>
    </Page>
  );
}

function Section({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}) {
  return (
    <Stack gap="2">
      <Text role="heading" accessibilityRole="header">
        {heading}
      </Text>
      <Text role="body">{children}</Text>
    </Stack>
  );
}

const styles = StyleSheet.create({
  // Narrower than the column: paragraphs of prose read best in shorter lines.
  content: { ...textColumn, maxWidth: 680, gap: 32 },
});
