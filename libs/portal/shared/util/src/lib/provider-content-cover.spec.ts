import {
    buildProviderCoverItem,
    contentCoverIdentity,
    findLatestSeriesEpisodePosition,
} from './provider-content-cover';

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
