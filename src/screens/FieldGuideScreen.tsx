import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { FIELD_GUIDE } from '../data/fieldGuide';
import { colors, sharedStyles, touchTarget } from '../theme';

export function FieldGuideScreen() {
  const [openId, setOpenId] = useState<string | null>(FIELD_GUIDE[0]?.id ?? null);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <Text style={sharedStyles.secondary}>
        Tap a card. Read the points at arm’s length, then put the phone away.
      </Text>
      {FIELD_GUIDE.map((card) => {
        const open = openId === card.id;
        return (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpenId(open ? null : card.id)}
            style={({ pressed }) => [
              touchTarget,
              styles.card,
              open && styles.cardOpen,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.inner}>
              <View style={styles.titleRow}>
                <View style={styles.titles}>
                  <Text style={styles.title}>{card.title}</Text>
                  {card.norwegianName ? (
                    <Text style={styles.norwegian}>{card.norwegianName}</Text>
                  ) : null}
                </View>
                {open ? (
                  <ChevronUp color={colors.accent} size={28} />
                ) : (
                  <ChevronDown color={colors.textSecondary} size={28} />
                )}
              </View>
              {open ? (
                card.points.map((point) => (
                  <Text key={point} style={styles.point}>
                    {point}
                  </Text>
                ))
              ) : (
                <Text style={styles.teaser} numberOfLines={2}>
                  {card.points[0]}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardOpen: {
    borderColor: colors.accent,
  },
  inner: {
    width: '100%',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titles: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  norwegian: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  teaser: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  point: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
