import {
    buildOpenCollectionDetailItemState,
    buildXtreamCollectionUid,
    collectionCoverIndicators,
    contentCoverIdentity,
    PortalPlaybackPositions,
    resolveCollectionSeriesHistory,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';

/** At most one positions read per represented provider playlist, never per card. */
export async function projectCollectionCovers(
    items: readonly UnifiedCollectionItem[],
    favorites: readonly UnifiedCollectionItem[] | undefined,
    repository: PortalPlaybackPositions | null,
    lookupScope: 'catalog' | 'history' = 'catalog'
): Promise<UnifiedCollectionItem[]> {
    const ids = [
        ...new Set(
            items
                .filter(
                    (item) =>
                        item.contentType !== 'live' && item.sourceType !== 'm3u'
                )
                .map((item) => item.playlistId)
        ),
    ];
    const positions = new Map<string, PlaybackPositionData[]>();
    if (repository)
        await Promise.all(
            ids.map(async (playlistId) => {
                try {
                    positions.set(
                        playlistId,
                        await repository.getAllPlaybackPositions(playlistId)
                    );
                } catch {
                    /* Failed reads stay unknown, not unwatched. */
                }
            })
        );
    const keys =
        favorites === undefined
            ? undefined
            : new Set(favorites.map(contentCoverIdentity));
    return items.map((item) => {
        if (item.contentType === 'live') return item;
        const itemPositions = positions.get(item.playlistId);
        const favoriteTarget =
            lookupScope === 'history' &&
            item.sourceType === 'xtream' &&
            item.contentType === 'series'
                ? resolveHistoryFavoriteTarget(item, itemPositions)
                : item;
        return {
            ...item,
            coverDetailTarget:
                lookupScope === 'history' &&
                item.sourceType === 'xtream' &&
                item.contentType === 'series'
                    ? resolveHistoryDetailTarget(
                          item,
                          favoriteTarget,
                          itemPositions
                      )
                    : undefined,
            coverFavoriteTarget:
                favoriteTarget === item ? undefined : favoriteTarget,
            coverIndicators: collectionCoverIndicators(
                item,
                itemPositions,
                favoriteTarget
                    ? keys?.has(contentCoverIdentity(favoriteTarget))
                    : undefined,
                lookupScope
            ),
        };
    });
}

/** A history episode owns navigation/removal; only its parent owns favourites. */
function resolveHistoryFavoriteTarget(
    item: UnifiedCollectionItem,
    positions: readonly PlaybackPositionData[] | undefined
): UnifiedCollectionItem | null {
    if (item.historyContentType === 'series') return item;
    const seriesId = resolveCollectionSeriesHistory(item, positions)?.seriesId;
    if (seriesId == null) return null;
    if (item.historyContentType !== 'episode' && seriesId === item.xtreamId)
        return item;
    return {
        ...item,
        uid: buildXtreamCollectionUid(item.playlistId, 'series', seriesId),
        xtreamId: seriesId,
        // The history database ID belongs to an episode, not the parent show.
        contentId: undefined,
        historyContentType: 'series',
        coverFavoriteTarget: undefined,
        coverDetailTarget: undefined,
        coverIndicators: undefined,
    };
}

function resolveHistoryDetailTarget(
    item: UnifiedCollectionItem,
    parent: UnifiedCollectionItem | null,
    positions: readonly PlaybackPositionData[] | undefined
): UnifiedCollectionItem['coverDetailTarget'] {
    if (!parent) return null;
    const position = resolveCollectionSeriesHistory(item, positions)?.position;
    const candidate =
        position &&
        parent.xtreamId != null &&
        position.seasonNumber != null &&
        position.episodeNumber != null
            ? {
                  seriesXtreamId: parent.xtreamId,
                  contentXtreamId: position.contentXtreamId,
                  seasonNumber: position.seasonNumber,
                  episodeNumber: position.episodeNumber,
              }
            : null;
    return {
        item: parent,
        seriesResume:
            buildOpenCollectionDetailItemState(parent, candidate)
                .seriesResume ?? null,
    };
}
