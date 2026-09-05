# Watch-party flow update — 2026-09-05

Deployed JellyWatchParty 1.10.2.0, ShareLinks 1.0.8.0 and the authenticated-reconnect
session server image `jwp-session-server:party-flow-1.10.0`.

Empty-room invitations now copy successfully. The guest immediately gets a black
waiting player with chat. The same URL and guest account follow the owner's title
selection. The web client is a single early-loaded bundle with a shared embedded
bootstrap, including the portable File Transformation installation path.

Guest isolation persists through navigation, reloads, room closure and join errors.
The native paused player opens before seeking to a later timestamp, and hidden
uninitialized Play controls are not clicked. Reconnects restore membership, obtain
fresh authentication and hold follower playback while state is reconciled.

Verified with 155 client JavaScript checks, 8 Random Pick checks, 128 plugin checks,
116 server checks, 11 companion plugin checks, and Rust clippy. Live checks cover
restricted library access, empty-room chat, permission updates using the same invite,
pause/seek, authenticated reconnect, a second guest and cleanup. Browser checks cover
copy-success feedback, chat delivery between two tabs, automatic native playback at
42 seconds while paused, owner resume/pause, reload, and closed-room isolation.

Backups are under `/opt/jellyfin/updates/party-flow-20260905/backup`, followed by
`party-flow-20260905-02/backup` and `party-flow-20260905-03/backup` for the final native
player refinements. The first backup includes the preceding session-server compose
configuration and both plugin directories. Temporary test guests and rooms are
removed after verification.
