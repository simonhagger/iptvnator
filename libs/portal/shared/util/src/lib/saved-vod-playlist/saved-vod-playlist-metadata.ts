import {
    normalizeSavedVodPlaylist,
    type SavedVodEntry,
    type SavedVodPlaylist,
} from '@iptvnator/shared/interfaces';

/** Callers own IDs/time; persistence owns the next stored revision. */
export function createSavedVodPlaylist(
    id: string,
    name: string,
    createdAt: string,
    entries: readonly SavedVodEntry[] = []
): SavedVodPlaylist {
    return normalizeSavedVodPlaylist({
        schemaVersion: 1,
        id,
        name: name.trim(),
        revision: 1,
        entries,
        execution: null,
        createdAt,
        updatedAt: createdAt,
    });
}

export function renameSavedVodPlaylist(
    playlist: SavedVodPlaylist,
    name: string,
    updatedAt: string
): SavedVodPlaylist {
    const trimmed = name.trim();
    if (trimmed === playlist.name) return playlist;
    return normalizeSavedVodPlaylist({ ...playlist, name: trimmed, updatedAt });
}

/** A duplicate is a new list of occurrences, without the original run/progress. */
export function duplicateSavedVodPlaylist(
    playlist: SavedVodPlaylist,
    options: {
        id: string;
        name: string;
        entryIds: readonly string[];
        createdAt: string;
    }
): SavedVodPlaylist {
    if (
        options.id === playlist.id ||
        options.entryIds.length !== playlist.entries.length
    ) {
        throw new Error('A duplicate requires a new list and occurrence IDs');
    }
    const originalIds = new Set(playlist.entries.map((entry) => entry.id));
    if (options.entryIds.some((id) => originalIds.has(id))) {
        throw new Error('A duplicate must not reuse original occurrence IDs');
    }
    return createSavedVodPlaylist(
        options.id,
        options.name,
        options.createdAt,
        playlist.entries.map((entry, index) => ({
            ...entry,
            id: options.entryIds[index],
        }))
    );
}
