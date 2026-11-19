import { StyleSheet } from 'react-native';

export const colors = {
  // Softer dark-slate background & card surfaces (less eye-straining in low light)
  background: '#0B0D10',
  surface: '#15181E',
  surfaceElevated: '#1D2128',
  border: '#2A2F3A',
  borderSubtle: '#1F242D',
  text: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Tromsø Outdoor primary orange accent
  accent: '#F97316',
  accentSoft: '#FB923C',
  accentDarkBg: '#2E1508',

  // Ice blue strictly for cold / snow / water data
  ice: '#38BDF8',
  iceDarkBg: '#08283B',

  // Status highlights
  success: '#4ADE80',
  successDarkBg: '#052E16',
  warning: '#FACC15',
  warningDarkBg: '#3A2004',
  danger: '#EF4444',
  dangerDarkBg: '#3B0D0D',
} as const;

export const spacing = {
  screen: 14,
  card: 14,
  gap: 10,
} as const;

export const touchTarget = {
  minHeight: 52,
  minWidth: 52,
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
    borderRadius: 14,
    padding: spacing.card,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  secondary: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});