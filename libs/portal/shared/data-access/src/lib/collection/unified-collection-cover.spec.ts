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
});
