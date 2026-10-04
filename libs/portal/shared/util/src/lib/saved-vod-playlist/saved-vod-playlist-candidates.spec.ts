import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import {
    createSavedVodMovieCandidate,
    createSavedVodStalkerEpisodeCandidate,
    createSavedVodXtreamEpisodeCandidate,
} from './saved-vod-playlist-candidates';

describe('saved VOD candidate factories', () => {
    const episode = {
        id: '23',
        title: 'Pilot',
        season: 0,
        episode_num: 1,
    } as XtreamSerieEpisode;
    const stalker = {
        sourceId: 'source-1',
        seriesId: 'show-a',
        seriesMode: 'vod-series' as const,
        seasonId: 'raw-season-b',
        seasonNumber: 0,
        episodeNumber: '1',
        title: 'Pilot',
    };

    it.each(['xtream', 'stalker'] as const)(
        'creates only movie identity/title for %s',
        (provider) => {
            const raw = {
                provider,
                sourceId: 'source-1',
                contentId: 22,
                title: 'A movie',
                cmd: 'private',
                username: 'secret',
                password: 'secret',
            };
            expect(createSavedVodMovieCandidate(raw)).toEqual({
                title: 'A movie',
                reference: {
                    provider,
                    sourceId: 'source-1',
                    kind: 'movie',
                    contentId: '22',
                },
            });
            expect(raw.cmd).toBe('private');
        }
    );

    it('uses provider episode and parent IDs, including specials season zero', () => {
        expect(
            createSavedVodXtreamEpisodeCandidate({
                sourceId: 'source-1',
                seriesId: 11,
                episode,
            })
        ).toEqual({
            title: 'Pilot',
            reference: {
                provider: 'xtream',
                sourceId: 'source-1',
                kind: 'episode',
                seriesId: '11',
                contentId: '23',
                seasonNumber: 0,
                episodeNumber: 1,
            },
        });
    });
    it('treats Stalker provider IDs as opaque and preserves a raw zero season ID', () => {
        expect(
            createSavedVodMovieCandidate({
                provider: 'stalker',
                sourceId: 'source-1',
                contentId: '0',
                title: 'Movie',
            })?.reference
        ).toEqual({
            provider: 'stalker',
            sourceId: 'source-1',
            kind: 'movie',
            contentId: '0',
        });
        expect(
            createSavedVodStalkerEpisodeCandidate({ ...stalker, seasonId: 0 })
                ?.reference
        ).toMatchObject({ seasonId: '0', seasonNumber: 0 });
    });

    it.each(['series', 'vod-series'] as const)(
        'preserves raw Stalker season identity and catalog origin %s',
        (seriesMode) => {
            expect(
                createSavedVodStalkerEpisodeCandidate({
                    ...stalker,
                    seriesMode,
                })
            ).toEqual({
                title: 'Pilot',
                reference: {
                    provider: 'stalker',
                    sourceId: 'source-1',
                    kind: 'episode',
                    seriesId: 'show-a',
                    seriesMode,
                    seasonId: 'raw-season-b',
                    seasonNumber: 0,
                    episodeNumber: 1,
                },
            });
        }
    );

    it.each([
        '',
        'http://private/user/password',
        0,
        '00',
        -2,
        Number.MAX_SAFE_INTEGER + 1,
    ])('rejects unavailable/unsafe movie identity %s', (contentId) => {
        expect(
            createSavedVodMovieCandidate({
                provider: 'xtream',
                sourceId: 'source',
                contentId,
                title: 'Movie',
            })
        ).toBeNull();
    });

    it('rejects invalid source/title and non-numeric Xtream identities', () => {
        expect(
            createSavedVodMovieCandidate({
                provider: 'xtream',
                sourceId: '',
                contentId: 1,
                title: 'Movie',
            })
        ).toBeNull();
        expect(
            createSavedVodMovieCandidate({
                provider: 'xtream',
                sourceId: 'source',
                contentId: 'local-row',
                title: 'Movie',
            })
        ).toBeNull();
        expect(
            createSavedVodStalkerEpisodeCandidate({
                ...stalker,
                title: 'x'.repeat(301),
            })
        ).toBeNull();
    });
    it('rejects absent runtime episode metadata without throwing', () => {
        expect(
            createSavedVodXtreamEpisodeCandidate({
                sourceId: 'source',
                seriesId: 1,
                episode: null as unknown as XtreamSerieEpisode,
            })
        ).toBeNull();
    });

    it.each([0, -1, ' ', '1.2', Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid episode coordinate %s',
        (episodeNumber) => {
            expect(
                createSavedVodStalkerEpisodeCandidate({
                    ...stalker,
                    episodeNumber,
                })
            ).toBeNull();
        }
    );

    it('never includes transport commands, generated hashes or resolved URLs', () => {
        const result = createSavedVodStalkerEpisodeCandidate({
            ...stalker,
            ...{
                originalCmd: 'ffmpeg http://private',
                id: 'generated-tracking',
                originalId: 'not-season',
                direct_source: 'private',
                transportMode: 'EmbeddedVod',
            },
        });
        expect(result?.reference).toEqual({
            provider: 'stalker',
            sourceId: 'source-1',
            kind: 'episode',
            seriesId: 'show-a',
            seriesMode: 'vod-series',
            seasonId: 'raw-season-b',
            seasonNumber: 0,
            episodeNumber: 1,
        });
        expect(JSON.stringify(result)).not.toMatch(
            /private|generated|ffmpeg|transportMode/
        );
    });
});
