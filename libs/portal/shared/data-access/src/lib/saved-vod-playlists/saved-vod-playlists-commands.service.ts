import { inject, Injectable, InjectionToken } from '@angular/core';
import {
    appendSavedVodEntries,
    createSavedVodPlaylist,
    duplicateSavedVodPlaylist,
    moveSavedVodEntry,
    removeSavedVodEntries,
    renameSavedVodPlaylist,
} from '@iptvnator/portal/shared/util';
import type {
    SavedVodEntry,
    SavedVodPlaylist,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';
import { SavedVodPlaylistsStorageService } from './saved-vod-playlists-storage.service';

export type SavedVodCandidate = Omit<SavedVodEntry, 'id'>;
export type SavedVodEditResult =
    SavedVodWriteResult | { status: 'unchanged'; playlist: SavedVodPlaylist };

export const SAVED_VOD_PLAYLIST_RUNTIME = new InjectionToken<{
    newId: () => string;
    now: () => string;
}>('Saved playlist IDs and clock', {
    providedIn: 'root',
    factory: () => ({
        newId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
    }),
});

/** Stateless commands: a conflict is returned, never retried over a newer edit. */
@Injectable({ providedIn: 'root' })
export class SavedVodPlaylistsCommandsService {
    private readonly storage = inject(SavedVodPlaylistsStorageService);
    private readonly runtime = inject(SAVED_VOD_PLAYLIST_RUNTIME);

    create(name: string, candidates: readonly SavedVodCandidate[] = []) {
        const now = this.runtime.now();
        const list = createSavedVodPlaylist(this.runtime.newId(), name, now);
        return this.storage.save(
            appendSavedVodEntries(list, this.occurrences(candidates), now),
            null
        );
    }

    duplicate(playlist: SavedVodPlaylist, name: string) {
        return this.storage.save(
            duplicateSavedVodPlaylist(playlist, {
                id: this.runtime.newId(),
                name,
                entryIds: playlist.entries.map(() => this.runtime.newId()),
                createdAt: this.runtime.now(),
            }),
            null
        );
    }

    rename(playlist: SavedVodPlaylist, name: string) {
        return this.edit(
            playlist,
            renameSavedVodPlaylist(playlist, name, this.runtime.now())
        );
    }

    append(
        playlist: SavedVodPlaylist,
        candidates: readonly SavedVodCandidate[],
        allowDuplicates = false
    ) {
        return this.edit(
            playlist,
            appendSavedVodEntries(
                playlist,
                this.occurrences(candidates),
                this.runtime.now(),
                allowDuplicates
            )
        );
    }

    move(playlist: SavedVodPlaylist, entryId: string, targetIndex: number) {
        return this.edit(
            playlist,
            moveSavedVodEntry(
                playlist,
                entryId,
                targetIndex,
                this.runtime.now()
            )
        );
    }

    remove(playlist: SavedVodPlaylist, entryIds: ReadonlySet<string>) {
        return this.edit(
            playlist,
            removeSavedVodEntries(playlist, entryIds, this.runtime.now())
        );
    }

    clear(playlist: SavedVodPlaylist) {
        return this.remove(
            playlist,
            new Set(playlist.entries.map((entry) => entry.id))
        );
    }

    /** The management view owns undo eligibility; storage still checks its revision. */
    restoreEntries(
        playlist: SavedVodPlaylist,
        entries: readonly SavedVodEntry[]
    ) {
        return this.edit(playlist, {
            ...playlist,
            entries,
            updatedAt: this.runtime.now(),
        });
    }

    delete(playlist: SavedVodPlaylist) {
        return this.storage.delete(playlist.id, playlist.revision);
    }

    private occurrences(
        candidates: readonly SavedVodCandidate[]
    ): SavedVodEntry[] {
        return candidates.map((entry) => ({
            ...entry,
            id: this.runtime.newId(),
        }));
    }

    private edit(
        original: SavedVodPlaylist,
        candidate: SavedVodPlaylist
    ): Promise<SavedVodEditResult> {
        return candidate === original
            ? Promise.resolve({ status: 'unchanged', playlist: original })
            : this.storage.save(candidate, original.revision);
    }
}
