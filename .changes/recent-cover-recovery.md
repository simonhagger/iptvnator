---
type: fix
area: vod
---

Retry recovers collection progress and Recent episode actions after storage failures, preserving removals and ordering. Progress errors offer Retry even when favourites load. PWA membership stays unknown after failed saved-data reads and recovers through Retry. Favourite changes stop if current membership cannot be read safely. Windows-only alpha.
