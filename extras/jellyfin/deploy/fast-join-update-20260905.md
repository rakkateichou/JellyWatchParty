# Faster room entry — 2026-09-05

Installed JellyWatchParty **1.9.3.0** on `jellyfin.rkde.su`; ShareLinks remains **1.0.7.0**.

- Serve the 35 client modules as one ordered JavaScript bundle. The embedded `client-modules.json` manifest controls execution order.
- Load the client before Jellyfin's main scripts, using the early bootstrap in `invite-bootstrap.html`.
- Open the chat panel as soon as the client starts. Authenticate with the already-redeemed same-origin session while Jellyfin initializes its API client; enable sending when room membership is confirmed.
- Cover only the video area while it loads, keeping chat usable. Entry icons no longer depend on Jellyfin's font download.
- Recognize a covered native player and a newly prepared fullscreen player on the details route. Open the video controls when the guest follows a paused owner, without briefly starting playback from zero.
- Allow a slow media load to finish without abandoning synchronization after 15 seconds.

Validation:

- 146 JavaScript tests and 128 .NET tests passed; Release build succeeded.
- Browser fixture with native playback intentionally delayed: chat panel appeared in 0.33–0.64 seconds and connected in 0.96–1.26 seconds. Desktop and phone layouts checked; sending a message succeeded before video playback.
- Live guest browser: client started at 11:43:06.235 UTC, room state arrived at 11:43:07.389 UTC (1.154 seconds later), and native playback was requested at 11:43:09.185 UTC. The guest reached the video route with readyState 4, paused at the owner's position, and chat visible. These timings exclude share-link redemption and the initial HTML request; they are observations from one test, not a guaranteed overall loading time.
- Live disposable-room checks passed: empty-room link creation, guest redemption, chat, stable invitation permissions when choosing a title, coordinated playback messages, and Random Pick exclusions.

Final deployment and backup: `/opt/jellyfin/updates/fast-join-20260905-02/`. The backup contains version 1.9.2.0 and the previous web index. `/opt/jellyfin/updates/fast-join-20260905-01/backup/` contains the pre-optimization 1.9.1.0 installation. Both installers preserve the bind-mounted web index inode and roll back if startup health checks fail.

Refresh existing Jellyfin tabs to load the updated client.
