const fs = require('fs');
const path = require('path');

const googleServicesPath = path.join(__dirname, 'google-services.json');
const hasGoogleServices = fs.existsSync(googleServicesPath);

module.exports = {
  expo: {
    name: "TO Guides",
    slug: "arctic-snowshoe-guide",
    version: "1.8.0",
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
      versionCode: 12,
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {}),
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#131A22"
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
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/icon.png",
      name: "TO Guides",
      shortName: "TO Guides",
      themeColor: "#0B0D10",
      backgroundColor: "#0B0D10",
      display: "standalone"
    },
    extra: {
      eas: {
        projectId: "32601f54-1560-4dec-b95d-5b658b010900"
      }
    }
  }
};