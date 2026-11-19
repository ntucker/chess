import { Stack, Text, useTheme } from "@reactive/silk-native";
import { StyleSheet, View } from "react-native";

import { Eyebrow } from "@/components/Eyebrow";
import type { ShownNote } from "@/lesson/view";

interface Props {
  readonly title: string;
  readonly notes: readonly ShownNote[];
}

/** What the guide says about the position, or about the move being previewed. */
export function IdeaCard({ title, notes }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Stack gap="3">
      <Eyebrow>{title}</Eyebrow>
      {notes.length ? (
        <View style={[styles.notes, { borderColor: color.tones.accent.solid }]}>
          {notes.map(({ note }, n) => (
            <Text key={n} role="body">
              {note.text}
            </Text>
          ))}
        </View>
      ) : (
        <Text role="bodySm" tone="secondary">
          No notes here. Point at a move to see what it aims for.
        </Text>
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  notes: { borderLeftWidth: 2, paddingLeft: 14, gap: 8 },
});
