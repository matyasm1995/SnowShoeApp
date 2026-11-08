import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { BookOpen, CloudSun, Users } from 'lucide-react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FieldGuideScreen } from './src/screens/FieldGuideScreen';
import { RosterScreen } from './src/screens/RosterScreen';
import { WeatherScreen } from './src/screens/WeatherScreen';
import { colors } from './src/theme';

export type RootTabParamList = {
  Weather: undefined;
  FieldGuide: undefined;
  Roster: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

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

export default function App() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700', fontSize: 18 },
            headerShadowVisible: false,
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
              fontSize: 11,
              fontWeight: '700',
            },
            tabBarHideOnKeyboard: true,
          }}
        >
          <Tab.Screen
            name="Weather"
            component={WeatherScreen}
            options={{
              title: 'Weather & Conditions',
              tabBarLabel: 'Weather',
              tabBarIcon: ({ color, size }) => <CloudSun color={color} size={size} />,
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
            name="Roster"
            component={RosterScreen}
            options={{
              title: 'Operations & Roster',
              tabBarLabel: 'Roster',
              tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
