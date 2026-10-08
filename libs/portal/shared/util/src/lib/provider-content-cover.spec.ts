import {
    buildProviderCoverItem,
    collectionCoverIndicators,
    collectionRowIdentity,
    contentCoverIdentity,
    findLatestSeriesEpisodePosition,
    resolveCollectionSeriesHistory,
} from './provider-content-cover';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import type { UnifiedCollectionItem } from './collection/unified-collection-item.interface';

const xtream = {
    provider: 'xtream',
    playlistId: 'a',
    contentType: 'vod',
} as const;
const stalker = {
    provider: 'stalker',
    playlistId: 'a',
    contentType: 'vod',
} as const;

describe('provider cover identity', () => {
    it('keeps the normalized SQLite ID separate from the provider ID', () => {
        const item = buildProviderCoverItem(xtream, {
            id: 102,
            xtream_id: 7,
            title: 'Film',
        });
        expect(item).toMatchObject({
            xtreamId: 7,
            contentId: 102,
            contentType: 'movie',
        });
        expect(buildProviderCoverItem(xtream, { id: 102 })).toBeNull();
        expect(
            buildProviderCoverItem(xtream, { stream_id: 7, id: 7 })?.contentId
        ).toBeUndefined();
    });

    it.each([null, '', ' ', 'bad', Infinity, -1, 2.5])(
        'rejects malformed Xtream IDs (%s)',
        (id) => {
            expect(
                buildProviderCoverItem(xtream, { xtream_id: id })
            ).toBeNull();
        }
    );

    it('namespaces identical provider IDs by source, playlist and content kind', () => {
        const movie = buildProviderCoverItem(xtream, { xtream_id: 7 })!;
        const series = buildProviderCoverItem(
            { ...xtream, contentType: 'series' },
            { xtream_id: 7 }
        )!;
        const otherPlaylist = buildProviderCoverItem(
            { ...xtream, playlistId: 'b' },
            { xtream_id: 7 }
        )!;
        const otherSource = buildProviderCoverItem(stalker, { id: 7 })!;
        expect(
            new Set(
                [movie, series, otherPlaylist, otherSource].map(
                    contentCoverIdentity
                )
            ).size
        ).toBe(4);
    });

    it('preserves raw Stalker string IDs and does not synthesize an actionable ID', () => {
        expect(
            buildProviderCoverItem(stalker, { id: ' title-7 ', cmd: 'play-me' })
        ).toMatchObject({
            stalkerId: 'title-7',
            stalkerCmd: 'play-me',
        });
        expect(
            buildProviderCoverItem(stalker, { id: ' ', stream_id: 'real-id' })
                ?.stalkerId
        ).toBe('real-id');
        expect(
            buildProviderCoverItem(stalker, { name: 'Missing ID' })
        ).toBeNull();
    });

    it.each([true, 1, '1'])(
        'preserves VOD-series source section for flag %s',
        (is_series) => {
            const item = buildProviderCoverItem(stalker, {
                id: '7',
                is_series,
                category_id: '42',
            });
            expect(item).toMatchObject({
                contentType: 'series',
                categoryId: 'vod',
                stalkerItem: { id: '7', category_id: 'vod', is_series },
            });
        }
    );

    it('keeps array-only embedded VOD in its persisted movie namespace', () => {
        const row = { id: '7', series: ['episode-1'], category_id: '42' };
        const item = buildProviderCoverItem(stalker, row);
        expect(item).toMatchObject({ contentType: 'movie', categoryId: 'vod' });
        expect(row.category_id).toBe('42');
        expect(contentCoverIdentity(item!)).not.toBe(
            contentCoverIdentity(
                buildProviderCoverItem(
                    { ...stalker, contentType: 'series' },
                    { id: '7' }
                )!
            )
        );
    });

    it('persists regular series in the series section', () => {
        expect(
            buildProviderCoverItem(
                { ...stalker, contentType: 'series' },
                { id: '7' }
            )
        ).toMatchObject({
            contentType: 'series',
            stalkerItem: { category_id: 'series' },
        });
    });

    it.each(['live', 'itv', 'radio'])(
        'does not offer VOD actions for %s',
        (contentType) => {
            expect(
                buildProviderCoverItem(
                    { ...xtream, contentType },
                    { xtream_id: 7 }
                )
            ).toBeNull();
        }
    );
});

describe('episode cover progress recency', () => {
    it.each([
        ['2026-10-01 12:00:00', '2026-10-01T13:00:00Z'],
        ['2026-10-01T12:00:00Z', '2026-10-01 13:00:00'],
        ['2026-10-01 12:00:00.7', '2026-10-01T14:00:00.800+02:00'],
    ])(
        'compares SQLite UTC and ISO episode timestamps (%s before %s)',
        (earlierTimestamp, latestTimestamp) => {
            const earlier = Object.freeze({
                playlistId: 'a',
                contentType: 'episode' as const,
                contentXtreamId: 909,
                seriesXtreamId: 900,
                positionSeconds: 20,
                durationSeconds: 100,
                updatedAt: earlierTimestamp,
            });
            const latest = Object.freeze({
                ...earlier,
                positionSeconds: 40,
                updatedAt: latestTimestamp,
            });
            const history: UnifiedCollectionItem = Object.freeze({
                uid: 'xtream::a::series:909',
                name: 'Recent episode',
                contentType: 'series',
                sourceType: 'xtream',
                playlistId: 'a',
                playlistName: 'Portal',
                xtreamId: 909,
                historyContentType: 'episode',
            });
            for (const positions of [
                Object.freeze([earlier, latest]),
                Object.freeze([latest, earlier]),
            ]) {
                expect(findLatestSeriesEpisodePosition(positions, 900)).toBe(
                    latest
                );
                expect(
                    resolveCollectionSeriesHistory(history, positions)
                ).toEqual({
                    seriesId: 900,
                    position: latest,
                });
                expect(
                    collectionCoverIndicators(
                        history,
                        positions,
                        true,
                        'history'
                    ).progress
                ).toBe(40);
            }
            expect(earlier.updatedAt).toBe(earlierTimestamp);
            expect(latest.updatedAt).toBe(latestTimestamp);
        }
    );

    it('selects latest matching episode without treating completed episodes as the whole series', () => {
        const earlier = {
            contentType: 'episode' as const,
            contentXtreamId: 1,
            seriesXtreamId: 7,
            positionSeconds: 40,
            durationSeconds: 100,
            updatedAt: '2026-10-01T12:00:00Z',
        };
        const latest = {
            ...earlier,
            contentXtreamId: 2,
            positionSeconds: 100,
            updatedAt: '2026-10-02T12:00:00Z',
        };
        const other = {
            ...latest,
            seriesXtreamId: 8,
            updatedAt: '2026-10-03T12:00:00Z',
        };
        expect(
            findLatestSeriesEpisodePosition([earlier, latest, other], 7)
        ).toBe(latest);
        expect(findLatestSeriesEpisodePosition([other], 7)).toBeNull();
    });
});

describe('collection series history identity', () => {
    const series: UnifiedCollectionItem = {
        uid: 'xtream::a::series:909',
        name: 'Recent episode',
        contentType: 'series',
        sourceType: 'xtream',
        playlistId: 'a',
        playlistName: 'Portal',
        xtreamId: 909,
    };
    const episode: PlaybackPositionData = {
        playlistId: 'a',
        contentType: 'episode',
        contentXtreamId: 909,
        seriesXtreamId: 900,
        positionSeconds: 40,
        durationSeconds: 100,
        updatedAt: '2026-10-01T12:00:00Z',
    };

    it('keeps an episode history row distinct from the colliding parent series without changing raw IDs', () => {
        const parent = Object.freeze({
            ...series,
            historyContentType: 'series' as const,
            contentId: 11,
        });
        const recentEpisode = Object.freeze({
            ...series,
            historyContentType: 'episode' as const,
            contentId: 22,
        });
        expect(contentCoverIdentity(recentEpisode)).toBe(
            contentCoverIdentity(parent)
        );
        expect(collectionRowIdentity(recentEpisode)).not.toBe(
            collectionRowIdentity(parent)
        );
        const rows = [parent, recentEpisode];
        expect(new Set(rows.map(collectionRowIdentity)).size).toBe(2);
        expect(
            rows.filter(
                (row) =>
                    collectionRowIdentity(row) !==
                    collectionRowIdentity(recentEpisode)
            )
        ).toEqual([parent]);
        expect(recentEpisode).toMatchObject({
            uid: series.uid,
            xtreamId: 909,
            contentId: 22,
        });
    });

    it('keeps history row identities scoped and stable across native and PWA storage IDs', () => {
        const recentEpisode = {
            ...series,
            historyContentType: 'episode' as const,
        };
        expect(collectionRowIdentity({ ...recentEpisode, contentId: 22 })).toBe(
            collectionRowIdentity({ ...recentEpisode, contentId: 909 })
        );
        expect(
            new Set(
                [
                    recentEpisode,
                    { ...recentEpisode, playlistId: 'b' },
                    { ...recentEpisode, xtreamId: 910 },
                    {
                        ...recentEpisode,
                        sourceType: 'stalker' as const,
                        xtreamId: undefined,
                        stalkerId: '909',
                    },
                ].map(collectionRowIdentity)
            ).size
        ).toBe(4);
        expect(collectionRowIdentity(series)).toBe(
            contentCoverIdentity(series)
        );
        expect(
            collectionRowIdentity({ ...series, historyContentType: 'series' })
        ).toBe(contentCoverIdentity(series));
        expect(collectionRowIdentity({ ...series, contentType: 'live' })).toBe(
            series.uid
        );
    });

    it('resolves episode-keyed recent history while preserving the parent-only catalogue lookup', () => {
        expect(
            collectionCoverIndicators(series, [episode], true, 'history')
        ).toMatchObject({
            favorite: true,
            watchState: 'in-progress',
            progress: 40,
            progressScope: 'episode',
        });
        expect(
            collectionCoverIndicators(series, [episode], true)
        ).toMatchObject({
            watchState: 'unwatched',
            progress: null,
        });
    });

    it('keeps parent-keyed history and uses the latest matching history row', () => {
        const parentKeyed = { ...series, xtreamId: 900 };
        expect(
            collectionCoverIndicators(parentKeyed, [episode], false, 'history')
        ).toMatchObject({
            watchState: 'in-progress',
            progress: 40,
        });
        const newerParentPosition = {
            ...episode,
            contentXtreamId: 910,
            seriesXtreamId: 909,
            positionSeconds: 100,
            updatedAt: '2026-10-02T12:00:00Z',
        };
        expect(
            collectionCoverIndicators(
                series,
                [episode, newerParentPosition],
                false,
                'history'
            )
        ).toMatchObject({
            watchState: 'in-progress',
            progress: 100,
        });
    });

    it('never adopts a colliding episode from another playlist or a movie position', () => {
        const foreign = { ...episode, playlistId: 'other' };
        const movie = { ...episode, contentType: 'vod' as const };
        expect(
            collectionCoverIndicators(
                series,
                [foreign, movie],
                false,
                'history'
            )
        ).toMatchObject({
            watchState: 'unwatched',
            progress: null,
        });
    });

    it('keeps explicit episode history owned by its actual parent despite a newer colliding parent ID', () => {
        const recent = { ...series, historyContentType: 'episode' as const };
        const unrelated = {
            ...episode,
            contentXtreamId: 911,
            seriesXtreamId: 909,
            positionSeconds: 90,
            updatedAt: '2026-10-02T12:00:00Z',
        };
        expect(
            collectionCoverIndicators(
                recent,
                [episode, unrelated],
                true,
                'history'
            )
        ).toMatchObject({
            watchState: 'in-progress',
            progress: 40,
        });
        expect(
            resolveCollectionSeriesHistory(recent, [episode, unrelated])
        ).toEqual({
            seriesId: 900,
            position: episode,
        });
        expect(recent.xtreamId).toBe(909);
        expect(recent.uid).toBe(series.uid);
    });

    it('keeps explicit series and legacy parent matches ahead of a newer colliding direct episode', () => {
        const parent = {
            ...episode,
            contentXtreamId: 911,
            seriesXtreamId: 909,
            positionSeconds: 25,
            updatedAt: '2026-09-30T12:00:00Z',
        };
        for (const item of [
            series,
            { ...series, historyContentType: 'series' as const },
        ]) {
            expect(
                collectionCoverIndicators(
                    item,
                    [parent, episode],
                    true,
                    'history'
                )
            ).toMatchObject({
                watchState: 'in-progress',
                progress: 25,
            });
        }
    });

    it('does not infer an explicit episode parent from a collided series or foreign playlist', () => {
        const recent = { ...series, historyContentType: 'episode' as const };
        const unrelated = {
            ...episode,
            contentXtreamId: 911,
            seriesXtreamId: 909,
        };
        expect(
            resolveCollectionSeriesHistory(recent, [
                unrelated,
                { ...episode, playlistId: 'foreign' },
            ])
        ).toEqual({
            seriesId: null,
            position: null,
        });
        expect(
            collectionCoverIndicators(recent, [unrelated], undefined, 'history')
        ).toMatchObject({
            watchState: 'unwatched',
            progress: null,
        });
    });
});
