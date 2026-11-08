const { withAndroidManifest } = require('@expo/config-plugins');

const HJELP_113_PACKAGE = 'no.norskluftambulanse.hjelp113';

const withEmergencyVisibility = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.queries = [
      {
        package: [{ $: { 'android:name': HJELP_113_PACKAGE } }],
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'android-app' } }],
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
            data: [{ $: { 'android:scheme': 'tel' } }],
          },
        ],
      },
    ];
    return mod;
  });

module.exports = ({ config }) =>
  withEmergencyVisibility({
    ...config,
    name: 'Arctic Snowshoe',
    slug: 'arctic-snowshoe-guide',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: '#000000',
    android: {
      ...config.android,
      package: 'no.tromso.snowshoe.guide',
      backgroundColor: '#000000',
      permissions: [],
    },
    extra: {
      ...config.extra,
      eas: {
        projectId: '32601f54-1560-4dec-b95d-5b658b010900',
      },
    },
  });