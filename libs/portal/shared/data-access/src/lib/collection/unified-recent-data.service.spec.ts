import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of, throwError } from 'rxjs';
import { DatabaseService, PlaylistsService } from '@iptvnator/services';
import {
    Channel,
    M3uRecentlyViewedItem,
    Playlist,
    PlaylistMeta,
} from '@iptvnator/shared/interfaces';
import {
    PortalPlaybackPositions,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import { projectCollectionCovers } from './collection-cover-projection';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';
import { UnifiedRecentDataService } from './unified-recent-data.service';

describe('UnifiedRecentDataService', () => {
    let service: UnifiedRecentDataService;
    let store: { select: jest.Mock; dispatch: jest.Mock };
    let playlistsService: {
        getPlaylistById: jest.Mock;
        addM3uRecentlyViewed: jest.Mock;
        removeFromM3uRecentlyViewed: jest.Mock;
        removeFromPortalRecentlyViewed: jest.Mock;
        removeFromPlaylistRecentlyViewedBatch: jest.Mock;
        clearPlaylistRecentlyViewed: jest.Mock;
        getAllPlaylists: jest.Mock;
    };
    let dbService: {
        getGlobalRecentlyViewed: jest.Mock;
        getRecentItems: jest.Mock;
        removeRecentItem: jest.Mock;
        removeRecentItemsBatch: jest.Mock;
        clearPlaylistRecentItems: jest.Mock;
        clearGlobalRecentlyViewed: jest.Mock;
        addRecentItem: jest.Mock;
        getContentByXtreamId: jest.Mock;
    };
    let xtreamDataSource: {
        addRecentItem: jest.Mock;
        clearRecentItems: jest.Mock;
        getContentByXtreamId: jest.Mock;
        getRecentItems: jest.Mock;
        removeRecentItem: jest.Mock;
    };

    const playlistMeta = {
        _id: 'm3u-1',
        title: 'M3U List',
        count: 0,
        importDate: '2026-01-01T00:00:00.000Z',
        autoRefresh: false,
        recentlyViewed: [
            {
                source: 'm3u',
                id: 'https://example.com/2.m3u8',
                url: 'https://example.com/2.m3u8',
                title: 'Recent Channel',
                channel_id: 'channel-2',
                tvg_id: 'recent-two',
                category_id: 'live',
                added_at: '2026-03-26T11:00:00.000Z',
            },
        ],
    } satisfies PlaylistMeta;

    const channels: Channel[] = [
        {
            id: 'channel-1',
            name: 'Channel One',
            url: 'https://example.com/1.m3u8',
            group: { title: 'News' },
            tvg: {
                id: 'one',
                name: 'Channel One',
                url: '',
                logo: 'one.png',
                rec: '',
            },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: 'false',
            epgParams: '',
        },
        {
            id: 'channel-2',
            name: 'Channel Two',
            url: 'https://example.com/2.m3u8',
            group: { title: 'Sports' },
            tvg: {
                id: '',
                name: 'Channel Two',
                url: '',
                logo: 'two.png',
                rec: '',
            },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: 'true',
            epgParams: '',
        },
    ];

    const createPortalActivityElectronApi = (): Window['electron'] =>
        ({
            dbGetRecentlyViewed: jest.fn(),
            dbClearRecentlyViewed: jest.fn(),
            dbGetAllGlobalFavorites: jest.fn(),
            dbGetGlobalRecentlyAdded: jest.fn(),
            dbAddFavorite: jest.fn(),
            dbRemoveFavorite: jest.fn(),
            dbGetFavorites: jest.fn(),
            dbReorderGlobalFavorites: jest.fn(),
            dbGetRecentItems: jest.fn(),
            dbAddRecentItem: jest.fn(),
            dbClearPlaylistRecentItems: jest.fn(),
            dbRemoveRecentItem: jest.fn(),
            dbRemoveRecentItemsBatch: jest.fn(),
            dbGetContentByXtreamId: jest.fn(),
        }) as unknown as Window['electron'];

    beforeEach(() => {
        Object.defineProperty(window, 'electron', {
            value: createPortalActivityElectronApi(),
            configurable: true,
        });
        store = {
            select: jest.fn(() => of([playlistMeta])),
            dispatch: jest.fn(),
        };
        playlistsService = {
            getPlaylistById: jest.fn().mockReturnValue(
                of({
                    _id: 'm3u-1',
                    playlist: { items: channels },
                } satisfies Partial<Playlist>)
            ),
            addM3uRecentlyViewed: jest.fn().mockReturnValue(
                of({
                    recentlyViewed: [
                        {
                            source: 'm3u',
                            id: 'https://example.com/1.m3u8',
                            url: 'https://example.com/1.m3u8',
                            title: 'Channel One',
                            category_id: 'live',
                            added_at: '2026-03-26T12:00:00.000Z',
                        },
                    ],
                })
            ),
            removeFromM3uRecentlyViewed: jest
                .fn()
                .mockReturnValue(of({ recentlyViewed: [] })),
            removeFromPortalRecentlyViewed: jest
                .fn()
                .mockReturnValue(of({ recentlyViewed: [] })),
            removeFromPlaylistRecentlyViewedBatch: jest
                .fn()
                .mockReturnValue(of({ recentlyViewed: [] })),
            clearPlaylistRecentlyViewed: jest
                .fn()
                .mockReturnValue(of({ recentlyViewed: [] })),
            getAllPlaylists: jest.fn().mockReturnValue(of([])),
        };
        dbService = {
            getGlobalRecentlyViewed: jest.fn().mockResolvedValue([]),
            getRecentItems: jest.fn().mockResolvedValue([]),
            removeRecentItem: jest.fn().mockResolvedValue(true),
            removeRecentItemsBatch: jest.fn().mockResolvedValue(true),
            clearPlaylistRecentItems: jest.fn().mockResolvedValue(true),
            clearGlobalRecentlyViewed: jest.fn().mockResolvedValue(undefined),
            addRecentItem: jest.fn().mockResolvedValue(true),
            getContentByXtreamId: jest.fn().mockResolvedValue(null),
        };
        xtreamDataSource = {
            addRecentItem: jest.fn().mockResolvedValue(undefined),
            clearRecentItems: jest.fn().mockResolvedValue(undefined),
            getContentByXtreamId: jest.fn().mockResolvedValue(null),
            getRecentItems: jest.fn().mockResolvedValue([]),
            removeRecentItem: jest.fn().mockResolvedValue(undefined),
        };

        TestBed.configureTestingModule({
            providers: [
                UnifiedRecentDataService,
                { provide: Store, useValue: store },
                { provide: PlaylistsService, useValue: playlistsService },
                { provide: DatabaseService, useValue: dbService },
                {
                    provide: XTREAM_DATA_SOURCE,
                    useValue: xtreamDataSource,
                },
            ],
        });

        service = TestBed.inject(UnifiedRecentDataService);
    });

    it('rehydrates M3U recent items with stream and channel metadata', async () => {
        const items = await service.getRecentItems('playlist', 'm3u-1', 'm3u');

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            uid: 'm3u::m3u-1::https://example.com/2.m3u8',
            sourceType: 'm3u',
            streamUrl: 'https://example.com/2.m3u8',
            channelId: 'channel-2',
            name: 'Recent Channel',
            tvgId: 'recent-two',
            logo: 'two.png',
            radio: 'true',
            m3uChannel: channels[1],
        });
    });

    it('records M3U live playback through playlist recently viewed storage', async () => {
        const item = {
            uid: 'm3u::m3u-1::https://example.com/1.m3u8',
            name: 'Channel One',
            contentType: 'live',
            sourceType: 'm3u',
            playlistId: 'm3u-1',
            playlistName: 'M3U List',
            streamUrl: 'https://example.com/1.m3u8',
            channelId: 'channel-1',
            tvgId: 'one',
            logo: 'one.png',
        } satisfies UnifiedCollectionItem;

        const recorded = await service.recordLivePlayback(item);

        expect(playlistsService.addM3uRecentlyViewed).toHaveBeenCalledWith(
            'm3u-1',
            expect.objectContaining<Partial<M3uRecentlyViewedItem>>({
                source: 'm3u',
                url: 'https://example.com/1.m3u8',
                channel_id: 'channel-1',
                tvg_id: 'one',
            })
        );
        expect(store.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: expect.stringContaining('Update Playlist Meta'),
            })
        );
        expect(recorded.viewedAt).toBeTruthy();
    });

    it('removes Stalker VOD history with the source content kind', async () => {
        await service.removeRecentItem({
            uid: 'stalker::stalker-1::100',
            name: 'Series',
            contentType: 'series',
            sourceType: 'stalker',
            playlistId: 'stalker-1',
            playlistName: 'Stalker',
            stalkerId: '100',
        });

        expect(
            playlistsService.removeFromPortalRecentlyViewed
        ).toHaveBeenCalledWith('stalker-1', '100', 'series');
        expect(store.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                playlist: expect.objectContaining({
                    _id: 'stalker-1',
                    recentlyViewed: [],
                }),
            })
        );
    });

    it('does not publish removed Stalker history when persistence fails', async () => {
        playlistsService.removeFromPortalRecentlyViewed.mockReturnValue(
            throwError(() => new Error('storage unavailable'))
        );

        await expect(
            service.removeRecentItem({
                uid: 'stalker::stalker-1::100',
                name: 'Movie',
                contentType: 'movie',
                sourceType: 'stalker',
                playlistId: 'stalker-1',
                playlistName: 'Stalker',
                stalkerId: '100',
            })
        ).rejects.toThrow('storage unavailable');

        expect(store.dispatch).not.toHaveBeenCalled();
    });

    it.each(['all', 'playlist'] as const)(
        'preserves native Xtream ratings in %s Recent covers',
        async (scope) => {
            const row = {
                id: 22,
                xtream_id: 100,
                title: 'Rated Movie',
                type: 'movie',
                rating: '8.2',
                playlist_id: 'xtream-1',
                viewed_at: '2026-04-21T20:42:27.000Z',
            };
            dbService.getGlobalRecentlyViewed.mockResolvedValue([row]);
            dbService.getRecentItems.mockResolvedValue([row]);

            const items = await service.getRecentItems(
                scope,
                'xtream-1',
                'xtream'
            );

            expect(
                items.find((item) => item.sourceType === 'xtream')
            ).toMatchObject({
                xtreamId: 100,
                contentType: 'movie',
                rating: '8.2',
            });
        }
    );

    it.each(['all', 'playlist', 'pwa'] as const)(
        'preserves raw episode history ownership in the %s Recent mapping',
        async (scope) => {
            const row = {
                id: 22,
                xtream_id: 909,
                title: 'Episode History',
                type: 'episode',
                playlist_id: 'xtream-1',
                category_id: '4',
                rating: '8.2',
                added: '1700000000',
                poster_url: '',
                viewed_at: '2026-04-21T20:42:27.000Z',
            };
            dbService.getGlobalRecentlyViewed.mockResolvedValue([row]);
            dbService.getRecentItems.mockResolvedValue([row]);
            xtreamDataSource.getRecentItems.mockResolvedValue([row]);
            if (scope === 'pwa')
                Object.defineProperty(window, 'electron', {
                    value: undefined,
                    configurable: true,
                });
            const items = await service.getRecentItems(
                scope === 'pwa' ? 'playlist' : scope,
                'xtream-1',
                'xtream'
            );
            expect(
                items.find((item) => item.sourceType === 'xtream')
            ).toMatchObject({
                contentType: 'series',
                historyContentType: 'episode',
                xtreamId: 909,
                contentId: 22,
                uid: 'xtream::xtream-1::series:909',
            });
        }
    );

    it.each(['all', 'playlist', 'pwa'] as const)(
        'retains ambiguous legacy series ownership through the %s Recent mapping and projection',
        async (scope) => {
            const row = {
                id: 22,
                xtream_id: 909,
                title: 'Legacy Episode History',
                type: 'series',
                playlist_id: 'xtream-1',
                category_id: '4',
                added: '1700000000',
                poster_url: '',
                viewed_at: '2026-04-21T20:42:27.000Z',
            };
            const explicitEpisode = { ...row, id: 23, type: 'episode' };
            dbService.getGlobalRecentlyViewed.mockResolvedValue([
                row,
                explicitEpisode,
            ]);
            dbService.getRecentItems.mockResolvedValue([row, explicitEpisode]);
            xtreamDataSource.getRecentItems.mockResolvedValue([
                row,
                explicitEpisode,
            ]);
            if (scope === 'pwa')
                Object.defineProperty(window, 'electron', {
                    value: undefined,
                    configurable: true,
                });
            const items = (
                await service.getRecentItems(
                    scope === 'pwa' ? 'playlist' : scope,
                    'xtream-1',
                    'xtream'
                )
            ).filter((item) => item.sourceType === 'xtream');
            const legacy = items.find((item) => item.contentId === 22);
            const episode = items.find((item) => item.contentId === 23);
            if (!legacy || !episode)
                throw new Error('Expected both raw history rows');
            expect(legacy.historyContentType).toBeUndefined();
            expect(episode.historyContentType).toBe('episode');
            const saved = {
                playlistId: 'xtream-1',
                contentType: 'episode' as const,
                contentXtreamId: 909,
                seriesXtreamId: 900,
                positionSeconds: 40,
                durationSeconds: 100,
                updatedAt: '2026-10-08T10:00:00Z',
            };
            const read = jest.fn().mockResolvedValue([saved]);
            const repository = {
                getAllPlaybackPositions: read,
            } as unknown as PortalPlaybackPositions;
            const parent = { ...legacy, xtreamId: 900, contentId: undefined };
            const [direct] = await projectCollectionCovers(
                [legacy],
                [parent],
                repository,
                'history'
            );
            expect(direct.coverFavoriteTarget?.xtreamId).toBe(900);
            expect(direct.coverDetailTarget?.item.xtreamId).toBe(900);
            expect(direct.coverIndicators).toMatchObject({
                favorite: true,
                watchState: 'in-progress',
                progress: 40,
            });
            expect(direct).toMatchObject({
                uid: legacy.uid,
                xtreamId: 909,
                contentId: 22,
            });
            // When a real parent shares ID909, parent ownership wins for the
            // ambiguous row, while the explicit episode still belongs to900.
            read.mockResolvedValue([
                saved,
                {
                    ...saved,
                    contentXtreamId: 42,
                    seriesXtreamId: 909,
                    positionSeconds: 70,
                    updatedAt: '2026-10-08T11:00:00Z',
                },
            ]);
            const projected = await projectCollectionCovers(
                [legacy, episode],
                [parent],
                repository,
                'history'
            );
            expect(projected[0].coverFavoriteTarget).toBeUndefined();
            expect(projected[0].coverDetailTarget?.item.xtreamId).toBe(909);
            expect(projected[0].coverIndicators).toMatchObject({
                favorite: false,
                progress: 70,
            });
            expect(projected[1].coverFavoriteTarget?.xtreamId).toBe(900);
            expect(projected[1].coverIndicators).toMatchObject({
                favorite: true,
                progress: 40,
            });
            await service.removeRecentItem(direct);
            expect(
                scope === 'pwa'
                    ? xtreamDataSource.removeRecentItem
                    : dbService.removeRecentItem
            ).toHaveBeenCalledWith(22, 'xtream-1');
        }
    );

    it('records Xtream playback with a type-aware fallback lookup', async () => {
        dbService.getContentByXtreamId.mockResolvedValue({
            id: 3867578,
            xtream_id: 290,
            type: 'live',
            title: 'SE: V Film Premiere FHD',
        });

        const item = {
            uid: 'xtream::xtream-1::live:290',
            name: 'SE: V Film Premiere FHD',
            contentType: 'live',
            sourceType: 'xtream',
            playlistId: 'xtream-1',
            playlistName: 'Xtream One',
            xtreamId: 290,
        } satisfies UnifiedCollectionItem;

        const recorded = await service.recordLivePlayback(item);

        expect(dbService.getContentByXtreamId).toHaveBeenCalledWith(
            290,
            'xtream-1',
            'live'
        );
        expect(dbService.addRecentItem).toHaveBeenCalledWith(
            3867578,
            'xtream-1'
        );
        expect(recorded).toEqual(
            expect.objectContaining({
                contentId: 3867578,
                viewedAt: expect.any(String),
            })
        );
    });

    it('uses the Xtream id as the PWA recent key when cached content is cold', async () => {
        Object.defineProperty(window, 'electron', {
            value: undefined,
            configurable: true,
        });
        xtreamDataSource.getContentByXtreamId.mockResolvedValue(null);

        const item = {
            uid: 'xtream::xtream-1::movie:290',
            name: 'PWA Movie',
            contentType: 'movie',
            sourceType: 'xtream',
            playlistId: 'xtream-1',
            playlistName: 'Xtream One',
            xtreamId: 290,
        } satisfies UnifiedCollectionItem;

        const recorded = await service.recordLivePlayback(item);

        expect(xtreamDataSource.getContentByXtreamId).toHaveBeenCalledWith(
            290,
            'xtream-1',
            'movie'
        );
        expect(xtreamDataSource.addRecentItem).toHaveBeenCalledWith(
            290,
            'xtream-1'
        );
        expect(dbService.addRecentItem).not.toHaveBeenCalled();
        expect(recorded).toEqual(
            expect.objectContaining({
                contentId: 290,
                viewedAt: expect.any(String),
            })
        );
    });

    it('uses the active Xtream data source when the Electron bridge lacks activity storage methods', async () => {
        Object.defineProperty(window, 'electron', {
            value: {} as Window['electron'],
            configurable: true,
        });

        await service.removeRecentItem({
            uid: 'xtream::xtream-1::movie:290',
            name: 'Partial Bridge Movie',
            contentType: 'movie',
            sourceType: 'xtream',
            playlistId: 'xtream-1',
            playlistName: 'Xtream One',
            xtreamId: 290,
            contentId: 444,
        } satisfies UnifiedCollectionItem);

        expect(xtreamDataSource.removeRecentItem).toHaveBeenCalledWith(
            444,
            'xtream-1'
        );
        expect(dbService.removeRecentItem).not.toHaveBeenCalled();
    });

    it('builds distinct Xtream recent UIDs when live and series share an xtream id', async () => {
        store.select.mockReturnValue(
            of([
                {
                    _id: 'xtream-1',
                    title: 'Xtream One',
                    serverUrl: 'https://example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        dbService.getRecentItems.mockResolvedValue([
            {
                id: 3867578,
                category_id: 11,
                title: 'SE: V Film Premiere FHD',
                poster_url: 'https://example.com/live.png',
                xtream_id: 290,
                type: 'live',
                tv_archive: 1,
                tv_archive_duration: 3,
                viewed_at: '2026-04-21T20:42:27.000Z',
            },
            {
                id: 3941697,
                category_id: 17,
                title: 'Krypton',
                poster_url: 'https://example.com/krypton.png',
                xtream_id: 290,
                type: 'series',
                viewed_at: '2026-04-21T20:43:27.000Z',
            },
        ]);

        const items = await service.getRecentItems(
            'playlist',
            'xtream-1',
            'xtream'
        );

        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uid: 'xtream::xtream-1::live:290',
                    contentType: 'live',
                    contentId: 3867578,
                    // Regression for issue #1138: archive metadata must
                    // survive the recent mapping for catch-up.
                    tvArchive: 1,
                    tvArchiveDuration: 3,
                }),
                expect.objectContaining({
                    uid: 'xtream::xtream-1::series:290',
                    contentType: 'series',
                    contentId: 3941697,
                }),
            ])
        );
    });

    it('loads Xtream playlist recent items through the active data source in PWA', async () => {
        Object.defineProperty(window, 'electron', {
            value: undefined,
            configurable: true,
        });
        store.select.mockReturnValue(
            of([
                {
                    _id: 'xtream-1',
                    title: 'Xtream PWA',
                    serverUrl: 'https://example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        xtreamDataSource.getRecentItems.mockResolvedValue([
            {
                id: 202,
                category_id: 20,
                title: 'Movie One',
                type: 'movie',
                poster_url: 'movie.png',
                backdrop_url: 'backdrop.png',
                xtream_id: 202,
                viewed_at: '2026-05-21T12:00:00.000Z',
            },
        ]);

        const items = await service.getRecentItems(
            'playlist',
            'xtream-1',
            'xtream'
        );

        expect(xtreamDataSource.getRecentItems).toHaveBeenCalledWith(
            'xtream-1'
        );
        expect(dbService.getRecentItems).not.toHaveBeenCalled();
        expect(items).toEqual([
            expect.objectContaining({
                uid: 'xtream::xtream-1::movie:202',
                sourceType: 'xtream',
                contentType: 'movie',
                name: 'Movie One',
                playlistName: 'Xtream PWA',
                posterUrl: 'movie.png',
                viewedAt: '2026-05-21T12:00:00.000Z',
            }),
        ]);
    });

    it('does not load Stalker portals through the PWA Xtream global recent path', async () => {
        Object.defineProperty(window, 'electron', {
            value: undefined,
            configurable: true,
        });
        store.select.mockReturnValue(
            of([
                {
                    _id: 'xtream-1',
                    title: 'Xtream PWA',
                    serverUrl: 'https://xtream.example.com',
                },
                {
                    _id: 'stalker-1',
                    title: 'Stalker Portal',
                    serverUrl: 'https://stalker.example.com',
                    macAddress: '00:11:22:33:44:55',
                },
            ] satisfies Partial<PlaylistMeta>[])
        );

        await service.getRecentItems('all');

        expect(xtreamDataSource.getRecentItems).toHaveBeenCalledTimes(1);
        expect(xtreamDataSource.getRecentItems).toHaveBeenCalledWith(
            'xtream-1'
        );
    });

    it('clears Xtream recent localStorage during global PWA clear', async () => {
        Object.defineProperty(window, 'electron', {
            value: undefined,
            configurable: true,
        });
        store.select.mockReturnValue(
            of([
                {
                    _id: 'xtream-1',
                    title: 'Xtream PWA',
                    serverUrl: 'https://xtream.example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        playlistsService.getAllPlaylists.mockReturnValue(
            of([
                {
                    _id: 'm3u-1',
                    title: 'M3U List',
                },
                {
                    _id: 'stalker-1',
                    title: 'Stalker Portal',
                    serverUrl: 'https://stalker.example.com',
                    macAddress: '00:11:22:33:44:55',
                },
            ] satisfies Partial<Playlist>[])
        );

        await service.clearRecentItems('all');

        expect(dbService.clearGlobalRecentlyViewed).not.toHaveBeenCalled();
        expect(xtreamDataSource.clearRecentItems).toHaveBeenCalledWith(
            'xtream-1'
        );
        expect(
            playlistsService.clearPlaylistRecentlyViewed
        ).toHaveBeenCalledWith('m3u-1');
        expect(
            playlistsService.clearPlaylistRecentlyViewed
        ).toHaveBeenCalledWith('stalker-1');
        expect(
            playlistsService.clearPlaylistRecentlyViewed
        ).not.toHaveBeenCalledWith('xtream-1');
    });

    it('keeps Stalker radio recent items in the live collection with radio metadata', async () => {
        store.select.mockReturnValue(
            of([
                {
                    _id: 'stalker-1',
                    title: 'Stalker Portal',
                    macAddress: '00:11:22:33:44:55',
                    recentlyViewed: [
                        {
                            id: '40001',
                            title: 'Jazz Radio',
                            name: 'Jazz Radio',
                            category_id: 'radio-genre-1',
                            cmd: 'ffrt4://radio/40001/index.mp3',
                            logo: 'jazz.png',
                            radio: true,
                            added_at: '2026-03-26T12:00:00.000Z',
                        },
                    ],
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        playlistsService.getPlaylistById.mockReturnValue(
            of({
                _id: 'stalker-1',
                title: 'Stalker Portal',
                portalUrl: 'https://stalker.example.com/portal.php',
                macAddress: '00:11:22:33:44:55',
            } satisfies Partial<Playlist>)
        );

        const items = await service.getRecentItems(
            'playlist',
            'stalker-1',
            'stalker'
        );

        expect(items).toEqual([
            expect.objectContaining({
                uid: 'stalker::stalker-1::40001',
                name: 'Jazz Radio',
                contentType: 'live',
                logo: 'jazz.png',
                posterUrl: null,
                radio: 'true',
                stalkerCmd: 'ffrt4://radio/40001/index.mp3',
                categoryId: 'radio-genre-1',
            }),
        ]);
    });

    it('coalesces multiple M3U items from one playlist into a single batched removal', async () => {
        const items: UnifiedCollectionItem[] = [
            {
                uid: 'm3u::m3u-1::https://example.com/1.m3u8',
                name: 'Channel One',
                contentType: 'live',
                sourceType: 'm3u',
                playlistId: 'm3u-1',
                playlistName: 'M3U List',
                streamUrl: 'https://example.com/1.m3u8',
            },
            {
                uid: 'm3u::m3u-1::https://example.com/2.m3u8',
                name: 'Channel Two',
                contentType: 'live',
                sourceType: 'm3u',
                playlistId: 'm3u-1',
                playlistName: 'M3U List',
                streamUrl: 'https://example.com/2.m3u8',
            },
        ];

        await service.removeRecentItemsBatch(items);

        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledTimes(1);
        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledWith('m3u-1', [
            'https://example.com/1.m3u8',
            'https://example.com/2.m3u8',
        ]);
        expect(
            playlistsService.removeFromM3uRecentlyViewed
        ).not.toHaveBeenCalled();
        expect(store.dispatch).toHaveBeenCalledTimes(1);
    });

    it('groups Stalker items by their stalker id and skips entries without an identity', async () => {
        const items: UnifiedCollectionItem[] = [
            {
                uid: 'stalker::stalker-1::42',
                name: 'Stalker Live A',
                contentType: 'live',
                sourceType: 'stalker',
                playlistId: 'stalker-1',
                playlistName: 'Stalker',
                stalkerId: '42',
            },
            {
                uid: 'stalker::stalker-1::43',
                name: 'Stalker Live B',
                contentType: 'live',
                sourceType: 'stalker',
                playlistId: 'stalker-1',
                playlistName: 'Stalker',
                stalkerId: '43',
            },
        ];

        await service.removeRecentItemsBatch(items);

        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledTimes(1);
        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledWith('stalker-1', ['42', '43']);
    });

    it('routes Xtream items through dbService and m3u items through the batch helper', async () => {
        const items: UnifiedCollectionItem[] = [
            {
                uid: 'xtream::xtream-1::live:290',
                name: 'Xtream Live',
                contentType: 'live',
                sourceType: 'xtream',
                playlistId: 'xtream-1',
                playlistName: 'Xtream',
                contentId: 3867578,
                xtreamId: 290,
            },
            {
                uid: 'm3u::m3u-1::https://example.com/1.m3u8',
                name: 'Channel One',
                contentType: 'live',
                sourceType: 'm3u',
                playlistId: 'm3u-1',
                playlistName: 'M3U List',
                streamUrl: 'https://example.com/1.m3u8',
            },
        ];

        await service.removeRecentItemsBatch(items);

        expect(dbService.removeRecentItemsBatch).toHaveBeenCalledTimes(1);
        expect(dbService.removeRecentItemsBatch).toHaveBeenCalledWith([
            { contentId: 3867578, playlistId: 'xtream-1' },
        ]);
        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledTimes(1);
        expect(
            playlistsService.removeFromPlaylistRecentlyViewedBatch
        ).toHaveBeenCalledWith('m3u-1', ['https://example.com/1.m3u8']);
    });

    it('normalizes SQLite-style Xtream recent timestamps to ISO before exposing them', async () => {
        store.select.mockReturnValue(
            of([
                playlistMeta,
                {
                    _id: 'xtream-1',
                    title: 'Xtream One',
                    serverUrl: 'https://example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        dbService.getGlobalRecentlyViewed.mockResolvedValue([
            {
                id: 3940227,
                category_id: 18,
                title: 'Unter Nachbarn - 2011',
                poster_url: 'https://example.com/unter.png',
                xtream_id: 815302,
                type: 'movie',
                playlist_id: 'xtream-1',
                playlist_name: 'Xtream One',
                viewed_at: '2026-04-21 22:49:02',
            },
            {
                id: 3867578,
                category_id: 11,
                title: 'Live With Archive',
                poster_url: 'https://example.com/live.png',
                xtream_id: 290,
                type: 'live',
                tv_archive: 1,
                tv_archive_duration: 3,
                playlist_id: 'xtream-1',
                playlist_name: 'Xtream One',
                viewed_at: '2026-04-21 20:42:27',
            },
        ]);

        const items = await service.getRecentItems('all');
        const xtreamItem = items.find(
            (item) => item.name === 'Unter Nachbarn - 2011'
        );

        expect(xtreamItem).toEqual(
            expect.objectContaining({
                name: 'Unter Nachbarn - 2011',
                viewedAt: '2026-04-21T22:49:02.000Z',
            })
        );
        // Regression for issue #1138: archive metadata must survive the
        // global recent mapping for catch-up.
        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'Live With Archive',
                    tvArchive: 1,
                    tvArchiveDuration: 3,
                }),
            ])
        );
    });
});
