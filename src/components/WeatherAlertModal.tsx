import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle, ExternalLink, X } from 'lucide-react-native';

import {
  alertSeverityColors,
  type WeatherAlertItem,
} from '../services/alertsService';
import { colors, touchTarget } from '../theme';

interface Props {
  alert: WeatherAlertItem | null;
  onClose: () => void;
}

const DEFAULT_YR_WARNINGS_URL = 'https://www.yr.no/en/warnings';

export function WeatherAlertModal({ alert, onClose }: Props) {
  if (!alert) return null;

  const palette = alertSeverityColors(alert.riskColor);

  const openOnYr = async () => {
    const url = alert.webUrl && alert.webUrl.startsWith('http')
      ? alert.webUrl
      : DEFAULT_YR_WARNINGS_URL;
    try {
      await Linking.openURL(url);
    } catch {
      // OS fallback
    }
  };

  return (
    <Modal
      visible={alert !== null}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <AlertTriangle color={palette.color} size={20} />
              <Text style={[styles.title, { color: palette.color }]} numberOfLines={2}>
                {alert.event}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View
              style={[
                styles.summaryBox,
                { backgroundColor: palette.bg, borderColor: palette.color },
              ]}
            >
              <Text style={[styles.severityPill, { color: palette.color }]}>
                {alert.severity.toUpperCase()}
              </Text>
              {alert.validRangeLabel ? (
                <Text style={styles.rangeText}>{alert.validRangeLabel}</Text>
              ) : null}
              {alert.area ? <Text style={styles.areaText}>{alert.area}</Text> : null}
              {alert.headline && alert.headline !== alert.area ? (
                <Text style={styles.headlineText} selectable>
                  {alert.headline}
                </Text>
              ) : null}
            </View>

            {alert.description ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>DESCRIPTION</Text>
                <Text style={styles.sectionBody} selectable>
                  {alert.description}
                </Text>
              </View>
            ) : null}

            {alert.consequences ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>CONSEQUENCES</Text>
                <Text style={styles.sectionBody} selectable>
                  {alert.consequences}
                </Text>
              </View>
            ) : null}

            {alert.instruction ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>RECOMMENDED ACTIONS</Text>
                <Text style={styles.sectionBody} selectable>
                  {alert.instruction}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void openOnYr()}
              style={({ pressed }) => [touchTarget, styles.yrBtn, pressed && styles.pressed]}
            >
              <ExternalLink color={colors.background} size={18} />
              <Text style={styles.yrBtnText}>Open Official Warning on Yr.no</Text>
            </Pressable>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 14,
    paddingBottom: 28,
    gap: 10,
  },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  severityPill: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  rangeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  areaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  headlineText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  sectionLabel: {
    color: colors.accentSoft,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  yrBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  yrBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
});
