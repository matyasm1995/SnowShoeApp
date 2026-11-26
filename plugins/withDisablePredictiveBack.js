const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Opt out of Android 16 (API 36) Predictive Back so React Native 0.76's
 * ReactActivity.onBackPressed() continues to receive hardware/gesture back
 * events and dispatch them to React Navigation and Modal.onRequestClose.
 */
module.exports = function withDisablePredictiveBack(config) {
  return withAndroidManifest(config, (modConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults
    );
    mainApplication.$['android:enableOnBackInvokedCallback'] = 'false';
    return modConfig;
  });
};
