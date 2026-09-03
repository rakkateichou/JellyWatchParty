(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const app = JWP.app = JWP.app || {};

  const removePauseArtifacts = () => {
    document.documentElement?.classList?.remove('pause-screen-active');
    document.getElementById('pause-screen-overlay')?.remove();
    document.getElementById('pause-screen-style')?.remove();
  };

  const disablePauseSplash = () => {
    const enhanced = window.JellyfinEnhanced;
    if (enhanced?.currentSettings) {
      enhanced.currentSettings.pauseScreenEnabled = false;
    }
    if (enhanced?.pauseScreenInstance) {
      try {
        enhanced.pauseScreenInstance.destroy?.();
      } catch (err) {
        console.warn('[JellyWatchParty] Could not destroy the pause splash cleanly:', err);
      }
      enhanced.pauseScreenInstance = null;
    }
    // Jellyfin Enhanced can finish loading after the watch-party client,
    // especially for accountless ShareLinks guests. Replace its initializer
    // whenever it is present; the lifecycle watchdog repeats this operation.
    if (enhanced && typeof enhanced.initializePauseScreen === 'function') {
      enhanced.initializePauseScreen = () => {
        removePauseArtifacts();
      };
    }
    removePauseArtifacts();
  };

  Object.assign(app, { disablePauseSplash });
})();
