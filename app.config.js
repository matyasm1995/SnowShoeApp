module.exports = {
  expo: {
    name: "TO Guides",
    slug: "arctic-snowshoe-guide",
    version: "1.7.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#0B0D10",
    icon: "./assets/icon.png",
    updates: {
      url: "https://u.expo.dev/32601f54-1560-4dec-b95d-5b658b010900"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    android: {
      package: "com.toguides.app",
      versionCode: 9,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B0D10"
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },
    plugins: [
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36
          }
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "TO Guides uses GPS in the background to track mountain elevation and checkpoints even when locked.",
          locationWhenInUsePermission:
            "TO Guides uses GPS to track mountain elevation and checkpoint pacing.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ],
      "expo-notifications"
    ],
    extra: {
      eas: {
        projectId: "32601f54-1560-4dec-b95d-5b658b010900"
      }
    }
  }
};