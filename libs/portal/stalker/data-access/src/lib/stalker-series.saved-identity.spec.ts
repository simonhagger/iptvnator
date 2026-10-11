import {
    mapRegularSeriesEpisodes,
    mapRegularSeriesSeasons,
    mapVodSeriesEpisodes,
    mapVodSeriesSeasonsToVm,
    type StalkerMappedEpisode,
} from './stalker-series.adapters';
import type { StalkerVodSource } from './models';

describe('Stalker mapped episode saved identity', () => {
    it.each([null, undefined])(
        'does not manufacture a provider season identity from %s',
        (id) => {
            const invalidId = id as unknown as string;
            const regular = mapRegularSeriesSeasons(null, [
                {
                    id: invalidId,
                    name: 'Season 1',
                    cmd: '/media/file.mpg',
                    series: ['1'],
                    description: '',
                    director: '',
                    actors: '',
                    year: '',
                    genres_str: '',
                    age: '',
                    rating_imdb: '',
                    rating_kinopoisk: '',
                    screenshot_uri: '',
                    added: '',
                },
            ]);
            expect(
                (
                    mapRegularSeriesEpisodes(regular)[
                        '1'
                    ][0] as StalkerMappedEpisode
                ).providerSeasonId
            ).toBe('');
            const lazy = mapVodSeriesSeasonsToVm([
                {
                    id: invalidId,
                    video_id: 'video',
                    name: 'Season 1',
                    season_number: '1',
                },
            ]);
            expect(lazy[0].id).toBe('');
            const embedded = mapRegularSeriesSeasons(
                {
                    id: invalidId,
                    series: [1],
                    info: { name: 'Show' },
                } as StalkerVodSource,
                []
            );
            expect(
                (
                    mapRegularSeriesEpisodes(embedded)[
                        '1'
                    ][0] as StalkerMappedEpisode
                ).providerSeasonId
            ).toBe('');
        }
    );
    it('retains composite regular season IDs rather than the corrected display key or history hash', () => {
        const seasons = [
            {
                id: 'series:30001:season:raw-5',
                name: 'Season 1',
                cmd: '/media/file.mpg',
                series: [1, 2],
            },
        ];
        const original = mapRegularSeriesEpisodes(seasons);
        const corrected = mapRegularSeriesEpisodes(
            seasons,
            undefined,
            'Show season 5'
        );
        const episode = corrected['5'][0] as StalkerMappedEpisode;
        expect(episode.providerSeasonId).toBe(seasons[0].id);
        expect(episode.season).toBe(5);
        expect(episode.id).toBe(original['1'][0].id);
        expect(episode.originalCmd).toBe(seasons[0].cmd);
    });

    it('retains lazy VOD raw season IDs through title-based numbering correction', () => {
        const seasons = mapVodSeriesSeasonsToVm(
            [
                {
                    id: 'raw-season:original',
                    video_id: 'video-1',
                    season_number: '1',
                    name: 'Season 1',
                },
            ],
            'Show s02'
        );
        const loaded = seasons.map((season) => ({
            ...season,
            episodes: [
                {
                    id: 'provider-episode',
                    series_number: 4,
                    name: 'Episode Four',
                },
            ],
        }));
        const episode = mapVodSeriesEpisodes(loaded, {
            parentSeriesId: 'series-9',
        })['2'][0] as StalkerMappedEpisode;
        expect(episode.providerSeasonId).toBe('raw-season:original');
        expect(episode.providerSeasonNumber).toBe(1);
        expect(episode.originalId).toBe('provider-episode');
        expect(episode.episode_num).toBe(4);
        expect(episode.providerSeasonId).not.toBe(episode.id);
    });

    it('uses the embedded VOD parent ID for its single provider season', () => {
        const source = {
            id: 'embedded-parent:9',
            cmd: '/media/embedded.mpg',
            series: [1, 2],
            info: { name: 'Embedded Show' },
        } as StalkerVodSource;
        const seasons = mapRegularSeriesSeasons(source, []);
        const episode = mapRegularSeriesEpisodes(seasons)[
            '1'
        ][0] as StalkerMappedEpisode;
        expect(episode.providerSeasonId).toBe(source.id);
        expect(episode.originalCmd).toBe(source.cmd);
    });
});
