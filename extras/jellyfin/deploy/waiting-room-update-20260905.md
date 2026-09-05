# Waiting-room and Random Pick deployment — 2026-09-05

Installed on `jellyfin.rkde.su`:

- JellyWatchParty 1.9.1.0 and ShareLinks 1.0.7.0.
- An early invitation bootstrap and versioned client script URLs in the web index.
- The updated **Random pick in watching row** injection, preserving other injections.

The server restarted successfully and reports healthy. The client endpoints serve the updated waiting-room UI and, after authentication, Random Pick exclusions.

Live verification used a disposable room and restricted guest. Creating and redeeming an invitation before choosing a title succeeded; the guest had no library access and could join and chat. Choosing a movie preserved the same invitation and guest, granted access only to that movie, and delivered the coordinated playback messages. The room and guest were cleaned up afterward. The Random Pick API excluded the current Continue Watching / Next Up items and their series.

Existing browser tabs require a hard refresh to load the new client.

The installer and validator are `install_waiting_room_update.py` and `validate_waiting_room_live.py`. The validator also uses `validate_jwp_series_sync.py`. Local generated assemblies and server snapshots are ignored under `deploy/live-update-20260905/`.

Server staging and hashes: `/opt/jellyfin/updates/waiting-room-20260905-01/plan.json`.

Backups: `/opt/jellyfin/updates/waiting-room-20260905-01/backup/`, containing the original plugin directories, JavaScriptInjector configuration and web index. A rollback requires stopping Jellyfin, restoring those originals, and restarting. Preserve the existing web-index inode when restoring its contents because it is bind-mounted into the container.
