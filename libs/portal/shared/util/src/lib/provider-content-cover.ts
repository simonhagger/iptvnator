import {
    isStalkerSeriesFlag,
    isStalkerSeriesItem,
} from '@iptvnator/shared/interfaces';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import {
    ContentCoverIndicators,
    normalizeContentCoverRating,
    resolveProviderCoverRating,
} from './content-cover';
import { getPortalPlaybackProgressPercent } from './portal-playback-positions';
import { playbackProgressPercent } from './detail/playback-progress';
import {
    resolvePortalSeriesWatchState,
    resolvePortalWatchState,
} from './portal-watch-state';
import type {
    CollectionContentType,
    UnifiedCollectionItem,
} from './collection/unified-collection-item.interface';

export interface ProviderCoverContext {
    readonly provider: 'xtream' | 'stalker';
    readonly playlistId: string;
    readonly playlistName?: string;
    readonly contentType: string;
}

/** A lookup key, never a persisted identifier or a route. */
export function contentCoverIdentity(item: UnifiedCollectionItem): string {
    return JSON.stringify([
        item.sourceType,
        item.playlistId,
        item.contentType,
        String(item.xtreamId ?? item.stalkerId ?? item.uid),
    ]);
}

/** Mounted collection ownership; does not change provider or favourite IDs. */
export function collectionRowIdentity(item: UnifiedCollectionItem): string {
    if (item.contentType === 'live') return item.uid;
    const identity = contentCoverIdentity(item);
    // Episode and parent provider IDs can coincide. Storage IDs differ between
    // native and PWA records, so provenance, not the database ID, owns this row.
    return item.sourceType === 'xtream' &&
        item.contentType === 'series' &&
        item.historyContentType === 'episode'
        ? JSON.stringify([identity, 'history-episode'])
        : identity;
}

/** Presentation recency only; does not choose what should auto-play next. */
export function findLatestSeriesEpisodePosition(
    positions: readonly PlaybackPositionData[],
    seriesId: number
): PlaybackPositionData | null {
    return findLatestMatchingEpisodePosition(
        positions,
        (candidate) => candidate.seriesXtreamId === seriesId
    );
}

function findLatestMatchingEpisodePosition(
    positions: readonly PlaybackPositionData[],
    matches: (position: PlaybackPositionData) => boolean
): PlaybackPositionData | null {
    return positions.reduce<PlaybackPositionData | null>(
        (latest, candidate) => {
            if (candidate.contentType !== 'episode' || !matches(candidate))
                return latest;
            if (!latest) return candidate;
            const timestamp = (row: PlaybackPositionData) => {
                const value = Date.parse(row.updatedAt ?? '');
                return Number.isFinite(value) ? value : 0;
            };
            return timestamp(candidate) > timestamp(latest)
                ? candidate
                : latest;
        },
        null
    );
}

export interface ResolvedCollectionSeriesHistory {
    /** Favourite ownership; never replaces the original history or route ID. */
    readonly seriesId: number | null;
    /** Exact episode for episode history, latest episode for parent history. */
    readonly position: PlaybackPositionData | null;
}

/** Resolve history provenance before considering coincidentally equal IDs. */
export function resolveCollectionSeriesHistory(
    item: UnifiedCollectionItem,
    positions: readonly PlaybackPositionData[] | undefined
): ResolvedCollectionSeriesHistory | null {
    const rawId = item.xtreamId ?? item.stalkerId;
    if (positions === undefined || rawId == null || String(rawId).trim() === '')
        return null;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 0) return null;
    const scoped = positions.filter(
        (row) => !row.playlistId || row.playlistId === item.playlistId
    );
    const parent = findLatestSeriesEpisodePosition(scoped, id);
    if (item.historyContentType === 'series')
        return { seriesId: id, position: parent };
    // Old unmarked records can name either shape. A parent match takes
    // precedence, so an unrelated episode with the same ID cannot win by time.
    if (item.historyContentType !== 'episode' && parent)
        return { seriesId: id, position: parent };
    const episode = findLatestMatchingEpisodePosition(
        scoped,
        (row) => row.contentXtreamId === id
    );
    if (!episode)
        return {
            seriesId: item.historyContentType === 'episode' ? null : id,
            position: null,
        };
    const seriesId = episode.seriesXtreamId;
    return {
        seriesId:
            seriesId != null && Number.isSafeInteger(seriesId) && seriesId >= 0
                ? seriesId
                : null,
        position: episode,
    };
}

/** A missing positions read is unknown; a complete empty read is unwatched. */
export function collectionCoverIndicators(
    item: UnifiedCollectionItem,
    positions?: readonly PlaybackPositionData[],
    favorite?: boolean,
    lookupScope: 'catalog' | 'history' = 'catalog'
): ContentCoverIndicators {
    const raw = item.stalkerItem;
    const stalkerItem =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const series =
        item.contentType === 'series' ||
        (item.sourceType === 'stalker' && isStalkerSeriesItem(stalkerItem));
    const indicators: ContentCoverIndicators = {
        favorite,
        rating:
            item.sourceType === 'stalker'
                ? resolveProviderCoverRating(stalkerItem)
                : normalizeContentCoverRating(item.rating, 'provider'),
        progressScope: series ? 'episode' : 'title',
    };
    const rawId = item.xtreamId ?? item.stalkerId;
    if (positions === undefined || rawId == null || String(rawId).trim() === '')
        return indicators;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 0) return indicators;
    const scoped = positions.filter(
        (position) =>
            !position.playlistId || position.playlistId === item.playlistId
    );
    if (series) {
        // Catalogue IDs always name the parent show. Recent direct-play rows
        // may name an episode instead; only explicit history projection may
        // resolve that ID through its saved episode row and parent identity.
        const latest =
            lookupScope === 'history'
                ? (resolveCollectionSeriesHistory(item, scoped)?.position ??
                  null)
                : findLatestSeriesEpisodePosition(scoped, id);
        return {
            ...indicators,
            watchState: resolvePortalSeriesWatchState(latest !== null),
            progress: playbackProgressPercent(latest),
        };
    }
    const position = scoped.find(
        (row) => row.contentType === 'vod' && row.contentXtreamId === id
    );
    return {
        ...indicators,
        progress: getPortalPlaybackProgressPercent(position),
        watchState: resolvePortalWatchState(position),
    };
}

/** Adapt a provider row without confusing database IDs with provider IDs. */
export function buildProviderCoverItem(
    context: ProviderCoverContext,
    item: Readonly<Record<string, unknown>>
): UnifiedCollectionItem | null {
    if (
        !context.playlistId ||
        !['vod', 'movie', 'series'].includes(context.contentType)
    ) {
        return null;
    }
    const contentType: CollectionContentType =
        context.contentType === 'series' ||
        (context.provider === 'stalker' &&
            isStalkerSeriesFlag(item['is_series']))
            ? 'series'
            : 'movie';
    const base = {
        name: String(item['title'] ?? item['o_name'] ?? item['name'] ?? ''),
        contentType,
        playlistId: context.playlistId,
        playlistName: context.playlistName ?? '',
        posterUrl: String(
            item['poster_url'] ??
                item['cover'] ??
                item['screenshot_uri'] ??
                item['stream_icon'] ??
                ''
        ),
        categoryId:
            typeof item['category_id'] === 'string' ||
            typeof item['category_id'] === 'number'
                ? item['category_id']
                : undefined,
    };
    if (context.provider === 'xtream') {
        const rawId =
            item['xtream_id'] ?? item['series_id'] ?? item['stream_id'];
        if (rawId == null || String(rawId).trim() === '') return null;
        const xtreamId = Number(rawId);
        if (!Number.isSafeInteger(xtreamId) || xtreamId < 0) return null;
        const databaseId = Number(item['id']);
        return {
            ...base,
            uid: `xtream::${context.playlistId}::${contentType}:${xtreamId}`,
            sourceType: 'xtream',
            xtreamId,
            contentId:
                item['xtream_id'] != null &&
                Number.isSafeInteger(databaseId) &&
                databaseId > 0
                    ? databaseId
                    : undefined,
        };
    }
    const rawId = [
        item['id'],
        item['stream_id'],
        item['series_id'],
        item['movie_id'],
    ].find(
        (value) =>
            (typeof value === 'string' || typeof value === 'number') &&
            String(value).trim() !== ''
    );
    if (rawId == null) return null;
    const stalkerId = String(rawId).trim();
    // Stored Stalker category is the source section, not the numeric catalogue
    // category. Embedded VOD series must still reopen through the VOD route.
    const sourceCategory = context.contentType === 'series' ? 'series' : 'vod';
    return {
        ...base,
        uid: `stalker::${context.playlistId}::${stalkerId}`,
        sourceType: 'stalker',
        stalkerId,
        stalkerCmd: typeof item['cmd'] === 'string' ? item['cmd'] : undefined,
        categoryId: sourceCategory,
        stalkerItem: { ...item, id: stalkerId, category_id: sourceCategory },
    };
}
