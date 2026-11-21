import { Stack, Text } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { ExternalLink } from '@/components/ExternalLink';
import { Page } from '@/components/Page';
import { STAGE_MAX } from '@/components/Stage';
import { fonts } from '@/theme/theme';

/** When the policy below last changed. */
const UPDATED = 'November 21, 2026';

const GITHUB_PRIVACY =
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';
const ISSUES = 'https://github.com/ntucker/chess/issues';

/**
 * The privacy policy, at /privacy: Google Play links to it from the app's
 * store listing. Keep it true to what the app does; a new network request or
 * stored value may need a line here and a change to Play's Data safety form.
 */
export default function PrivacyRoute() {
  return (
    <Page
      title="Privacy · Opening Night"
      header={{ place: { name: 'Privacy' }, back: { href: '/', label: 'Back to the board' } }}
      maxWidth={STAGE_MAX}
    >
      <View style={styles.content}>
        <Stack gap="2">
          <Eyebrow>Updated {UPDATED}</Eyebrow>
          <Text role="headingXl" accessibilityRole="header" style={styles.title}>
            Privacy
          </Text>
          <Text role="body" tone="secondary">
            Opening Night collects nothing about you. It has no accounts, ads, analytics or
            tracking, and it sends nothing you do to anyone.
          </Text>
        </Stack>
        <Section heading="What stays on your device">
          Your settings and your progress through the lessons are saved on your device, in the
          app&apos;s own storage (or, on the web, the browser&apos;s). They never leave it.
          Uninstalling the app, or clearing the site&apos;s data in your browser, deletes them.
        </Section>
        <Section heading="What the app downloads">
          The engines and lessons come with the app and run on your device. The one exception is
          Full Stockfish, the strongest opponent: the first time you pick it, the app downloads it
          from this website, which GitHub Pages hosts, and keeps it. Like any web server, GitHub may
          log the address your device connects from when it asks for a file; its{' '}
          <ExternalLink url={GITHUB_PRIVACY}>privacy statement</ExternalLink> says how it handles
          that.
        </Section>
        <Section heading="Links">
          Links to opening guides and to the source code open in your browser, under those
          sites&apos; own policies.
        </Section>
        <Section heading="Children">
          The app is for chess players of any age and collects no information from anyone, children
          included.
        </Section>
        <Section heading="Questions">
          Ask on the app&apos;s <ExternalLink url={ISSUES}>GitHub issues</ExternalLink> page. If
          this policy changes, the new version will be on this page with a new date.
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
  content: { width: '100%', maxWidth: 680, gap: 32, paddingTop: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.display },
});
