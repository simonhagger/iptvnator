---
type: fix
area: playback
---

Desktop web players can follow active stream redirects that omit CORS headers. The compatibility handling stays limited to the playback window, its selected stream and HLS media paths; browser security remains enabled.

This alpha contribution is tested on Windows only; other platforms are unverified.
