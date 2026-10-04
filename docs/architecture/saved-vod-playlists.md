# Saved VOD playlists

This buildout adds named movie and episode lists independently of provider sources,
which are already called playlists elsewhere in IPTVnator. The local foundation
defines identities, pure editing/execution rules and persistence. The management
page is available at `/workspace/saved-playlists`; playback, provider expansion
and portable import/export remain subsequent slices.

## Ownership

`@iptvnator/shared/interfaces` owns the persisted versioned contracts.
`@iptvnator/portal/shared/util` owns pure identity, editing, progress and transition
rules. Functions receive IDs, timestamps and shuffle permutations from callers.
They do not read clocks, generate random numbers, resolve streams or write storage.
Data-access services coordinate persistence and will add provider playback adapters.
Angular views will bind those services and use existing Material controls and theme
tokens. Renderers report playback observations through the shared player contract.

## Content identity

A saved entry identifies its source, provider and movie or episode. Xtream episodes
carry series and episode IDs with display coordinates. Stalker episodes carry raw
series/season IDs, series mode and episode number. Stalker synthetic watch-history
IDs are not a substitute for the provider identity.

Each occurrence has its own stable ID. Normal Add deduplicates content within a
source; Add again deliberately creates a second occurrence. Exported and persisted
documents must contain no server credentials, resolved stream URL, headers, provider
command or artwork URL. Display snapshots contain title text only. Playback resolves
the current source and credentials when requested. A missing source remains visible
and supports Retry, Remove or Skip; it must not silently substitute another source.

## Editing and execution

Starting a list takes an immutable snapshot of its entries. Editing the saved list
affects future runs. The management view must explain that an active run retains its
snapshot. A shuffle is an execution permutation and never rewrites the saved order.
Resume uses the interrupted occurrence's per-list position. Restart list creates a
new execution and leaves global watch history intact.

Creation and rename validate trimmed names through the shared document validator.
Duplication receives a new list ID and one new ID per occurrence from the caller,
preserves content order and provenance, and starts without an execution or progress.
Renaming retains the original creation time, persisted revision and run.

The shared `SavedVodPlaylistNameDialogComponent` supplies naming for management
and add-to-new-list actions. It validates the trimmed name against the persisted
name limit, keeps invalid input available for correction and returns only a name.
Callers own the command, persistence result and translated action label.

`SavedVodAddDialogComponent` adds a validated movie/episode batch to an existing
list or creates a populated named list in one atomic write. Its component-scoped
controller captures the selected revision, validates every candidate before
deduplication and offers explicit duplicate occurrences. A conflict requires
Refresh and a new submission; closing or relocking ignores later responses.
Movie details and individual episode menus now launch this dialog for Xtream and
Stalker sources. Provider hosts construct validated, locally owned references;
shared movie and episode controls emit presentation actions only. Missing IDs,
stale source metadata and old menu events cannot create a saved candidate.
Saving does not depend on the current renderer, codec or download capability.
The owner closes its dialog when its content/source changes or it is destroyed.
Whole-series and season Add remain unavailable until complete metadata loading
and persistent group provenance are implemented.

`SavedVodEntryRowComponent` presents movie/episode occurrences with source display
names and keyboard-accessible reorder/remove buttons. It emits occurrence IDs and
target positions, disables boundary moves and respects pending writes. The owner
resolves source names, translates labels, persists commands and restores focus
after removal. Rows do not resolve streams or expose credentials or provider URLs.

Observations carry execution ID, occurrence ID and playback revision. Every
transition increments the revision, including Repeat One, so late time/end events
cannot advance a replacement run or complete the same occurrence twice. Skip does
not mark unwatched content completed. External players without reliable end events
offer manual Next; they must not guess completion from a window closing.

Persistence must detect stale writes by expected revision. Export/import will use an
allowlisted versioned format with bounded document and entry sizes. Import creates
new local list and occurrence IDs. Unknown schemas or malformed identities fail
without partially overwriting an existing list. Source mapping is explicit when
referenced sources are absent.

## Storage

`SavedVodPlaylistsStorageService` selects an explicit runtime capability. Electron
requires all four saved-list bridge methods and routes them through the database
worker. A partial desktop bridge reports an update requirement instead of silently
creating a second browser store. SQLite adds `saved_vod_playlists` on startup with
an idempotent table statement. Lists have no foreign key to provider sources, so a
deleted source does not delete curated entries that the user may recover or remap.

The browser uses a separate `iptvnator-saved-vod` IndexedDB database with document
and summary stores, leaving the provider-source database untouched. Document and
summary changes commit together. Both adapters compare the expected revision in
the same write transaction and return a conflict with the current document for
stale edits or deletes. IDs and timestamps come from callers; the storage adapter
assigns the next persisted revision and preserves the original creation time.

`SavedVodPlaylistsCommandsService` coordinates pure edits with storage. Creation
and duplication use create-only writes; edits and deletion use the observed
revision. Conflicts return to the caller without an automatic overwrite/retry.
No-op edits skip writes but verify the observed stored revision; stale or deleted
targets return a conflict. Clear and restore affect curated entries and retain the
active execution snapshot; the management view owns whether Undo is still eligible.

The component-scoped `SavedVodPlaylistsController` owns management-pane state.
Read generations prevent an old selection or refresh replacing a newer result.
Mutations run one at a time and hold selection until completion. A conflict shows
the current stored document with an explicit notice and never silently retries.
Clear exposes one Undo slot tied to the saved revision; an intervening action,
selection or conflict invalidates it. Disposed panes ignore pending responses.

The global management page appears in the Electron and browser workspace rail
and command palette, including when there are no provider sources. It keeps the
global app actions and removes provider-specific search and source controls.
Creation, rename and duplication share the naming dialog. Delete and Clear require
confirmation; Clear exposes Undo. List and entry panes own their scrolling, and
entry moves/removals preserve keyboard focus unless the user has moved elsewhere.
An active-run notice explains that editing retains the execution snapshot.

Saved titles currently have no category index, so the whole page is withheld while
parental lock is active. Initialization finishes before the manager loads data.
Relocking destroys the manager and closes only its own dialogs; late dialog results
are checked before writing. This conservative rule also covers lists whose sources
have been removed.

Documents pass allowlist validation before IPC and persistence. Unknown fields,
including credentials, are discarded. SQLite reads check stored identity and
revision. Browser reads check identity. Listing reads summaries instead of parsing
every execution snapshot. Real browser tests cover reload, competing windows and
invalid edits; Electron E2E covers the preload/worker/SQLite path and app restart.

## Series and season planning

Pure expansion and refresh proposals accept explicit provider metadata, supplied
occurrence IDs, a captured timestamp, a monotonic sequence and available capacity.
They validate the entire metadata batch before group filtering and deduplication.
Stalker season proposals retain the raw season ID and series mode, including
special seasons with display number zero. Refresh preserves matching occurrence
IDs, matches deliberate duplicates in their existing order and reports additions,
removals and changes to retained order.

Stalker `seriesMode` describes the catalogue origin: regular series use `series`,
while embedded and lazily loaded VOD series both use `vod-series`. Raw provider
season IDs are retained separately from enriched display coordinates. Neither a
synthetic watch-history ID nor a transport command substitutes for that identity.

These descriptors and proposals are not persisted or connected to provider
fetching yet. The next slice must store group provenance in the same document as
entries, prepare a whole-list preview and apply it with the observed revision in
one write. Preview and Cancel must not write. Applying refresh must preserve
unrelated and manually ordered entries and the active execution snapshot. Clear,
Undo and Duplicate must handle provenance together with entries before group
refresh becomes available in the UI.

## Delivery and validation

The grouped tranche contains domain/persistence, a sidebar management pane and add
dialog, season/show expansion, playback/resume and validated import/export. Keep
list management, provider resolution and renderer controls separately testable.
Use historical SQLite upgrade fixtures for additive schema changes and real Electron
tests for the IPC/worker workflow. Browser persistence and management flows need
browser E2E. Domain tests cover duplicate identities, edited active runs, stale
observations, repeat/shuffle, missing sources and interrupted progress.

This feature is alpha. Feature testing is on Windows only; macOS and Linux runtime
behaviour requires separate validation before a release-ready claim.
