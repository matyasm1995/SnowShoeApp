module.exports = {
  expo: {
    name: "Arctic Guide",
    slug: "arctic-snowshoe-guide",
    version: "1.3.0",
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
        "ACCESS_FINE_LOCATION"
      ]
    },
    plugins: [
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Arctic Guide uses GPS offline to track mountain elevation and checkpoint pacing."
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "5993b7b9-52d7-4f8f-928b-cb426be9d944"
      }
    }
  }
};