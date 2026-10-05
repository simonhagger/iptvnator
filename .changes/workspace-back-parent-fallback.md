---
type: fix
area: workspace
---

Back on Settings, search, Discover and actor pages now works when that page is the first one you opened, for example after a reload or from a link: it takes you to the dashboard or to the playlist's movies or series instead of doing nothing or leaving the app.

If the parent view takes time to resolve, moving to another page cancels the
old Back request. A failed lookup keeps the current view.
