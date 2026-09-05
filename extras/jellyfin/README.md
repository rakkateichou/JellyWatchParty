# Jellyfin companion scripts

`random_pick_watching_row.js` is the JavaScript Injector entry for Random Pick.
It excludes the movie and series IDs actually displayed in Continue Watching and
Next Up, including episode-to-series lookups. If no eligible title remains it hides
the pick. Paste the script into the existing Random Pick injector entry.

Run its tests with `node --test extras/jellyfin/tests/*.test.js` from the repository root.

## Deployment

`deploy/install_party_update.py` prepares and applies versioned plugin directories,
an early invitation bootstrap and an optional session-server image. It verifies
hashes before replacing files, preserves a bind-mounted index inode, checks service
health and restores the previous files on failure. It targets a Docker Compose
installation with `jellyfin` and `jwp-session` services under `/opt/jellyfin` by default;
use `--root` and `--container` for another installation path or Jellyfin container.
Build the session image before preparing a session-server update.

Stage replacement DLLs and metadata in `plugins/JellyWatchParty_<version>/` and
`plugins/ShareLinks_<version>/`. Each metadata file must contain `version`. Put the
canonical `src/clients/jellyfin-web/invite-bootstrap.html` in the stage root.

```sh
python3 install_party_update.py prepare /path/to/stage --root /opt/jellyfin --session-image jwp-session-server:your-version
python3 install_party_update.py apply /path/to/stage --root /opt/jellyfin
```

Apply when playback and rooms are idle: restarting the session server clears its
in-memory rooms. Historical waiting-room and fast-join installers and deployment
notes document the earlier upgrades; their version paths are fixed to those upgrades.

## Live verification

`deploy/validate_waiting_room_live.py` checks an empty invitation, guest library
permissions, title selection with the same URL/account, playback and Random Pick.
It imports `validate_jwp_series_sync.py`. These scripts run on the Docker host and
use an existing administrator session from the local Jellyfin database in memory.
Adapt the documented paths and WebSocket Origin to your installation.

`deploy/browser_room.py /path/to/stage` creates a disposable room and prints its
invitation. Browser QA can join it and send the documented commands through the
stage's `browser-command` file. It removes the room and temporary guest on exit.

Server snapshots, plugin configuration XML, credentials and generated binaries are
kept outside this directory.
