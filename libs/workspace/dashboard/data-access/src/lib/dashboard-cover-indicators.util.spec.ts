import type {
    PlaybackPositionData,
    PortalActivityItem,
} from '@iptvnator/shared/interfaces';
import {
    buildDashboardCoverIndicators,
    dashboardCoverIdentity,
    dashboardFavoriteCardId,
    findDashboardFavoriteForCard,
} from './dashboard-cover-indicators.util';
import { mapDbFavoriteToItem } from './dashboard-mappers';
import type { GlobalFavoriteItem } from '@iptvnator/services';

describe('dashboard cover indicators', () => {
    const item: PortalActivityItem = {
        id: 91,
        xtream_id: 7,
        title: 'Movie',
        type: 'movie',
        playlist_id: 'portal',
        category_id: 1,
        source: 'xtream',
    };
    const position: PlaybackPositionData = {
        playlistId: 'portal',
        contentXtreamId: 7,
        contentType: 'vod',
        positionSeconds: 40,
        durationSeconds: 100,
    };

    it('scopes favourites by provider, playlist, routing kind and content id', () => {
        const identity = dashboardCoverIdentity(item);
        const otherHistoryRow: PortalActivityItem = { ...item, id: 200 };
        expect(dashboardCoverIdentity(otherHistoryRow)).toBe(identity);
        for (const change of [
            { source: 'stalker' as const },
            { playlist_id: 'other' },
            { type: 'series' as const },
            { xtream_id: 8 },
        ]) {
            expect(dashboardCoverIdentity({ ...item, ...change })).not.toBe(
                identity
            );
        }
    });

    it('separates same-ID movie and series favourite cards and resolves the selected kind', () => {
        const movie = {
            ...item,
            source: 'stalker' as const,
            added_at: '',
            id: '7',
            xtream_id: '7',
        };
        const series = { ...movie, type: 'series' as const, title: 'Series' };
        const movieId = dashboardFavoriteCardId(movie);
        const seriesId = dashboardFavoriteCardId(series);
        expect(movieId).toMatch(/^fav-7-portal-/);
        expect(seriesId).not.toBe(movieId);
        expect(findDashboardFavoriteForCard([movie, series], seriesId)).toBe(
            series
        );
        expect(findDashboardFavoriteForCard([series, movie], movieId)).toBe(
            movie
        );
        expect(findDashboardFavoriteForCard([movie], seriesId)).toBeUndefined();
    });

    it('retains persisted generic provider ratings without relabelling them IMDb', () => {
        const mapped = mapDbFavoriteToItem({
            ...item,
            rating: '8.1',
        } as GlobalFavoriteItem);
        expect(
            buildDashboardCoverIndicators(mapped, true, position, true)
        ).toMatchObject({
            favorite: true,
            watchState: 'in-progress',
            progress: 40,
            rating: { value: 8.1, source: 'provider', scale: 10 },
        });
    });

    it('shows episode completion as series started, including embedded Stalker series', () => {
        expect(
            buildDashboardCoverIndicators(
                { ...item, source: 'stalker', watch_kind: 'series' },
                true,
                { ...position, contentType: 'episode', positionSeconds: 100 },
                true
            )
        ).toMatchObject({
            watchState: 'in-progress',
            progress: 100,
            progressScope: 'episode',
        });
    });

    it('leaves watch state unknown until the source position load succeeds', () => {
        expect(
            buildDashboardCoverIndicators(item, false, null, false).watchState
        ).toBeUndefined();
        expect(
            buildDashboardCoverIndicators(item, false, null, true).watchState
        ).toBe('unwatched');
    });

    it('uses explicitly attributed Stalker scores and excludes live progress', () => {
        const stalker = {
            ...item,
            source: 'stalker' as const,
            stalker_item: {
                info: { rating_imdb: '8.2', rating: '7' },
            } as PortalActivityItem['stalker_item'],
        };
        expect(
            buildDashboardCoverIndicators(stalker, true, null, true).rating
                ?.source
        ).toBe('provider-imdb');
        expect(
            buildDashboardCoverIndicators(
                { ...stalker, type: 'live' },
                true,
                position,
                true
            )
        ).toMatchObject({
            watchState: undefined,
            progress: null,
        });
    });

    it('retains valid nested Stalker ratings when the outer rating is malformed', () => {
        const stalker = {
            ...item,
            source: 'stalker' as const,
            stalker_item: {
                rating_imdb: 'unknown',
                info: { rating_imdb: '8.2' },
            } as PortalActivityItem['stalker_item'],
        };
        expect(
            buildDashboardCoverIndicators(stalker, true, null, true).rating
        ).toEqual({ value: 8.2, source: 'provider-imdb', scale: 10 });
    });
});
