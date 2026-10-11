import type {
    PlaybackPositionData,
    PortalActivityItem,
} from '@iptvnator/shared/interfaces';
import {
    buildProviderCoverItem,
    type UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import {
    resolveDashboardSeriesHistory,
    type DashboardCoverMetadata,
} from '@iptvnator/workspace/dashboard/data-access';

/** Favourite commands target provider content, never the history storage row. */
export function buildDashboardFavoriteTarget(
    item: PortalActivityItem & DashboardCoverMetadata,
    scope: 'catalog' | 'history' = 'catalog',
    position: PlaybackPositionData | null = null
): UnifiedCollectionItem | null {
    if (
        (item.source !== 'xtream' && item.source !== 'stalker') ||
        item.type === 'live'
    )
        return null;
    const history =
        scope === 'history' &&
        item.source === 'xtream' &&
        item.type === 'series';
    const seriesId = history
        ? resolveDashboardSeriesHistory(item, position ? [position] : [])
              ?.seriesId
        : undefined;
    if (history && seriesId == null) return null;
    return buildProviderCoverItem(
        {
            provider: item.source,
            playlistId: item.playlist_id,
            playlistName: item.playlist_name,
            contentType: item.type,
        },
        item.source === 'xtream'
            ? {
                  ...item,
                  id: history ? undefined : item.id,
                  xtream_id: history ? seriesId : item.xtream_id,
              }
            : {
                  ...item.stalker_item,
                  id: item.xtream_id,
                  title: item.title,
                  poster_url: item.poster_url,
              }
    );
}
