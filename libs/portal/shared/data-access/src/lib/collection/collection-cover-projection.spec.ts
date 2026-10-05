import {
    PortalPlaybackPositions,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { projectCollectionCovers } from './collection-cover-projection';

const movie: UnifiedCollectionItem = {
    uid: 'xtream::a::movie:7',
    name: 'Film',
    contentType: 'movie',
    sourceType: 'xtream',
    playlistId: 'a',
    playlistName: 'Portal',
    xtreamId: 7,
    rating: '7.2',
};
const position: PlaybackPositionData = {
    contentType: 'vod',
    contentXtreamId: 7,
    playlistId: 'a',
    positionSeconds: 95,
    durationSeconds: 100,
};
const repository = (getAllPlaybackPositions: jest.Mock) =>
    ({ getAllPlaybackPositions }) as unknown as PortalPlaybackPositions;

describe('collection cover projection', () => {
    it('reads once per represented provider playlist, not per cover or live row', async () => {
        const read = jest.fn().mockResolvedValue([position]);
        const items = [
            movie,
            { ...movie, xtreamId: 8 },
            { ...movie, playlistId: 'b' },
            { ...movie, contentType: 'live' as const, playlistId: 'c' },
        ];
        const projected = await projectCollectionCovers(
            items,
            [movie],
            repository(read)
        );
        expect(read.mock.calls).toEqual([['a'], ['b']]);
        expect(projected[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 95,
            watchState: 'watched',
            rating: { value: 7.2, source: 'provider' },
        });
        expect(projected[1].coverIndicators?.favorite).toBe(false);
        expect(projected[2].coverIndicators?.watchState).toBe('unwatched');
        expect(projected[3]).toBe(items[3]);
    });

    it('does not mark a series watched from a completed episode or colliding movie ID', async () => {
        const series = { ...movie, contentType: 'series' as const };
        const episode: PlaybackPositionData = {
            ...position,
            contentType: 'episode',
            contentXtreamId: 22,
            seriesXtreamId: 7,
        };
        const result = await projectCollectionCovers(
            [series],
            [movie],
            repository(jest.fn().mockResolvedValue([position, episode]))
        );
        expect(result[0].coverIndicators).toMatchObject({
            favorite: false,
            progressScope: 'episode',
            watchState: 'in-progress',
        });
        expect(result[0].coverIndicators?.progress).toBe(95);
    });

    it('keeps failed position and favourite reads unknown', async () => {
        const result = await projectCollectionCovers(
            [movie],
            undefined,
            repository(jest.fn().mockRejectedValue(new Error('private')))
        );
        expect(result[0].coverIndicators?.watchState).toBeUndefined();
        expect(result[0].coverIndicators?.favorite).toBeUndefined();
    });

    it('keeps Stalker attribution and embedded-series watch claims accurate', async () => {
        const stalker = {
            ...movie,
            sourceType: 'stalker' as const,
            xtreamId: undefined,
            stalkerId: '7',
            stalkerItem: {
                id: '7',
                series: ['episode'],
                rating_kinopoisk: '8.5',
            },
        };
        const result = await projectCollectionCovers(
            [stalker],
            [],
            repository(jest.fn().mockResolvedValue([position]))
        );
        expect(result[0].coverIndicators).toMatchObject({
            progressScope: 'episode',
            watchState: 'unwatched',
            rating: { value: 8.5, source: 'kinopoisk' },
        });
        expect(result[0].coverIndicators?.progress).toBeNull();
    });
});
