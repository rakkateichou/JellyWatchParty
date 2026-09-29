# Jellyfin 12.1 support

JellyWatchParty 1.13.0.0 targets Jellyfin 12.1 and .NET 10. Use ShareLinks 1.1.0.0 with this release. Older Jellyfin installations should keep the existing 1.12.x / ShareLinks 1.0.x builds.

The fork selectively incorporates upstream compatibility changes from 72dc7f8, d47c669, 58d496d, 93ab37a, 21f57ce, 1f6294b and 1e16bb9: Modern toolbar placement, server-session media detection and playback, standard MediaBrowser authentication, hidden-player filtering, and File Transformation fallback detection. The fork retains its waiting rooms, compact invitations, guest confinement, chat replies, cursor sharing and custom media-switch protocol. The existing 1.12.8.0 session server remains compatible; these changes require no session protocol migration.

Before upgrading Jellyfin, stop it and back up both its configuration/database and metadata. Replace all installed plugins with builds for Jellyfin 12, and rebuild any custom index.html from the new web distribution before adding the invitation bootstrap. Run a full library scan after migration. A rollback needs restoration of both backups, not just the old container image.
