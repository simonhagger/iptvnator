import {
    resolvePortalActivityWatchKind,
    type PlaybackPositionData,
    type PortalActivityItem,
} from '@iptvnator/shared/interfaces';
import type { GlobalRecentItem } from '@iptvnator/workspace/dashboard/data-access';
import type { CatalogTitleMatch } from '@iptvnator/shared/interfaces';

import {
    formatRemainingLabel,
    playbackProgressPercent,
    type RemainingTimeLabel,
} from '@iptvnator/portal/shared/util';

export type DashboardRemainingLabel = RemainingTimeLabel;
export { formatRemainingLabel, playbackProgressPercent };

/** Only matched titles own saved positions; unmatched discovery cards do not. */
export function buildDashboardMatchedPlaybackItems(
    items: readonly { match: CatalogTitleMatch | null }[]
): Pick<GlobalRecentItem, 'playlist_id' | 'type' | 'xtream_id'>[] {
    return items.reduce<
        Pick<GlobalRecentItem, 'playlist_id' | 'type' | 'xtream_id'>[]
    >((scopes, { match }) => {
        if (match)
            scopes.push({
                playlist_id: match.playlistId,
                type: match.type,
                xtream_id: match.xtreamId,
            });
        return scopes;
    }, []);
}

export function buildPlaybackPositionReloadKey(
    items: readonly Pick<
        GlobalRecentItem,
        'playlist_id' | 'type' | 'xtream_id'
    >[]
): string {
    return items
        .filter((item) => item.type === 'movie' || item.type === 'series')
        .map((item) => `${item.playlist_id}::${item.type}::${item.xtream_id}`)
        .sort()
        .join('|');
}

export function isContinueWatchingRecentItem(
    item: Pick<GlobalRecentItem, 'type'>
): boolean {
    return item.type === 'movie' || item.type === 'series';
}

/**
 * "S1·E5" for an item whose progress is tracked per episode. Keyed on the
 * WATCH kind: a Stalker embedded-VOD / lazy `is_series` show routes as a
 * movie but still names the episode it is on.
 */
export function buildDashboardEpisodeBadge(
    item: Pick<PortalActivityItem, 'type' | 'watch_kind'>,
    position: PlaybackPositionData | null,
    translate: (key: string, params: Record<string, number>) => string
): string | null {
    return resolvePortalActivityWatchKind(item) === 'series' &&
        position?.seasonNumber != null &&
        position?.episodeNumber != null
        ? translate('WORKSPACE.DASHBOARD.SEASON_EPISODE_BADGE', {
              season: position.seasonNumber,
              episode: position.episodeNumber,
          })
        : null;
}
