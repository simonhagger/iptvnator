import { EMPTY, of } from 'rxjs';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
    PORTAL_EXTERNAL_PLAYBACK,
    PORTAL_PLAYBACK_POSITIONS,
    PORTAL_PLAYER,
    type SeriesResumeTarget,
} from '@iptvnator/portal/shared/util';
import {
    StalkerStore,
    type StalkerVodSource,
} from '@iptvnator/portal/stalker/data-access';
import { TmdbEnrichmentService } from '@iptvnator/services';
import type {
    ExternalPlayerSession,
    PlaybackPositionData,
} from '@iptvnator/shared/interfaces';
import { StalkerSeriesViewComponent } from './stalker-series-view.component';
import { STALKER_SERIES_RESUME_TARGET } from './stalker-series-resume';

/**
 * Dashboard "Continue watching" handoff into the Stalker series view: the
 * one-shot resume target provided through `STALKER_SERIES_RESUME_TARGET`.
 */
describe('StalkerSeriesViewComponent dashboard resume handoff', () => {
    let fixture: ComponentFixture<StalkerSeriesViewComponent>;
    const selectedContentType = signal<'series' | 'vod'>('series');
    const selectedItem = signal<StalkerVodSource | null>(null);
    const serialSeasons = signal<unknown[]>([]);
    const vodSeasons = signal<unknown[]>([]);
    const seriesResumeTarget = signal<SeriesResumeTarget | null>(null);
    const resolveVodPlayback = jest.fn();
    const fetchVodSeriesEpisodes = jest.fn();
    const getSeriesPlaybackPositions = jest.fn();
    const openResolvedPlayback = jest.fn();
    const activeSession = signal<ExternalPlayerSession | null>(null);
    const closeSession = jest.fn();
    const currentPlaylist = signal({
        _id: 'stalker-1',
        title: 'Portal',
        portalUrl: 'https://stalker.example',
        macAddress: '00:1A:79:12:34:56',
    });

    async function stabilize(): Promise<void> {
        fixture.detectChanges();
        await fixture.whenStable();
    }

    /** Runs the effect chain until the async position read has landed. */
    async function settle(): Promise<void> {
        await stabilize();
        await stabilize();
        await stabilize();
    }

    function trackingIdOf(seasonKey: string, episodeNum: number): number {
        return Number(
            fixture.componentInstance
                .mappedSeasons()
                [seasonKey]?.find(
                    (episode) => Number(episode.episode_num) === episodeNum
                )?.id
        );
    }

    beforeEach(async () => {
        selectedContentType.set('series');
        selectedItem.set({
            id: '30001',
            cmd: '/media/file_30001.mpg',
            info: { name: 'Regular Series', movie_image: 'poster.jpg' },
        });
        serialSeasons.set([
            {
                id: 'season-1',
                name: 'Season 1',
                cmd: '/media/file_30001.mpg',
                series: [1, 2],
            },
        ]);
        vodSeasons.set([]);
        seriesResumeTarget.set(null);
        resolveVodPlayback
            .mockReset()
            .mockImplementation(
                async (
                    _command: string,
                    title: string,
                    thumbnail: string,
                    _episodeNumber: number,
                    episodeId: number,
                    startTime?: number
                ) => ({
                    streamUrl: 'https://resolved.example/episode.mpg',
                    title,
                    thumbnail,
                    startTime,
                    contentInfo: {
                        playlistId: 'stalker-1',
                        contentXtreamId: episodeId,
                        contentType: 'episode',
                        seriesXtreamId: Number(selectedItem()?.id ?? 0),
                    },
                })
            );
        fetchVodSeriesEpisodes.mockReset();
        getSeriesPlaybackPositions.mockReset().mockResolvedValue([]);
        openResolvedPlayback.mockReset();
        activeSession.set(null);
        closeSession
            .mockReset()
            .mockImplementation(async () => activeSession.set(null));

        await TestBed.configureTestingModule({
            imports: [StalkerSeriesViewComponent],
            providers: [
                {
                    provide: StalkerStore,
                    useValue: {
                        selectedItem,
                        selectedContentType,
                        currentPlaylist,
                        getSerialSeasonsResource: () => serialSeasons(),
                        getVodSeriesSeasonsResource: () => vodSeasons(),
                        isVodSeriesSeasonsLoading: signal(false),
                        isSerialSeasonsLoading: signal(false),
                        fetchVodSeriesEpisodes,
                        resolveVodPlayback,
                        fetchLinkToPlay: jest.fn(),
                        clearSelectedItem: jest.fn(),
                    },
                },
                {
                    provide: PORTAL_EXTERNAL_PLAYBACK,
                    useValue: { activeSession, closeSession },
                },
                {
                    provide: PORTAL_PLAYBACK_POSITIONS,
                    useValue: {
                        getSeriesPlaybackPositions,
                        savePlaybackPosition: jest.fn(),
                        clearPlaybackPosition: jest.fn(),
                    },
                },
                {
                    provide: PORTAL_PLAYER,
                    useValue: {
                        isEmbeddedPlayer: () => false,
                        openResolvedPlayback,
                    },
                },
                {
                    provide: STALKER_SERIES_RESUME_TARGET,
                    useValue: seriesResumeTarget,
                },
                { provide: Router, useValue: { navigateByUrl: jest.fn() } },
                {
                    provide: TmdbEnrichmentService,
                    useValue: {
                        isEnabled: () => false,
                        getSeason: jest.fn().mockResolvedValue(null),
                        getSeasonEpisodes: jest.fn(),
                    },
                },
                { provide: MatSnackBar, useValue: { open: jest.fn() } },
                {
                    provide: TranslateService,
                    useValue: {
                        instant: (key: string) => key,
                        get: (key: string) => of(key),
                        stream: (key: string) => of(key),
                        currentLang: 'en',
                        defaultLang: 'en',
                        onLangChange: EMPTY,
                        onTranslationChange: EMPTY,
                        onDefaultLangChange: EMPTY,
                    },
                },
            ],
        })
            .overrideComponent(StalkerSeriesViewComponent, {
                set: { template: '' },
            })
            .compileComponents();
        fixture = TestBed.createComponent(StalkerSeriesViewComponent);
    });

    afterEach(() => fixture.destroy());

    it.each(['mpv', 'vlc'] as const)(
        'closes the configured %s session before starting the same episode over',
        async (player) => {
            await settle();
            const episode = fixture.componentInstance.mappedSeasons()['1'][0];
            const running: ExternalPlayerSession = {
                id: `${player}-running`,
                player,
                status: 'playing',
                title: 'Episode 1',
                streamUrl: 'https://resolved.example/episode.mpg',
                startedAt: '2026-10-04T00:00:00Z',
                updatedAt: '2026-10-04T00:00:00Z',
                canClose: true,
                contentInfo: {
                    playlistId: 'stalker-1',
                    contentXtreamId: Number(episode.id),
                    contentType: 'episode',
                    seriesXtreamId: 30001,
                },
            };
            activeSession.set(running);
            fixture.componentInstance.onEpisodeClicked(
                episode,
                undefined,
                undefined,
                true
            );
            await settle();
            await new Promise((resolve) => setTimeout(resolve));

            expect(closeSession).toHaveBeenCalledWith(running);
            expect(closeSession.mock.invocationCallOrder[0]).toBeLessThan(
                openResolvedPlayback.mock.invocationCallOrder[0]
            );
            expect(openResolvedPlayback).toHaveBeenCalledWith(
                expect.objectContaining({ startTime: 0 }),
                true
            );
        }
    );

    it.each([0, 42])(
        'prefers scoped progress over a legacy handoff at %s',
        async (legacyOffset) => {
            getSeriesPlaybackPositions.mockImplementation(async () => [
                {
                    playlistId: 'stalker-1',
                    contentXtreamId: trackingIdOf('1', 2),
                    contentType: 'episode',
                    seriesXtreamId: 30001,
                    seasonNumber: 1,
                    episodeNumber: 2,
                    positionSeconds: 300,
                    durationSeconds: 1800,
                },
                {
                    playlistId: 'stalker-1',
                    contentXtreamId: 123456,
                    contentType: 'episode',
                    seriesXtreamId: 30001,
                    seasonNumber: 1,
                    episodeNumber: 2,
                    positionSeconds: legacyOffset,
                    durationSeconds: 1800,
                },
            ]);
            await stabilize();
            seriesResumeTarget.set({
                seriesXtreamId: 30001,
                contentXtreamId: 123456,
                seasonNumber: 1,
                episodeNumber: 2,
            });
            await settle();
            expect(resolveVodPlayback).toHaveBeenCalledWith(
                '/media/file_30001.mpg',
                'Regular Series',
                'poster.jpg',
                2,
                trackingIdOf('1', 2),
                300
            );
        }
    );

    it('resumes the handoff episode at its saved offset once the series positions are read', async () => {
        // Position saved under the episode's own tracking id — resolved
        // lazily, since a regular-series id hashes the season command.
        getSeriesPlaybackPositions.mockImplementation(async () => [
            {
                playlistId: 'stalker-1',
                contentXtreamId: trackingIdOf('1', 2),
                contentType: 'episode',
                seriesXtreamId: 30001,
                seasonNumber: 1,
                episodeNumber: 2,
                positionSeconds: 300,
                durationSeconds: 1800,
            } satisfies PlaybackPositionData,
        ]);
        await stabilize();
        seriesResumeTarget.set({
            seriesXtreamId: 30001,
            contentXtreamId: trackingIdOf('1', 2),
            seasonNumber: 1,
            episodeNumber: 2,
        });

        await settle();

        expect(resolveVodPlayback).toHaveBeenCalledTimes(1);
        expect(resolveVodPlayback).toHaveBeenCalledWith(
            '/media/file_30001.mpg',
            'Regular Series',
            'poster.jpg',
            2,
            trackingIdOf('1', 2),
            300
        );
        expect(openResolvedPlayback).toHaveBeenCalledTimes(1);

        // One-shot: further change detection never replays the handoff.
        await settle();
        expect(resolveVodPlayback).toHaveBeenCalledTimes(1);
    });

    it('ignores a handoff that names another series', async () => {
        seriesResumeTarget.set({
            seriesXtreamId: 777,
            contentXtreamId: 1,
            seasonNumber: 1,
            episodeNumber: 1,
        });

        await settle();

        expect(resolveVodPlayback).not.toHaveBeenCalled();
    });

    it('does nothing when the positions read failed, so the episode never restarts from zero', async () => {
        getSeriesPlaybackPositions.mockRejectedValue(new Error('db down'));
        seriesResumeTarget.set({
            seriesXtreamId: 30001,
            contentXtreamId: 1,
            seasonNumber: 1,
            episodeNumber: 2,
        });

        await settle();

        expect(resolveVodPlayback).not.toHaveBeenCalled();
    });

    it('retries the lazy season once after a transient portal failure', async () => {
        // A failed fetch leaves the season unloaded, so the handoff would
        // otherwise be stranded for the lifetime of this detail host.
        selectedContentType.set('vod');
        selectedItem.set({
            id: '50001',
            is_series: true,
            info: { name: 'VOD Flagged Series', movie_image: 'vod.jpg' },
        });
        serialSeasons.set([]);
        vodSeasons.set([
            {
                id: 'season-1',
                video_id: '50001',
                season_number: '1',
                name: 'Season 1',
            },
        ]);
        fetchVodSeriesEpisodes
            .mockRejectedValueOnce(new Error('portal down'))
            .mockResolvedValue([
                { id: 'episode-1', series_number: 1, name: 'Pilot' },
                { id: 'episode-2', series_number: 2, name: 'Second' },
            ]);
        getSeriesPlaybackPositions.mockResolvedValue([
            {
                playlistId: 'stalker-1',
                contentXtreamId: 123_456,
                contentType: 'episode',
                seriesXtreamId: 50001,
                seasonNumber: 1,
                episodeNumber: 2,
                positionSeconds: 90,
                durationSeconds: 1500,
            } satisfies PlaybackPositionData,
        ]);
        seriesResumeTarget.set({
            seriesXtreamId: 50001,
            contentXtreamId: 123_456,
            seasonNumber: 1,
            episodeNumber: 2,
        });

        await settle();
        await settle();
        await settle();

        expect(fetchVodSeriesEpisodes).toHaveBeenCalledTimes(2);
        expect(resolveVodPlayback).toHaveBeenCalledTimes(1);
        expect(resolveVodPlayback).toHaveBeenCalledWith(
            '/media/file_episode-2.mpg',
            'VOD Flagged Series - Second',
            'vod.jpg',
            2,
            trackingIdOf('1', 2),
            90
        );
    });

    it('stops asking the portal after the bounded retry also fails', async () => {
        selectedContentType.set('vod');
        selectedItem.set({
            id: '50001',
            is_series: true,
            info: { name: 'VOD Flagged Series', movie_image: 'vod.jpg' },
        });
        serialSeasons.set([]);
        vodSeasons.set([
            {
                id: 'season-1',
                video_id: '50001',
                season_number: '1',
                name: 'Season 1',
            },
        ]);
        fetchVodSeriesEpisodes.mockRejectedValue(new Error('portal down'));
        getSeriesPlaybackPositions.mockResolvedValue([
            {
                playlistId: 'stalker-1',
                contentXtreamId: 123_456,
                contentType: 'episode',
                seriesXtreamId: 50001,
                seasonNumber: 1,
                episodeNumber: 2,
                positionSeconds: 90,
                durationSeconds: 1500,
            } satisfies PlaybackPositionData,
        ]);
        seriesResumeTarget.set({
            seriesXtreamId: 50001,
            contentXtreamId: 123_456,
            seasonNumber: 1,
            episodeNumber: 2,
        });

        await settle();
        await settle();
        await settle();
        await settle();

        // Bounded: a portal that is simply down is asked twice, not forever.
        expect(fetchVodSeriesEpisodes).toHaveBeenCalledTimes(2);
        expect(resolveVodPlayback).not.toHaveBeenCalled();
    });

    it('hydrates the lazy VOD season the handoff lives in, then resumes its episode', async () => {
        selectedContentType.set('vod');
        selectedItem.set({
            id: '50001',
            is_series: true,
            info: { name: 'VOD Flagged Series', movie_image: 'vod.jpg' },
        });
        serialSeasons.set([]);
        vodSeasons.set([
            {
                id: 'season-1',
                video_id: '50001',
                season_number: '1',
                name: 'Season 1',
            },
        ]);
        fetchVodSeriesEpisodes.mockResolvedValue([
            { id: 'episode-1', series_number: 1, name: 'Pilot' },
            { id: 'episode-2', series_number: 2, name: 'Second' },
        ]);
        // A pre-scope row: its id matches no minted tracking id, so the
        // episode is found by coordinates and the offset still comes from
        // the row the dashboard card was built from.
        getSeriesPlaybackPositions.mockResolvedValue([
            {
                playlistId: 'stalker-1',
                contentXtreamId: 123_456,
                contentType: 'episode',
                seriesXtreamId: 50001,
                seasonNumber: 1,
                episodeNumber: 2,
                positionSeconds: 90,
                durationSeconds: 1500,
            } satisfies PlaybackPositionData,
        ]);
        seriesResumeTarget.set({
            seriesXtreamId: 50001,
            contentXtreamId: 123_456,
            seasonNumber: 1,
            episodeNumber: 2,
        });

        await settle();
        await settle();

        expect(fetchVodSeriesEpisodes).toHaveBeenCalledWith(
            '50001',
            'season-1'
        );
        expect(resolveVodPlayback).toHaveBeenCalledTimes(1);
        expect(resolveVodPlayback).toHaveBeenCalledWith(
            '/media/file_episode-2.mpg',
            'VOD Flagged Series - Second',
            'vod.jpg',
            2,
            trackingIdOf('1', 2),
            90
        );
    });
    it('offers timed resume and restarts the same episode at zero', async () => {
        await stabilize();
        const episode = fixture.componentInstance.mappedSeasons()['1'][0];
        fixture.componentInstance.episodePlaybackPositions.set(
            new Map([
                [
                    Number(episode.id),
                    {
                        contentXtreamId: Number(episode.id),
                        contentType: 'episode',
                        seriesXtreamId: 30001,
                        positionSeconds: 42,
                        durationSeconds: 120,
                        playlistId: 'stalker-1',
                        updatedAt: '2026-10-04T10:00:00Z',
                    },
                ],
            ])
        );
        fixture.detectChanges();
        expect(fixture.componentInstance.quickStartAction()?.action?.kind).toBe(
            'resume'
        );
        await fixture.componentInstance.playQuickStartEpisode();
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
        expect(resolveVodPlayback).toHaveBeenLastCalledWith(
            '/media/file_30001.mpg',
            'Regular Series',
            'poster.jpg',
            1,
            Number(episode.id),
            42
        );
        fixture.componentInstance.restartQuickStartEpisode();
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
        expect(resolveVodPlayback).toHaveBeenLastCalledWith(
            '/media/file_30001.mpg',
            'Regular Series',
            'poster.jpg',
            1,
            Number(episode.id),
            0
        );
    });
});
