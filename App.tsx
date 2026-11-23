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
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
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

function AppShell() {
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>('ScheduleHome');
  const { trackedRoute } = useTracking();
  const { setupChecked, needsSetup, selectManualRoute } = useActiveTour();

  useEffect(() => {
    // 1. Notification tapped when app is open or in background
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.tourKey) {
        if (navRef.isReady()) {
          navRef.navigate('MainTabs', {
            screen: 'Schedule',
            params: { screen: 'TourOverview' },
          });
        }
      } else if (data?.targetDateIso) {
        if (navRef.isReady()) {
          navRef.navigate('MainTabs', {
            screen: 'Schedule',
            params: { screen: 'ScheduleHome' },
          });
        }
      }
    });

    // 2. Notification tapped when app was completely killed / cold launched
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification.request.content.data?.tourKey) {
        if (navRef.isReady()) {
          navRef.navigate('MainTabs', {
            screen: 'Schedule',
            params: { screen: 'TourOverview' },
          });
        }
      }
    });

    return () => sub.remove();
  }, []);

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
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  return (
    <SafeAreaProvider>
      <ActiveTourProvider>
        <TrackingProvider>
          <StatusBar style="light" />
          <AppShell />
        </TrackingProvider>
      </ActiveTourProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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