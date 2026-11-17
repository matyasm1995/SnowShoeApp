module.exports = {
  expo: {
    name: "Arctic Guide",
    slug: "arctic-snowshoe-guide",
    version: "1.4.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#000000",
    android: {
      package: "no.arcticguide.snowshoe",
      adaptiveIcon: {
        backgroundColor: "#000000"
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ]
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Arctic Guide uses GPS in the background to track mountain elevation and checkpoint pacing even when your phone is locked.",
          locationWhenInUsePermission:
            "Arctic Guide uses GPS offline to track mountain elevation and checkpoint pacing.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "32601f54-1560-4dec-b95d-5b658b010900"
      }
    }
  }
};