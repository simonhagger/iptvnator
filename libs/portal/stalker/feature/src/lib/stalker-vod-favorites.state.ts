import { computed, type Signal } from '@angular/core';
import {
    createPortalFavoritesResource,
    createRefreshTrigger,
    isSelectedStalkerVodFavorite,
    toggleStalkerVodFavorite,
} from '@iptvnator/portal/stalker/data-access';
import type { PlaylistsService } from '@iptvnator/services';
import type { VodDetailsItem } from '@iptvnator/shared/interfaces';

/** Keep the favorites read and its post-write invalidation in one state owner. */
export function createStalkerVodFavoritesState(deps: {
    readonly playlists: PlaylistsService;
    readonly playlistId: () => string | undefined;
    readonly item: Signal<VodDetailsItem | null>;
    readonly actions: Omit<
        Parameters<typeof toggleStalkerVodFavorite>[1],
        'onComplete'
    >;
}) {
    const refresh = createRefreshTrigger();
    const resource = createPortalFavoritesResource(
        deps.playlists,
        deps.playlistId,
        refresh.refreshVersion
    );
    return {
        resource,
        selected: computed(() =>
            isSelectedStalkerVodFavorite(deps.item(), resource.value() ?? [])
        ),
        toggle(event: Parameters<typeof toggleStalkerVodFavorite>[0]): void {
            toggleStalkerVodFavorite(event, {
                ...deps.actions,
                onComplete: refresh.refresh,
            });
        },
    };
}
