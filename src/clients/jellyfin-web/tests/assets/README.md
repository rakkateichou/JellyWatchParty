# Native media regression fixture

`native-resume.mp4` is a silent, solid-colour 120-second video generated locally:

```sh
ffmpeg -f lavfi -i 'color=c=0x324854:s=160x90:r=5:d=120' -an -c:v libx264 -crf 35 -pix_fmt yuv420p -movflags +faststart native-resume.mp4
```

Serve `native-resume.browser.html` over localhost and open a second tab with
`?guest`. The fixture uses real HTML media events and the production client
handlers, with a local BroadcastChannel simulating the server's shared start
time. It never connects to Jellyfin or records watch history.

Play once: both videos should start after the countdown, with no cancellation.
Pause, resume repeatedly, and cancel during the countdown: both clients should
follow each command. Leave the room: ordinary local playback should work.
