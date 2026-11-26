import './src/services/backgroundTracking';
import './src/services/backgroundScheduleSync';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  type NavigatorScreenParams,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {
  BookOpen,
  CalendarSync,
  CloudSun,
  Plus,
  Settings,
  Users,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingTrackingBubble } from './src/components/FloatingTrackingBubble';
import { ActiveTourProvider, useActiveTour } from './src/context/ActiveTourContext';
import { TrackingProvider, useTracking } from './src/context/TrackingContext';
import { EmergencyHelpScreen } from './src/screens/EmergencyHelpScreen';
import { FieldGuideScreen } from './src/screens/FieldGuideScreen';
import { RosterScreen } from './src/screens/RosterScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  TourOverviewScreen,
  type ScheduleStackParamList,
} from './src/screens/TourOverviewScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { WeatherScreen } from './src/screens/WeatherScreen';
import { WelcomeSetupScreen } from './src/screens/WelcomeSetupScreen';
import { checkAndDownloadUpdateSilently } from './src/services/appUpdateService';
import { registerBackgroundScheduleSync } from './src/services/backgroundScheduleSync';
import { colors } from './src/theme';

export type RootTabParamList = {
  Schedule: NavigatorScreenParams<ScheduleStackParamList> | undefined;
  Weather: undefined;
  Roster: undefined;
  FieldGuide: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<RootTabParamList> | undefined;
  EmergencyHelp: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const navRef = createNavigationContainerRef<RootStackParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

function EmergencyHeaderButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Emergency 113 Help"
      hitSlop={10}
      onPress={() => {
        if (navRef.isReady()) {
          navRef.navigate('EmergencyHelp');
        }
      }}
      style={({ pressed }) => [styles.redCrossBtn, pressed && styles.pressed]}
    >
      <Plus color={colors.text} size={20} strokeWidth={3.5} />
    </Pressable>
  );
}

function ScheduleStackNavigator() {
  return (
    <ScheduleStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => <EmergencyHeaderButton />,
      }}
    >
      <ScheduleStack.Screen
        name="ScheduleHome"
        component={ScheduleScreen}
        options={{ title: 'Company Schedule' }}
      />
      <ScheduleStack.Screen
        name="TourOverview"
        component={TourOverviewScreen}
        options={{ title: 'Tour Overview' }}
      />
      <ScheduleStack.Screen
        name="DetailedWeather"
        component={WeatherScreen}
        options={{ title: 'Detailed Weather' }}
      />
      <ScheduleStack.Screen
        name="Tracking"
        component={TrackingScreen}
        options={{ title: 'Trail & Gate Tracking' }}
      />
    </ScheduleStack.Navigator>
  );
}

function MainTabsNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      initialRouteName="Schedule"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        headerShadowVisible: false,
        headerRight: () => <EmergencyHeaderButton />,
        headerRightContainerStyle: { paddingRight: 14 },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Schedule"
        component={ScheduleStackNavigator}
        options={{
          headerShown: false,
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color }) => <CalendarSync color={color} size={25} />,
        }}
      />
      <Tab.Screen
        name="Weather"
        component={WeatherScreen}
        options={{
          title: 'Weather & Forecast',
          tabBarLabel: 'Weather',
          tabBarIcon: ({ color }) => <CloudSun color={color} size={25} />,
        }}
      />
      <Tab.Screen
        name="Roster"
        component={RosterScreen}
        options={{
          title: 'Operations & Roster',
          tabBarLabel: 'Roster',
          tabBarIcon: ({ color }) => <Users color={color} size={25} />,
        }}
      />
      <Tab.Screen
        name="FieldGuide"
        component={FieldGuideScreen}
        options={{
          title: 'Field Guide',
          tabBarLabel: 'Guide',
          tabBarIcon: ({ color }) => <BookOpen color={color} size={25} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Preferences',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings color={color} size={25} />,
        }}
      />
    </Tab.Navigator>
  );
}

function parseIsoDateLocalNoon(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = parseInt(m[1] ?? '', 10);
  const month = parseInt(m[2] ?? '', 10);
  const day = parseInt(m[3] ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function AppShell() {
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>('ScheduleHome');
  const [navReady, setNavReady] = useState(false);
  const [pendingNotifData, setPendingNotifData] = useState<Record<string, unknown> | null>(null);
  const { trackedRoute } = useTracking();
  const {
    setupChecked,
    needsSetup,
    selectManualRoute,
    selectDate,
    selectAssignment,
    selectDateAndAssignment,
    syncNow,
  } = useActiveTour();

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        try {
          const params = new URLSearchParams(window.location.search);
          const iso = params.get('targetDateIso');
          if (iso) {
            setPendingNotifData({
              type: 'tomorrow_dispatch',
              targetDateIso: iso,
              _handledAt: Date.now(),
            });
            params.delete('targetDateIso');
            const qs = params.toString();
            const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
            window.history.replaceState({}, '', cleanUrl);
          }
        } catch {}
      }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const onSwMessage = (event: MessageEvent) => {
          const msg = event.data as { type?: string; targetDateIso?: string } | null;
          if (msg?.type === 'OPEN_SCHEDULE_DATE') {
            setPendingNotifData({
              type: 'tomorrow_dispatch',
              targetDateIso: msg.targetDateIso || '',
              _handledAt: Date.now(),
            });
          }
        };
        navigator.serviceWorker.addEventListener('message', onSwMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      return;
    }

    // 1. Notification tapped when app is open or in background
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && typeof data === 'object') {
        setPendingNotifData({ ...(data as Record<string, unknown>), _handledAt: Date.now() });
      }
    });

    // 2. Notification tapped when app was completely killed / cold launched
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (data && typeof data === 'object') {
        setPendingNotifData({ ...(data as Record<string, unknown>), _handledAt: Date.now() });
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingNotifData || !setupChecked || needsSetup || !navReady || !navRef.isReady()) {
      return;
    }

    const data = pendingNotifData;
    setPendingNotifData(null);

    if (data.tourKey || data.openReport === true || data.type === 'trip_report') {
      const parsedDate =
        typeof data.dateIso === 'string' ? parseIsoDateLocalNoon(data.dateIso) : null;
      const targetTourIdx =
        typeof data.tourIdx === 'number' && Number.isFinite(data.tourIdx) && data.tourIdx >= 0
          ? data.tourIdx
          : undefined;

      if (parsedDate && targetTourIdx !== undefined) {
        selectDateAndAssignment(parsedDate, targetTourIdx);
      } else {
        if (parsedDate) {
          selectDate(parsedDate);
        }
        if (targetTourIdx !== undefined) {
          selectAssignment(targetTourIdx);
        }
      }
      navRef.navigate('MainTabs', {
        screen: 'Schedule',
        params: {
          screen: 'TourOverview',
          params: {
            openReport: true,
            reportTriggerId: Date.now(),
            targetTourIdx,
          },
        },
      });
      return;
    }

    if (typeof data.targetDateIso === 'string' || data.type === 'tomorrow_dispatch') {
      const parsedDate =
        typeof data.targetDateIso === 'string'
          ? parseIsoDateLocalNoon(data.targetDateIso)
          : null;
      if (parsedDate) {
        selectDate(parsedDate);
      } else {
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        selectDate(tmr);
      }
      navRef.navigate('MainTabs', {
        screen: 'Schedule',
        params: { screen: 'ScheduleHome' },
      });
      void syncNow().catch(() => {});
    }
  }, [
    pendingNotifData,
    setupChecked,
    needsSetup,
    navReady,
    selectDate,
    selectAssignment,
    selectDateAndAssignment,
    syncNow,
  ]);

  useEffect(() => {
    if (setupChecked && !needsSetup) {
      void registerBackgroundScheduleSync();
    }
  }, [setupChecked, needsSetup]);

  useEffect(() => {
    void checkAndDownloadUpdateSilently(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkAndDownloadUpdateSilently(false);
      }
    });
    return () => sub.remove();
  }, []);

  if (!setupChecked) {
    return (
      <View style={styles.splashWrap}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (needsSetup) {
    return <WelcomeSetupScreen />;
  }

  return (
    <NavigationContainer
      ref={navRef}
      theme={navigationTheme}
      onReady={() => {
        setNavReady(true);
        setCurrentRouteName(navRef.getCurrentRoute()?.name);
      }}
      onStateChange={() => {
        setCurrentRouteName(navRef.getCurrentRoute()?.name);
      }}
    >
      <View style={styles.rootWrap}>
        <RootStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <RootStack.Screen
            name="MainTabs"
            component={MainTabsNavigator}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="EmergencyHelp"
            component={EmergencyHelpScreen}
            options={{
              title: 'Emergency · 113',
              presentation: 'modal',
            }}
          />
        </RootStack.Navigator>

        <FloatingTrackingBubble
          hidden={currentRouteName === 'Tracking' || currentRouteName === 'EmergencyHelp'}
          onPress={() => {
            if (trackedRoute) {
              selectManualRoute(trackedRoute.id);
            }
            if (navRef.isReady()) {
              navRef.navigate('MainTabs', {
                screen: 'Schedule',
                params: { screen: 'Tracking' },
              });
            }
          }}
        />
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void SystemUI.setBackgroundColorAsync(colors.background);
      return;
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const content = (
    <SafeAreaProvider>
      <ActiveTourProvider>
        <TrackingProvider>
          <StatusBar style="light" />
          <AppShell />
        </TrackingProvider>
      </ActiveTourProvider>
    </SafeAreaProvider>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webPhoneShell}>{content}</View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    backgroundColor: '#050608',
    alignItems: 'center',
  },
  webPhoneShell: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  splashWrap: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rootWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  redCrossBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});