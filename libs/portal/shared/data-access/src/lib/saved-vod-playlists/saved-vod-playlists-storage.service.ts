import { inject, Injectable } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { normalizeSavedVodPlaylist } from '@iptvnator/shared/interfaces/saved-vod-validation';
import type {
    SavedVodDeleteResult,
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';
import { BrowserSavedVodPlaylists } from './browser-saved-vod-playlists';

@Injectable({ providedIn: 'root' })
export class SavedVodPlaylistsStorageService {
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly browser = new BrowserSavedVodPlaylists();

    /** A partial desktop bridge must never silently start a second browser store. */
    private get desktop() {
        if (!this.runtime.isElectron) return null;
        const bridge = window.electron;
        if (
            !this.runtime.supportsSavedVodPlaylistStorage ||
            !bridge?.dbListSavedVodPlaylists ||
            !bridge.dbGetSavedVodPlaylist ||
            !bridge.dbSaveSavedVodPlaylist ||
            !bridge.dbDeleteSavedVodPlaylist
        ) {
            throw new Error(
                'Saved playlist storage requires an updated desktop app'
            );
        }
        return {
            list: bridge.dbListSavedVodPlaylists,
            get: bridge.dbGetSavedVodPlaylist,
            save: bridge.dbSaveSavedVodPlaylist,
            delete: bridge.dbDeleteSavedVodPlaylist,
        };
    }

    list(): Promise<SavedVodPlaylistSummary[]> {
        return this.desktop?.list() ?? this.browser.list();
    }
    async get(id: string): Promise<SavedVodPlaylist | null> {
        const document = await (this.desktop?.get(id) ?? this.browser.get(id));
        return document ? normalizeSavedVodPlaylist(document) : null;
    }
    save(
        playlist: SavedVodPlaylist,
        expectedRevision: number | null
    ): Promise<SavedVodWriteResult> {
        const candidate = normalizeSavedVodPlaylist(playlist);
        return (
            this.desktop?.save(candidate, expectedRevision) ??
            this.browser.save(candidate, expectedRevision)
        );
    }
    delete(
        id: string,
        expectedRevision: number
    ): Promise<SavedVodDeleteResult> {
        return (
            this.desktop?.delete(id, expectedRevision) ??
            this.browser.delete(id, expectedRevision)
        );
    }
}
