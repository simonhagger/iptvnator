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
    buildProviderCoverItem,
    resolveCollectionSeriesHistory,
    ResolvedCollectionSeriesHistory,
} from '@iptvnator/portal/shared/util';

export interface DashboardCoverMetadata {
    coverRating?: ContentCoverRating | null;
    readonly historyContentType?: 'episode' | 'series';
}

/** Only supplied, scoped position candidates can establish history ownership. */
export function resolveDashboardSeriesHistory(
    item: PortalActivityItem & DashboardCoverMetadata,
    positions: readonly PlaybackPositionData[]
): ResolvedCollectionSeriesHistory | null {
    if (item.source !== 'xtream' || item.type !== 'series') return null;
    const cover = buildProviderCoverItem(
        {
            provider: 'xtream',
            playlistId: item.playlist_id,
            contentType: 'series',
        },
        { xtream_id: item.xtream_id, title: item.title }
    );
    return cover
        ? resolveCollectionSeriesHistory(
              { ...cover, historyContentType: item.historyContentType },
              positions
          )
        : null;
}

/** Explicit episode history cannot open a show until its parent is known. */
export function isDashboardRecentDetailAvailable(
    item: PortalActivityItem & DashboardCoverMetadata,
    position: PlaybackPositionData | null
): boolean {
    return (
        item.source !== 'xtream' ||
        item.historyContentType !== 'episode' ||
        resolveDashboardSeriesHistory(item, position ? [position] : [])
            ?.seriesId != null
    );
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
    favorite: boolean | undefined,
    position: PlaybackPositionData | null,
    positionsLoaded: boolean
): ContentCoverIndicators {
    const watchKind = resolvePortalActivityWatchKind(item);
    const raw = item.stalker_item as Record<string, unknown> | undefined;
    const rating =
        item.coverRating ??
        (item.source === 'stalker'
            ? resolveProviderCoverRating(raw ?? {})
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
