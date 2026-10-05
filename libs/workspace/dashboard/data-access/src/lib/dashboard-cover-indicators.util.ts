import {
    PlaybackPositionData,
    PortalActivityItem,
    PortalFavoriteItem,
    resolvePortalActivityWatchKind,
} from '@iptvnator/shared/interfaces';
import {
    ContentCoverIndicators,
    ContentCoverRating,
    normalizeContentCoverIndicators,
    playbackProgressPercent,
    resolvePortalSeriesWatchState,
    resolvePortalWatchState,
    resolveProviderCoverRating,
} from '@iptvnator/portal/shared/util';

export interface DashboardCoverMetadata {
    coverRating?: ContentCoverRating | null;
}

/** Provider, playlist and routing kind scope identity; history ids are not content ids. */
export function dashboardCoverIdentity(
    item: Pick<
        PortalActivityItem,
        'source' | 'playlist_id' | 'type' | 'xtream_id'
    >
): string {
    return JSON.stringify([
        item.source,
        item.playlist_id,
        item.type,
        String(item.xtream_id),
    ]);
}

/** Keep the familiar rail prefix, with provider/kind ownership in the stable suffix. */
export function dashboardFavoriteCardId(item: PortalFavoriteItem): string {
    return `fav-${item.id}-${item.playlist_id}-${item.added_at}-${encodeURIComponent(dashboardCoverIdentity(item))}`;
}

export function findDashboardFavoriteForCard<T extends PortalFavoriteItem>(
    items: readonly T[],
    cardId: string
): T | undefined {
    return items.find((item) => dashboardFavoriteCardId(item) === cardId);
}

export function buildDashboardCoverIndicators(
    item: PortalActivityItem & DashboardCoverMetadata,
    favorite: boolean,
    position: PlaybackPositionData | null,
    positionsLoaded: boolean
): ContentCoverIndicators {
    const watchKind = resolvePortalActivityWatchKind(item);
    const raw = item.stalker_item as Record<string, unknown> | undefined;
    const info = raw?.['info'] as Record<string, unknown> | undefined;
    const rating =
        item.coverRating ??
        (item.source === 'stalker'
            ? resolveProviderCoverRating({
                  rating_imdb: raw?.['rating_imdb'] ?? info?.['rating_imdb'],
                  rating_kinopoisk:
                      raw?.['rating_kinopoisk'] ?? info?.['rating_kinopoisk'],
                  rating: raw?.['rating'] ?? info?.['rating'],
              })
            : null);
    return normalizeContentCoverIndicators({
        favorite,
        rating,
        watchState:
            watchKind && positionsLoaded
                ? watchKind === 'series'
                    ? resolvePortalSeriesWatchState(!!position)
                    : resolvePortalWatchState(position)
                : undefined,
        progress: watchKind ? playbackProgressPercent(position) : null,
        progressScope: watchKind === 'series' ? 'episode' : 'title',
    });
}
