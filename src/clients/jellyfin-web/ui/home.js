(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const { HOME_SECTION_ID } = JWP.constants;

  // Room discovery belongs in the watch-party panel's compact Available Rooms
  // list. Keep this hook as a cleanup pass because older cached client code may
  // already have inserted the former portrait-card shelf into the SPA home page.
  const renderHomeWatchParties = () => {
    const section = document.getElementById(HOME_SECTION_ID);
    if (section) section.remove();
  };

  Object.assign(ui, { renderHomeWatchParties });
})();
