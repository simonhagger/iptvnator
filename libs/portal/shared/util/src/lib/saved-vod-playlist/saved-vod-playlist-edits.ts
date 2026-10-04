import type {
    SavedVodEntry,
    SavedVodPlaylist,
    SavedVodReference,
} from '@iptvnator/shared/interfaces';

/** Tuple encoding preserves boundaries and Stalker's raw provider identifiers. */
export function savedVodReferenceKey(reference: SavedVodReference): string {
    if (reference.kind === 'movie') {
        return JSON.stringify([
            reference.sourceId,
            reference.provider,
            reference.kind,
            reference.contentId,
        ]);
    }
    return reference.provider === 'xtream'
        ? JSON.stringify([
              reference.sourceId,
              reference.provider,
              reference.kind,
              reference.seriesId,
              reference.contentId,
          ])
        : JSON.stringify([
              reference.sourceId,
              reference.provider,
              reference.kind,
              reference.seriesMode,
              reference.seriesId,
              reference.seasonId,
              reference.episodeNumber,
          ]);
}

/** Explicit duplicates get a new occurrence ID; ordinary additions deduplicate by content. */
export function appendSavedVodEntries(
    playlist: SavedVodPlaylist,
    candidates: readonly SavedVodEntry[],
    updatedAt: string,
    allowDuplicates = false
): SavedVodPlaylist {
    const identities = new Set(
        playlist.entries.map((entry) => savedVodReferenceKey(entry.reference))
    );
    const ids = new Set(playlist.entries.map((entry) => entry.id));
    const additions: SavedVodEntry[] = [];
    for (const entry of candidates) {
        if (ids.has(entry.id)) throw new Error('Duplicate saved entry ID');
        const key = savedVodReferenceKey(entry.reference);
        if (!allowDuplicates && identities.has(key)) continue;
        identities.add(key);
        ids.add(entry.id);
        additions.push(entry);
    }
    return additions.length
        ? {
              ...playlist,
              entries: [...playlist.entries, ...additions],
              updatedAt,
          }
        : playlist;
}

export function moveSavedVodEntry(
    playlist: SavedVodPlaylist,
    entryId: string,
    targetIndex: number,
    updatedAt: string
): SavedVodPlaylist {
    const index = playlist.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0 || !Number.isInteger(targetIndex)) return playlist;
    const target = Math.max(
        0,
        Math.min(playlist.entries.length - 1, targetIndex)
    );
    if (target === index) return playlist;
    const entries = [...playlist.entries];
    const [entry] = entries.splice(index, 1);
    entries.splice(target, 0, entry);
    return { ...playlist, entries, updatedAt };
}

export function removeSavedVodEntries(
    playlist: SavedVodPlaylist,
    ids: ReadonlySet<string>,
    updatedAt: string
): SavedVodPlaylist {
    const entries = playlist.entries.filter((entry) => !ids.has(entry.id));
    return entries.length === playlist.entries.length
        ? playlist
        : { ...playlist, entries, updatedAt };
}
