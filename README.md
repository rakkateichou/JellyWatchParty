<p align="center">
  <img src="docs/logo.png" alt="JellyWatchParty" width="400">
</p>

<p align="center">
  <strong>Watch movies together, no matter the distance.</strong>
</p>

<p align="center">
  <a href="https://github.com/rakkateichou/JellyWatchParty/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/rakkateichou/JellyWatchParty/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/Jellyfin-10.11%2B-00a4dc?style=flat-square&logo=jellyfin" alt="Jellyfin 10.11+">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
</p>

---

JellyWatchParty enables synchronized media playback for [Jellyfin](https://jellyfin.org/). It consists of a **Jellyfin Plugin** (C#) that integrates the UI and a **Session Server** (Rust) that manages rooms and synchronization via WebSocket.

This is the **Rakkate edition**, a feature-focused fork of
[TIGamingTV/JellyWatchParty](https://github.com/TIGamingTV/JellyWatchParty), itself forked from
[mhbxyz/OpenWatchParty](https://github.com/mhbxyz/OpenWatchParty). It adds:

- account-free guest invitations that open directly into the active player;
- invitations before selecting a title, with an empty player and chat while guests wait for the owner;
- persistent whole-series rooms with synchronized episode changes, play, pause and seeking;
- docked chat with saved nicknames, themes, adjustable panel brightness, per-user colours, bundled custom emotes and message replies;
- shared cursors and fading drawing trails while holding <kbd>X</kbd>;
- a WebRTC fast path with automatic WebSocket fallback and tighter clock correction;
- guest playback confinement, room revival/deletion rules and a simplified Jellyfin-native UI.

Account-free invitations use the companion
[ShareLinks fork](https://github.com/rakkateichou/jellyfin-plugin-sharelinks). The watch-party
plugin and session server still work without it, but cannot create temporary guest access.
Waiting-room invitations require the updated ShareLinks companion: the same room URL
and temporary guest account gain access when the owner starts a title. Update both
plugins together; the session server does not need a change for this feature.

Chat replies require the 1.11.0 plugin and its matching session server. Use **Reply** beside a message, type your response and send. The quoted preview can be cancelled with the × button or Escape; replies remain in room history across reconnects.

Chat panels start at 80% brightness. Open **Chat settings → Panel brightness** to dim the whole panel, including text, controls and emotes, for OLED viewing. 100% is normal brightness; 0% is near-black. The slider previews immediately and saves on this device. Earlier opacity percentages carry over to the brightness control.

Hosts and guests can hide chat with the panel's arrow and reopen it with a translucent **‹** arrow in the same position, including while waiting for a title. Hiding chat expands the player and keeps drafts and room membership intact. The player controls no longer include a separate watch-party button.

## Quick Start with the File transformation Plugin

### Users

**1. Start the session server** with Docker Compose:

```yaml
# docker-compose.yml
services:
  jwp-session:
    image: ghcr.io/rakkateichou/jwp-session-server:latest
    container_name: jwp-session
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - ALLOWED_ORIGINS=http://your-jellyfin:8096
```

```bash
docker compose up -d
```

**2. For account-free invites, add the companion ShareLinks repository:**

```
https://raw.githubusercontent.com/rakkateichou/jellyfin-plugin-sharelinks/main/manifest.json
```

Install **ShareLinks** and restart Jellyfin.

**3. Add the JellyWatchParty plugin repository** in Jellyfin: **Dashboard > Plugins > Repositories > Add**

```
https://rakkateichou.github.io/JellyWatchParty/jellyfin-plugin-repo/manifest.json
```

Then go to the **Catalog** tab, install **JellyWatchParty**, and restart Jellyfin.

For Windows Server, manual installs, and enabling the client script: see the
**[Installation Guide](https://rakkateichou.github.io/JellyWatchParty/installation/)**.

### Developers

```bash
git clone https://github.com/rakkateichou/JellyWatchParty.git
cd JellyWatchParty
just up
```

See the [Development Setup Guide](https://rakkateichou.github.io/JellyWatchParty/development/setup/) for the full workflow.

## Documentation

**[rakkateichou.github.io/JellyWatchParty](https://rakkateichou.github.io/JellyWatchParty/)** — start with
[Installation](https://rakkateichou.github.io/JellyWatchParty/installation/),
[Features](https://rakkateichou.github.io/JellyWatchParty/features/), and
[Core Structure](https://rakkateichou.github.io/JellyWatchParty/core-structure/).

## Contributing

- [Report bugs](https://github.com/rakkateichou/JellyWatchParty/issues)
- [Submit pull requests](https://github.com/rakkateichou/JellyWatchParty/pulls)
- [Contributing Guide](https://rakkateichou.github.io/JellyWatchParty/development/contributing/)

## License

MIT

## Invitation flow (1.10)

Create a room and copy its invitation before picking a title. Guests immediately get
an empty player and chat, then follow the owner's title selection automatically.
JellyWatchParty 1.10.2 and the companion ShareLinks 1.0.8 keep guest navigation inside
that player/chat view through reloads, failed joins and room closure.

The web client loads as one ordered bundle before Jellyfin's deferred application
scripts. Native playback preparation runs alongside chat connection. Reconnecting
clients fetch fresh authentication, restore membership and resynchronize with the
host; separate tabs have separate participant identities.

[Reusable Jellyfin scripts](extras/jellyfin/README.md) include Random Pick exclusions,
deployment helpers and disposable integration checks.
