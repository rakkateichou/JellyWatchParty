# Chat replies — JellyWatchParty 1.11.0.0

The plugin and matching session server were deployed together on 2026-09-05.
ShareLinks 1.0.8.0 remains compatible. Refresh an existing Jellyfin tab to load
the new chat controls.

Every confirmed chat message has a Reply button. Selecting it shows the original
author and text above the composer, without changing an existing draft. Cancel
with the × button or Escape. Sending clears the selection; a failed socket send
keeps it and the draft. Message quotes are escaped and emote names remain readable.

The server assigns stable message IDs and resolves reply references against the
same room's history. It ignores client-supplied quotes. A reply stores one level
of quoted text, so it remains readable when the parent leaves the 100-message
history. References to an already expired parent show an unavailable note.
IDs and reply snapshots are included in history sent on join/reconnect.

Ordinary chat retains its direct transport path. Its server copy updates the
existing row with the canonical identity, without another unread notification.
Replies use the server path so all clients receive the same resolved quote.

Validation completed:

- 172 JavaScript tests, including preview/cancel, send failure, escaped quotes,
  history bounds, replay and transport deduplication.
- 118 Rust tests and Clippy with warnings denied; server ID generation, quote
  validation, room isolation and parent eviction are covered.
- 128 Jellyfin plugin tests with the new bundled client and bootstrap version.
- Live disposable-room verification of replies on both clients and authenticated
  reconnect, together with the existing invitation/playback/isolation checks.
- Two isolated guest browser tabs: send, reply preview, cancel with retained
  draft, send reply, verify two message rows and one quote, and refresh with
  the same history. Screenshots confirmed the player-only waiting view and chat
  layout. The temporary room and guest account were removed afterward.

Deployment used `install_party_update.py` with one plugin bundle and a matching
session image, after confirming no active watch-party rooms. The live rollback
backup is `/opt/jellyfin/updates/chat-replies-20260905/backup`.
