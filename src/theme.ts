import { StyleSheet } from 'react-native';

export const colors = {
  background: '#000000',
  surface: '#121212',
  border: '#27272A',
  text: '#FFFFFF',
  textSecondary: '#A1A1AA',
  accent: '#38BDF8',
  danger: '#EF4444',
} as const;

export const spacing = {
  screen: 16,
  card: 16,
  gap: 12,
} as const;

/** Glove-friendly minimum for every button, toggle, and clickable card. */
export const touchTarget = {
  minHeight: 56,
  minWidth: 56,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.screen,
    paddingBottom: 32,
    gap: spacing.gap,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.card,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  body: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 26,
  },
  secondary: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
