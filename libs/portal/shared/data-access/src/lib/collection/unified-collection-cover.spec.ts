import { TestBed } from '@angular/core/testing';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import {
    UnifiedCollectionItem,
    contentCoverIdentity,
    PORTAL_PLAYBACK_POSITIONS,
} from '@iptvnator/portal/shared/util';
import { ContentCoverDataService } from './content-cover-data.service';
import { UnifiedCollectionDataService } from './unified-collection-data.service';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';
import { UnifiedRecentDataService } from './unified-recent-data.service';

const movie: UnifiedCollectionItem = {
    uid: 'stalker::portal::7',
    name: 'Film',
    contentType: 'movie',
    sourceType: 'stalker',
    playlistId: 'portal',
    playlistName: 'Portal',
    stalkerId: '7',
};
const series: UnifiedCollectionItem = {
    ...movie,
    contentType: 'series',
    name: 'Show',
};
const scope = {
    scope: 'playlist',
    playlistId: 'portal',
    portalType: 'stalker',
} as const;
const episodeHistory: UnifiedCollectionItem = {
    ...series,
    sourceType: 'xtream',
    xtreamId: 909,
    contentId: 22,
    uid: 'xtream::portal::series:909',
    historyContentType: 'episode',
};
const parentShow: UnifiedCollectionItem = {
    ...episodeHistory,
    xtreamId: 900,
    contentId: 99,
    historyContentType: 'series',
};
const episodePosition: PlaybackPositionData = {
    playlistId: 'portal',
    contentType: 'episode',
    contentXtreamId: 909,
    seriesXtreamId: 900,
    seasonNumber: 1,
    episodeNumber: 2,
    positionSeconds: 40,
    durationSeconds: 100,
};
const watchRepository = () =>
    TestBed.inject(PORTAL_PLAYBACK_POSITIONS) as unknown as {
        getAllPlaybackPositions: jest.Mock;
    };
const deferredPositions = () => {
    let resolve!: (rows: PlaybackPositionData[]) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PlaybackPositionData[]>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};
async function waitForPositionReads(count: number): Promise<void> {
    for (
        let tick = 0;
        tick < 30 &&
        watchRepository().getAllPlaybackPositions.mock.calls.length < count;
        tick++
    )
        await Promise.resolve();
    expect(watchRepository().getAllPlaybackPositions).toHaveBeenCalledTimes(
        count
    );
}

describe('unified collection VOD cover actions', () => {
    let data: UnifiedCollectionDataService;
    let persisted: UnifiedCollectionItem[];
    let recent: { getRecentItems: jest.Mock };
    let favorites: {
        getFavorites: jest.Mock;
        getFavoritesStrict: jest.Mock;
        addFavorite: jest.Mock;
        removeFavorite: jest.Mock;
    };
    beforeEach(() => {
        recent = {
            getRecentItems: jest.fn().mockResolvedValue([movie, series]),
        };
        persisted = [movie];
        const read = jest.fn(async () => [...persisted]);
        favorites = {
            getFavorites: read,
            getFavoritesStrict: read,
            addFavorite: jest.fn(async (item: UnifiedCollectionItem) => {
                persisted.push(item);
            }),
            removeFavorite: jest.fn(async (item: UnifiedCollectionItem) => {
                persisted = persisted.filter(
                    (row) =>
                        contentCoverIdentity(row) !== contentCoverIdentity(item)
                );
            }),
        };
        TestBed.configureTestingModule({
            providers: [
                UnifiedCollectionDataService,
                ContentCoverDataService,
                { provide: UnifiedFavoritesDataService, useValue: favorites },
                {
                    provide: UnifiedRecentDataService,
                    useValue: recent,
                },
                {
                    provide: PORTAL_PLAYBACK_POSITIONS,
                    useValue: {
                        getAllPlaybackPositions: jest.fn().mockResolvedValue([
                            {
                                contentType: 'vod',
                                contentXtreamId: 7,
                                playlistId: 'portal',
                                positionSeconds: 60,
                                durationSeconds: 100,
                            },
                        ]),
                    },
                },
            ],
        });
        data = TestBed.inject(UnifiedCollectionDataService);
    });

    it('recovers failed watch reads in Favorites without losing persisted favorite membership', async () => {
        favorites.getFavoritesStrict = jest.fn(async () => [...persisted]);
        const positions = watchRepository();
        positions.getAllPlaybackPositions.mockRejectedValueOnce(
            new Error('private')
        );
        await data.load({ ...scope, mode: 'favorites' });
        expect(data.allItems()[0].coverIndicators?.favorite).toBe(true);
        expect(data.allItems()[0].coverIndicators?.watchState).toBeUndefined();
        expect(data.favoriteFailed()).toBe(false);
        expect(data.watchReadFailed()).toBe(true);
        expect(data.coverReadFailed()).toBe(true);
        await data.retryFavorites();
        expect(positions.getAllPlaybackPositions).toHaveBeenCalledTimes(2);
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 60,
            watchState: 'in-progress',
        });
        expect(favorites.getFavoritesStrict).toHaveBeenCalledTimes(1);
        expect(favorites.getFavorites).toHaveBeenCalledTimes(1);
        expect(data.watchReadFailed()).toBe(false);
        expect(data.coverReadFailed()).toBe(false);
    });

    it('keeps watch-only recovery available through repeated failures and restores episode targets on success', async () => {
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        persisted = [parentShow];
        watchRepository()
            .getAllPlaybackPositions.mockRejectedValueOnce(new Error('private'))
            .mockRejectedValueOnce(new Error('private'))
            .mockResolvedValue([episodePosition]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.favoriteFailed()).toBe(false);
        expect(data.coverReadFailed()).toBe(true);
        await data.retryFavorites();
        expect(data.favoriteFailed()).toBe(false);
        expect(data.watchReadFailed()).toBe(true);
        expect(data.coverReadFailed()).toBe(true);
        expect(data.allItems()[0].coverDetailTarget).toBeNull();
        await data.retryFavorites();
        expect(data.coverReadFailed()).toBe(false);
        expect(data.allItems()[0].coverDetailTarget?.item.xtreamId).toBe(900);
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 40,
        });
        expect(watchRepository().getAllPlaybackPositions).toHaveBeenCalledTimes(
            3
        );
    });

    it('does not confuse an unresolved parent in known-empty positions with a read failure', async () => {
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        watchRepository().getAllPlaybackPositions.mockResolvedValue([]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.allItems()[0].coverDetailTarget).toBeNull();
        expect(data.watchReadFailed()).toBe(false);
        expect(data.coverReadFailed()).toBe(false);
    });

    it('keeps Retry available when membership recovers but watch storage still rejects', async () => {
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        favorites.getFavoritesStrict.mockRejectedValueOnce(
            new Error('private')
        );
        watchRepository().getAllPlaybackPositions.mockRejectedValue(
            new Error('private')
        );
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.favoriteFailed()).toBe(true);
        await data.retryFavorites();
        expect(data.favoriteFailed()).toBe(false);
        expect(data.watchReadFailed()).toBe(true);
        expect(data.coverReadFailed()).toBe(true);
        expect(data.allItems()[0].coverDetailTarget).toBeNull();
    });

    it('clears represented watch failure when the failed playlist rows are removed', async () => {
        recent.getRecentItems.mockResolvedValue([movie]);
        Object.assign(recent, {
            removeRecentItem: jest.fn().mockResolvedValue(undefined),
        });
        watchRepository().getAllPlaybackPositions.mockRejectedValue(
            new Error('private')
        );
        await data.load({ ...scope, mode: 'recent' });
        expect(data.watchReadFailed()).toBe(true);
        await data.removeItem('recent', data.allItems()[0]);
        expect(data.watchReadFailed()).toBe(false);
    });

    it.each(['load', 'retry', 'disposal'] as const)(
        'does not publish obsolete failed watch status after %s supersession',
        async (kind) => {
            const delayed = deferredPositions();
            if (kind !== 'load') await data.load({ ...scope, mode: 'recent' });
            watchRepository().getAllPlaybackPositions.mockReturnValueOnce(
                delayed.promise
            );
            const pending =
                kind === 'load'
                    ? data.load({ ...scope, mode: 'recent' })
                    : data.retryFavorites();
            await waitForPositionReads(kind === 'load' ? 1 : 2);
            if (kind === 'disposal') TestBed.resetTestingModule();
            else {
                recent.getRecentItems.mockResolvedValue([
                    { ...movie, playlistId: 'newer' },
                ]);
                await data.load({
                    ...scope,
                    playlistId: 'newer',
                    mode: 'recent',
                });
            }
            delayed.reject(new Error('private'));
            await pending;
            expect(data.watchReadFailed()).toBe(false);
            expect(data.coverReadFailed()).toBe(false);
            if (kind !== 'disposal')
                expect(data.allItems()[0].playlistId).toBe('newer');
        }
    );

    it('ignores an older failed Retry after the latest same-scope watch read succeeds', async () => {
        await data.load({ ...scope, mode: 'recent' });
        const old = deferredPositions();
        watchRepository().getAllPlaybackPositions.mockReturnValueOnce(
            old.promise
        );
        const older = data.retryFavorites();
        await waitForPositionReads(2);
        await data.retryFavorites();
        old.reject(new Error('private'));
        await older;
        expect(data.watchReadFailed()).toBe(false);
        expect(data.allItems()[0].coverIndicators?.progress).toBe(60);
    });

    it('removes only the selected favourite kind in memory and persistence despite legacy UID collisions', async () => {
        persisted = [movie, series];
        await data.load({ ...scope, mode: 'favorites' });
        await data.removeItem('favorites', data.allItems()[1]);
        expect(persisted).toEqual([movie]);
        expect(data.allItems().map((row) => row.contentType)).toEqual([
            'movie',
        ]);
        expect(data.favoriteUidSet().has(movie.uid)).toBe(true);
    });

    it('serializes Favorites cover removal and ignores a repeated click while saving', async () => {
        persisted = [movie, series];
        await data.load({ ...scope, mode: 'favorites' });
        let finish!: () => void;
        favorites.removeFavorite.mockImplementationOnce(async (item) => {
            await new Promise<void>((resolve) => {
                finish = resolve;
            });
            persisted = persisted.filter(
                (row) =>
                    contentCoverIdentity(row) !== contentCoverIdentity(item)
            );
        });
        const selected = data.allItems()[1];
        const first = data.removeItem('favorites', selected);
        const repeated = data.removeItem('favorites', selected);
        expect(
            data.pendingFavoriteKeys().has(contentCoverIdentity(series))
        ).toBe(true);
        await repeated;
        expect(data.allItems()).toHaveLength(2);
        finish();
        await first;
        expect(favorites.removeFavorite).toHaveBeenCalledTimes(1);
        expect(favorites.addFavorite).not.toHaveBeenCalled();
        expect(data.allItems().map((row) => row.contentType)).toEqual([
            'movie',
        ]);
        expect(data.pendingFavoriteKeys().size).toBe(0);
    });

    it('retains a Favorites cover and reports failure when its removal rejects', async () => {
        await data.load({ ...scope, mode: 'favorites' });
        favorites.removeFavorite.mockRejectedValueOnce(new Error('private'));
        await expect(
            data.removeItem('favorites', data.allItems()[0])
        ).resolves.toBeUndefined();
        expect(data.allItems()).toHaveLength(1);
        expect(data.allItems()[0].coverIndicators?.favorite).toBe(true);
        expect(data.favoriteFailed()).toBe(true);
        expect(data.pendingFavoriteKeys().size).toBe(0);
        expect(persisted).toEqual([movie]);
    });

    it('keeps a Favorites cover after an unresolved removal no-op', async () => {
        await data.load({ ...scope, mode: 'favorites' });
        favorites.removeFavorite.mockResolvedValueOnce(undefined);
        await data.removeItem('favorites', data.allItems()[0]);
        expect(data.allItems()).toHaveLength(1);
        expect(data.allItems()[0].coverIndicators?.favorite).toBe(true);
        expect(data.favoriteFailed()).toBe(false);
    });

    it('keeps Favorites membership unknown when the complete read fails despite loaded display rows', async () => {
        favorites.getFavoritesStrict = jest
            .fn(async () => [...persisted])
            .mockRejectedValueOnce(new Error('private'));
        await data.load({ ...scope, mode: 'favorites' });
        expect(data.allItems()).toHaveLength(1);
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        expect(data.favoriteFailed()).toBe(true);
        await data.removeItem('favorites', data.allItems()[0]);
        expect(favorites.removeFavorite).not.toHaveBeenCalled();
        expect(favorites.addFavorite).not.toHaveBeenCalled();
        await data.retryFavorites();
        expect(data.allItems()[0].coverIndicators?.favorite).toBe(true);
        expect(data.favoriteFailed()).toBe(false);
    });

    it('reads complete Favorites membership independently of capped display rows', async () => {
        persisted = [movie, series];
        favorites.getFavorites = jest.fn().mockResolvedValue([movie]);
        await data.load({ ...scope, mode: 'favorites' });
        expect(data.allItems()).toHaveLength(1);
        expect(favorites.getFavoritesStrict).toHaveBeenCalledWith(
            'playlist',
            'portal',
            'stalker'
        );
        expect(
            TestBed.inject(ContentCoverDataService).favoriteFor(series)
        ).toBe(true);
        await data.removeItem('favorites', data.allItems()[0]);
        expect(data.allItems()).toEqual([]);
        expect(persisted).toEqual([series]);
    });

    it('retains unknown Favorites membership after readback failure and removes the persisted row on Retry', async () => {
        await data.load({ ...scope, mode: 'favorites' });
        favorites.getFavoritesStrict.mockRejectedValueOnce(
            new Error('private')
        );
        await data.removeItem('favorites', data.allItems()[0]);
        expect(persisted).toEqual([]);
        expect(data.allItems()).toHaveLength(1);
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        expect(data.favoriteFailed()).toBe(true);
        await data.removeItem('favorites', data.allItems()[0]);
        expect(favorites.removeFavorite).toHaveBeenCalledTimes(1);
        await data.retryFavorites();
        expect(data.allItems()).toEqual([]);
        expect(data.favoriteFailed()).toBe(false);
        expect(favorites.addFavorite).not.toHaveBeenCalled();
    });

    it('adds a same-ID series without removing its favourite movie and retains watch progress', async () => {
        await data.load({ ...scope, mode: 'recent' });
        const selected = data.allItems()[1];
        expect(selected.coverIndicators?.favorite).toBe(false);
        const pending = data.toggleFavorite(selected);
        expect(
            data.pendingFavoriteKeys().has(contentCoverIdentity(series))
        ).toBe(true);
        await pending;
        expect(favorites.removeFavorite).not.toHaveBeenCalled();
        expect(persisted.map((row) => row.contentType)).toEqual([
            'movie',
            'series',
        ]);
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 60,
            watchState: 'in-progress',
        });
        expect(data.allItems()[1].coverIndicators?.favorite).toBe(true);
        expect(data.pendingFavoriteKeys().size).toBe(0);
    });

    it('keeps a newer source and its toggle membership when an older recent read resolves last', async () => {
        let resolveOld: (rows: UnifiedCollectionItem[]) => void = () =>
            undefined;
        const old = new Promise<UnifiedCollectionItem[]>((resolve) => {
            resolveOld = resolve;
        });
        const newer = {
            ...series,
            playlistId: 'newer',
            uid: 'stalker::newer::7',
        };
        persisted = [];
        recent.getRecentItems
            .mockReturnValueOnce(old)
            .mockResolvedValueOnce([newer]);
        const pendingOld = data.load({ ...scope, mode: 'recent' });
        await data.load({ ...scope, playlistId: 'newer', mode: 'recent' });
        resolveOld([movie]);
        await expect(pendingOld).resolves.toBeNull();
        expect(data.allItems().map((item) => item.playlistId)).toEqual([
            'newer',
        ]);
        expect(favorites.getFavoritesStrict).toHaveBeenCalledTimes(1);
        await data.toggleFavorite(data.allItems()[0]);
        expect(favorites.addFavorite).toHaveBeenCalledWith(
            expect.objectContaining({
                playlistId: 'newer',
                contentType: 'series',
            })
        );
        expect(favorites.getFavoritesStrict).toHaveBeenLastCalledWith(
            'playlist',
            'newer',
            'stalker'
        );
        expect(data.allItems()[0].coverIndicators?.favorite).toBe(true);
    });

    it('publishes current favourite membership when a toggle finishes during a deferred watch projection', async () => {
        await data.load({ ...scope, mode: 'recent' });
        const positions = TestBed.inject(
            PORTAL_PLAYBACK_POSITIONS
        ) as unknown as { getAllPlaybackPositions: jest.Mock };
        let resolvePositions: (rows: PlaybackPositionData[]) => void = () =>
            undefined;
        positions.getAllPlaybackPositions.mockReturnValueOnce(
            new Promise<PlaybackPositionData[]>((resolve) => {
                resolvePositions = resolve;
            })
        );
        const reload = data.load({ ...scope, mode: 'recent' });
        for (
            let tick = 0;
            tick < 20 &&
            positions.getAllPlaybackPositions.mock.calls.length < 2;
            tick++
        )
            await Promise.resolve();
        expect(positions.getAllPlaybackPositions).toHaveBeenCalledTimes(2);
        await data.toggleFavorite(data.allItems()[1]);
        expect(data.allItems()[1].coverIndicators?.favorite).toBe(true);
        resolvePositions([
            {
                contentType: 'vod',
                contentXtreamId: 7,
                playlistId: 'portal',
                positionSeconds: 60,
                durationSeconds: 100,
            },
        ]);
        const published = await reload;
        expect(published?.[1].coverIndicators?.favorite).toBe(true);
        expect(data.allItems()[1].coverIndicators?.favorite).toBe(true);
        expect(data.allItems()[0].coverIndicators?.progress).toBe(60);
        expect(positions.getAllPlaybackPositions).toHaveBeenCalledTimes(2);
    });

    it('resolves episode-keyed recent progress without treating the same favourite ID as an episode', async () => {
        const episodeHistory: UnifiedCollectionItem = {
            ...series,
            sourceType: 'xtream',
            xtreamId: 909,
            uid: 'xtream::portal::episode:909',
        };
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        const positions = TestBed.inject(
            PORTAL_PLAYBACK_POSITIONS
        ) as unknown as {
            getAllPlaybackPositions: jest.Mock;
        };
        positions.getAllPlaybackPositions.mockResolvedValue([
            {
                playlistId: 'portal',
                contentType: 'episode',
                contentXtreamId: 909,
                seriesXtreamId: 900,
                positionSeconds: 95,
                durationSeconds: 100,
            },
        ]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            watchState: 'in-progress',
            progressScope: 'episode',
            progress: 95,
        });
        persisted = [episodeHistory];
        await data.load({ ...scope, portalType: 'xtream', mode: 'favorites' });
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            watchState: 'unwatched',
            progress: null,
        });
        expect(positions.getAllPlaybackPositions).toHaveBeenCalledTimes(2);
    });

    it('retains persisted membership after a no-op write', async () => {
        favorites.addFavorite.mockResolvedValue(undefined);
        await data.load({ ...scope, mode: 'recent' });
        await data.toggleFavorite(data.allItems()[1]);
        expect(data.allItems()[1].coverIndicators?.favorite).toBe(false);
    });

    it('removes only the selected episode history when a parent show reuses its provider ID', async () => {
        const episode: UnifiedCollectionItem = {
            ...series,
            sourceType: 'xtream',
            uid: 'xtream::portal::series:909',
            xtreamId: 909,
            contentId: 22,
            historyContentType: 'episode',
        };
        const parent: UnifiedCollectionItem = {
            ...episode,
            contentId: 11,
            historyContentType: 'series',
        };
        const removeRecentItem = jest.fn().mockResolvedValue(undefined);
        Object.assign(recent, { removeRecentItem });
        recent.getRecentItems.mockResolvedValue([episode, parent]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        await data.removeItem('recent', data.allItems()[0]);
        expect(removeRecentItem).toHaveBeenCalledWith(
            expect.objectContaining({
                contentId: 22,
                historyContentType: 'episode',
            })
        );
        expect(data.allItems()).toHaveLength(1);
        expect(data.allItems()[0]).toMatchObject({
            contentId: 11,
            historyContentType: 'series',
            xtreamId: 909,
        });
        expect(favorites.removeFavorite).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'targets the parent show for an episode history favourite, initially saved=%s',
        async (saved) => {
            const episode: UnifiedCollectionItem = {
                ...series,
                sourceType: 'xtream',
                xtreamId: 909,
                contentId: 22,
                historyContentType: 'episode',
                uid: 'xtream::portal::series:909',
            };
            const parent: UnifiedCollectionItem = {
                ...episode,
                xtreamId: 900,
                contentId: 99,
                historyContentType: 'series',
                uid: 'xtream::portal::series:900',
            };
            persisted = saved ? [parent] : [];
            recent.getRecentItems.mockResolvedValue([episode]);
            const positions = TestBed.inject(
                PORTAL_PLAYBACK_POSITIONS
            ) as unknown as {
                getAllPlaybackPositions: jest.Mock;
            };
            positions.getAllPlaybackPositions.mockResolvedValue([
                {
                    playlistId: 'portal',
                    contentType: 'episode',
                    contentXtreamId: 909,
                    seriesXtreamId: 900,
                    positionSeconds: 40,
                    durationSeconds: 100,
                },
            ]);
            await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
            const selected = data.allItems()[0];
            expect(selected.coverIndicators?.favorite).toBe(saved);
            expect(selected).toMatchObject({ xtreamId: 909, contentId: 22 });
            await data.toggleFavorite(selected);
            if (saved)
                expect(favorites.removeFavorite).toHaveBeenCalledWith(parent);
            else
                expect(favorites.addFavorite).toHaveBeenCalledWith(
                    expect.objectContaining({
                        xtreamId: 900,
                        contentId: undefined,
                        contentType: 'series',
                    })
                );
            expect(data.allItems()[0].coverIndicators?.favorite).toBe(!saved);
            expect(data.allItems()[0]).toMatchObject({
                xtreamId: 909,
                contentId: 22,
            });
        }
    );

    it('withholds an episode favourite action when the parent show is unknown', async () => {
        const episode: UnifiedCollectionItem = {
            ...series,
            sourceType: 'xtream',
            xtreamId: 909,
            contentId: 22,
            historyContentType: 'episode',
        };
        recent.getRecentItems.mockResolvedValue([episode]);
        const positions = TestBed.inject(
            PORTAL_PLAYBACK_POSITIONS
        ) as unknown as {
            getAllPlaybackPositions: jest.Mock;
        };
        positions.getAllPlaybackPositions.mockResolvedValue([]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        await data.toggleFavorite(data.allItems()[0]);
        expect(favorites.addFavorite).not.toHaveBeenCalled();
        expect(favorites.removeFavorite).not.toHaveBeenCalled();
    });

    it('keeps failed membership reads unknown and retries without losing watched presentation', async () => {
        favorites.getFavoritesStrict.mockRejectedValueOnce(
            new Error('storage failed')
        );
        await data.load({ ...scope, mode: 'recent' });
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        expect(data.favoriteFailed()).toBe(true);
        await data.toggleFavorite(data.allItems()[0]);
        expect(favorites.removeFavorite).not.toHaveBeenCalled();
        await data.retryFavorites();
        expect(data.favoriteFailed()).toBe(false);
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 60,
            watchState: 'in-progress',
        });
    });

    it('recovers episode parent actions and progress when Retry follows failed favourite and watch reads', async () => {
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        persisted = [parentShow];
        favorites.getFavoritesStrict.mockRejectedValueOnce(
            new Error('private')
        );
        const positions = watchRepository();
        positions.getAllPlaybackPositions
            .mockRejectedValueOnce(new Error('private'))
            .mockResolvedValue([episodePosition]);
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        expect(data.allItems()[0].coverDetailTarget).toBeNull();
        expect(data.allItems()[0].coverFavoriteTarget).toBeNull();
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        await data.retryFavorites();
        expect(positions.getAllPlaybackPositions).toHaveBeenCalledTimes(2);
        expect(data.allItems()[0].coverDetailTarget?.item.xtreamId).toBe(900);
        expect(data.allItems()[0].coverFavoriteTarget?.xtreamId).toBe(900);
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 40,
            watchState: 'in-progress',
        });
        expect(data.allItems()[0]).toMatchObject({
            uid: episodeHistory.uid,
            xtreamId: 909,
            contentId: 22,
        });
        expect(data.favoriteFailed()).toBe(false);
        expect(recent.getRecentItems).toHaveBeenCalledTimes(1);
    });

    it('keeps episode parent actions unknown while repeated Retry reads still fail', async () => {
        recent.getRecentItems.mockResolvedValue([episodeHistory]);
        favorites.getFavoritesStrict.mockRejectedValue(new Error('private'));
        watchRepository().getAllPlaybackPositions.mockRejectedValue(
            new Error('private')
        );
        await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
        await data.retryFavorites();
        expect(data.allItems()[0].coverDetailTarget).toBeNull();
        expect(data.allItems()[0].coverFavoriteTarget).toBeNull();
        expect(data.allItems()[0].coverIndicators?.favorite).toBeUndefined();
        expect(data.favoriteFailed()).toBe(true);
        expect(watchRepository().getAllPlaybackPositions).toHaveBeenCalledTimes(
            2
        );
    });

    it('does not resurrect removed history or overwrite promoted/new rows during Retry projection', async () => {
        const show = { ...series, uid: 'stalker::portal::show7' };
        recent.getRecentItems.mockResolvedValue([movie, show]);
        Object.assign(recent, {
            removeRecentItem: jest.fn().mockResolvedValue(undefined),
        });
        await data.load({ ...scope, mode: 'recent' });
        const delayed = deferredPositions();
        watchRepository().getAllPlaybackPositions.mockReturnValueOnce(
            delayed.promise
        );
        const retry = data.retryFavorites();
        await waitForPositionReads(2);
        await data.removeItem('recent', data.allItems()[0]);
        data.promoteRecentItem({
            ...show,
            name: 'Enriched show',
            viewedAt: '2026-10-08T12:00:00Z',
        });
        data.promoteRecentItem({
            ...movie,
            uid: 'stalker::portal::9',
            stalkerId: '9',
            name: 'New film',
            viewedAt: '2026-10-08T13:00:00Z',
        });
        delayed.resolve([episodePosition]);
        await retry;
        expect(data.allItems().map((item) => item.name)).toEqual([
            'New film',
            'Enriched show',
        ]);
        expect(data.allItems().some((item) => item.uid === movie.uid)).toBe(
            false
        );
    });

    it('publishes the latest same-scope Retry and preserves membership changed during watch reads', async () => {
        recent.getRecentItems.mockResolvedValue([movie]);
        persisted = [];
        await data.load({ ...scope, mode: 'recent' });
        const old = deferredPositions();
        const current = deferredPositions();
        watchRepository()
            .getAllPlaybackPositions.mockReturnValueOnce(old.promise)
            .mockReturnValueOnce(current.promise);
        const older = data.retryFavorites();
        await waitForPositionReads(2);
        const newer = data.retryFavorites();
        await waitForPositionReads(3);
        await data.toggleFavorite(data.allItems()[0]);
        current.resolve([
            {
                ...episodePosition,
                contentType: 'vod',
                contentXtreamId: 7,
                positionSeconds: 95,
            },
        ]);
        await newer;
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 95,
        });
        old.resolve([]);
        await older;
        expect(data.allItems()[0].coverIndicators).toMatchObject({
            favorite: true,
            progress: 95,
        });
    });

    it.each(['scope', 'disposal'] as const)(
        'does not publish Retry watch projection after %s supersession',
        async (kind) => {
            recent.getRecentItems.mockResolvedValue([episodeHistory]);
            watchRepository().getAllPlaybackPositions.mockResolvedValue([
                episodePosition,
            ]);
            await data.load({ ...scope, portalType: 'xtream', mode: 'recent' });
            const initial = data.allItems();
            const delayed = deferredPositions();
            watchRepository().getAllPlaybackPositions.mockReturnValueOnce(
                delayed.promise
            );
            const retry = data.retryFavorites();
            await waitForPositionReads(2);
            if (kind === 'scope') {
                recent.getRecentItems.mockResolvedValue([
                    { ...movie, playlistId: 'newer' },
                ]);
                await data.load({
                    ...scope,
                    playlistId: 'newer',
                    mode: 'recent',
                });
            } else TestBed.resetTestingModule();
            delayed.resolve([]);
            await retry;
            if (kind === 'scope')
                expect(data.allItems().map((item) => item.playlistId)).toEqual([
                    'newer',
                ]);
            else expect(data.allItems()).toBe(initial);
        }
    );

    it('does not retry the old mounted scope while a replacement dataset is loading', async () => {
        await data.load({ ...scope, mode: 'recent' });
        let resolve!: (items: UnifiedCollectionItem[]) => void;
        recent.getRecentItems.mockReturnValueOnce(
            new Promise<UnifiedCollectionItem[]>((done) => {
                resolve = done;
            })
        );
        const replacement = data.load({
            ...scope,
            playlistId: 'newer',
            mode: 'recent',
        });
        const favoriteReads = favorites.getFavoritesStrict.mock.calls.length;
        await data.retryFavorites();
        expect(favorites.getFavoritesStrict).toHaveBeenCalledTimes(
            favoriteReads
        );
        expect(watchRepository().getAllPlaybackPositions).toHaveBeenCalledTimes(
            1
        );
        resolve([{ ...movie, playlistId: 'newer' }]);
        await replacement;
        expect(data.allItems()[0].playlistId).toBe('newer');
    });
});
