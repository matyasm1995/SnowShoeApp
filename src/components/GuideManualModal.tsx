import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BookOpen, ChevronDown, ChevronUp, X } from 'lucide-react-native';

import { GUIDE_MANUAL_SECTIONS } from '../data/guideManual';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function GuideManualModal({ visible, onClose }: Props) {
  const [openId, setOpenId] = useState<string | null>(GUIDE_MANUAL_SECTIONS[0]?.id ?? null);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <BookOpen color={colors.accent} size={20} />
              <Text style={styles.title}>Guide Manual & Features</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.intro}>
              Available 100% offline. Tap any section below to expand tips and workflows for guiding with TO Guides.
            </Text>

            {GUIDE_MANUAL_SECTIONS.map((section) => {
              const isOpen = openId === section.id;
              return (
                <View key={section.id} style={[styles.card, isOpen && styles.cardOpen]}>
                  <Pressable
                    onPress={() => setOpenId(isOpen ? null : section.id)}
                    style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
                  >
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.cardTitle}>{section.title}</Text>
                      <Text style={styles.cardSummary}>{section.summary}</Text>
                    </View>
                    {isOpen ? (
                      <ChevronUp color={colors.accent} size={20} />
                    ) : (
                      <ChevronDown color={colors.textSecondary} size={20} />
                    )}
                  </Pressable>

                  {isOpen ? (
                    <View style={styles.itemsList}>
                      {section.items.map((item, idx) => (
                        <View key={idx} style={styles.bulletRow}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 14,
    paddingBottom: 32,
    gap: 10,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardOpen: {
    borderColor: colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  cardSummary: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  itemsList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
});
