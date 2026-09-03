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
- persistent whole-series rooms with synchronized episode changes, play, pause and seeking;
- docked chat with saved nicknames, themes, per-user colours and bundled custom emotes;
- shared cursors and fading drawing trails while holding <kbd>X</kbd>;
- a WebRTC fast path with automatic WebSocket fallback and tighter clock correction;
- guest playback confinement, room revival/deletion rules and a simplified Jellyfin-native UI.

Account-free invitations use the companion
[ShareLinks fork](https://github.com/rakkateichou/jellyfin-plugin-sharelinks). The watch-party
plugin and session server still work without it, but cannot create temporary guest access.

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
