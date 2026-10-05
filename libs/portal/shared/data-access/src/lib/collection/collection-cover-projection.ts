import {
    collectionCoverIndicators,
    contentCoverIdentity,
    PortalPlaybackPositions,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';

/** At most one positions read per represented provider playlist, never per card. */
export async function projectCollectionCovers(
    items: readonly UnifiedCollectionItem[],
    favorites: readonly UnifiedCollectionItem[] | undefined,
    repository: PortalPlaybackPositions | null
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
    return items.map((item) =>
        item.contentType === 'live'
            ? item
            : {
                  ...item,
                  coverIndicators: collectionCoverIndicators(
                      item,
                      positions.get(item.playlistId),
                      keys?.has(contentCoverIdentity(item))
                  ),
              }
    );
}
