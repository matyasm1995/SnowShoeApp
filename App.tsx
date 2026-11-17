import './src/services/backgroundTracking';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  type NavigatorScreenParams,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
    card: colors.background,
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
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
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
  return (
    <Tab.Navigator
      initialRouteName="Schedule"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerRight: () => <EmergencyHeaderButton />,
        headerRightContainerStyle: { paddingRight: 12 },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
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
          tabBarIcon: ({ color, size }) => <CalendarSync color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Weather"
        component={WeatherScreen}
        options={{
          title: 'Weather & Forecast',
          tabBarLabel: 'Weather',
          tabBarIcon: ({ color, size }) => <CloudSun color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Roster"
        component={RosterScreen}
        options={{
          title: 'Operations & Roster',
          tabBarLabel: 'Roster',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="FieldGuide"
        component={FieldGuideScreen}
        options={{
          title: 'Field Guide',
          tabBarLabel: 'Guide',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Preferences',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AppShell() {
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>('ScheduleHome');
  const { trackedRoute } = useTracking();
  const { selectManualRoute } = useActiveTour();

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
            headerTitleStyle: { fontWeight: '700', fontSize: 18 },
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
  rootWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  redCrossBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});