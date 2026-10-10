import { TestBed } from '@angular/core/testing';
import {
    UnifiedCollectionItem,
    PORTAL_PLAYBACK_POSITIONS,
} from '@iptvnator/portal/shared/util';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { ContentCoverDataService } from './content-cover-data.service';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';

const item: UnifiedCollectionItem = {
    uid: 'xtream::a::movie:7',
    name: 'Film',
    contentType: 'movie',
    sourceType: 'xtream',
    playlistId: 'a',
    playlistName: 'Portal',
    xtreamId: 7,
};
const scope = {
    scope: 'playlist',
    playlistId: 'a',
    portalType: 'xtream',
} as const;
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('ContentCoverDataService', () => {
    let service: ContentCoverDataService;
    let positions: { getAllPlaybackPositions: jest.Mock };
    let favorites: {
        getFavorites: jest.Mock;
        getFavoritesStrict: jest.Mock;
        addFavorite: jest.Mock;
        removeFavorite: jest.Mock;
    };

    beforeEach(() => {
        positions = {
            getAllPlaybackPositions: jest.fn().mockResolvedValue([]),
        };
        const read = jest.fn().mockResolvedValue([]);
        favorites = {
            getFavorites: read,
            getFavoritesStrict: read,
            addFavorite: jest.fn().mockResolvedValue(undefined),
            removeFavorite: jest.fn().mockResolvedValue(undefined),
        };
        TestBed.configureTestingModule({
            providers: [
                ContentCoverDataService,
                { provide: UnifiedFavoritesDataService, useValue: favorites },
                { provide: PORTAL_PLAYBACK_POSITIONS, useValue: positions },
            ],
        });
        service = TestBed.inject(ContentCoverDataService);
    });

    it('exposes failure state for reading without external mutation methods', () => {
        expect(service.failed()).toBe(false);
        expect(service.failed).not.toHaveProperty('set');
        expect(service.failed).not.toHaveProperty('update');
    });

    it('projects saved progress on search/recent covers with one bulk read per represented playlist', async () => {
        const moviePosition: PlaybackPositionData = {
            playlistId: 'a',
            contentType: 'vod',
            contentXtreamId: 7,
            positionSeconds: 95,
            durationSeconds: 100,
        };
        const episode: PlaybackPositionData = {
            ...moviePosition,
            contentType: 'episode',
            contentXtreamId: 22,
            seriesXtreamId: 7,
            positionSeconds: 100,
        };
        positions.getAllPlaybackPositions.mockResolvedValue([
            moviePosition,
            episode,
        ]);
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a', 'a', 'b']);
        await service.loadWatchPositions(['a']);
        const context = {
            provider: 'xtream',
            playlistId: 'a',
            contentType: 'vod',
        } as const;
        for (let index = 0; index < 20; index++)
            expect(
                service.indicatorsForProvider(context, { stream_id: 7 })
            ).toMatchObject({ watchState: 'watched', progress: 95 });
        expect(
            service.indicatorsForProvider(
                { ...context, contentType: 'series' },
                { series_id: 7 }
            )
        ).toMatchObject({
            watchState: 'in-progress',
            progressScope: 'episode',
            progress: 100,
        });
        expect(positions.getAllPlaybackPositions.mock.calls).toEqual([
            ['a'],
            ['b'],
        ]);
    });

    it('ignores stale watch reads after switching the represented source', async () => {
        const old = deferred<PlaybackPositionData[]>();
        positions.getAllPlaybackPositions.mockReturnValueOnce(old.promise);
        await service.load(scope);
        const read = service.loadWatchPositions(['a', 'foreign']);
        await service.load({ ...scope, playlistId: 'b' });
        old.resolve([
            {
                playlistId: 'a',
                contentType: 'vod',
                contentXtreamId: 7,
                positionSeconds: 95,
                durationSeconds: 100,
            },
        ]);
        await read;
        expect(positions.getAllPlaybackPositions.mock.calls).toEqual([['a']]);
        expect(
            service.indicatorsForProvider(
                { provider: 'xtream', playlistId: 'a', contentType: 'vod' },
                { stream_id: 7 }
            ).watchState
        ).toBeUndefined();
    });

    it.each([false, true])(
        'retries every represented watch scope after favourite and watch failures; favourite retry fails=%s',
        async (retryFails) => {
            favorites.getFavoritesStrict.mockRejectedValueOnce(
                new Error('private')
            );
            if (retryFails)
                favorites.getFavoritesStrict.mockRejectedValueOnce(
                    new Error('private')
                );
            else favorites.getFavoritesStrict.mockResolvedValueOnce([item]);
            const saved: PlaybackPositionData = {
                playlistId: 'a',
                contentType: 'vod',
                contentXtreamId: 7,
                positionSeconds: 95,
                durationSeconds: 100,
            };
            positions.getAllPlaybackPositions
                .mockRejectedValueOnce(new Error('private'))
                .mockImplementation(async (id: string) => [
                    { ...saved, playlistId: id },
                ]);
            await service.load({ scope: 'all' });
            await service.loadWatchPositions(['a', 'a', 'b']);
            const context = {
                provider: 'xtream',
                playlistId: 'a',
                contentType: 'vod',
            } as const;
            expect(
                service.indicatorsForProvider(context, { stream_id: 7 })
                    .watchState
            ).toBeUndefined();
            expect(service.favoriteFor(item)).toBeUndefined();
            await service.retry();
            expect(positions.getAllPlaybackPositions.mock.calls).toEqual([
                ['a'],
                ['b'],
                ['a'],
                ['b'],
            ]);
            expect(
                service.indicatorsForProvider(context, { stream_id: 7 })
            ).toMatchObject({ watchState: 'watched', progress: 95 });
            expect(service.favoriteFor(item)).toBe(
                retryFails ? undefined : true
            );
            expect(service.failed()).toBe(retryFails);
        }
    );

    it('does not revive a superseded represented scope when an older same-scope retry finishes', async () => {
        const all = { scope: 'all' } as const;
        await service.load(all);
        await service.loadWatchPositions(['a']);
        const old = deferred<UnifiedCollectionItem[]>();
        favorites.getFavoritesStrict.mockReturnValueOnce(old.promise);
        const retry = service.retry();
        await Promise.resolve();
        await service.load(all);
        await service.loadWatchPositions(['b']);
        old.resolve([]);
        await retry;
        expect(positions.getAllPlaybackPositions.mock.calls).toEqual([
            ['a'],
            ['b'],
        ]);
        await service.retry();
        expect(positions.getAllPlaybackPositions.mock.calls).toEqual([
            ['a'],
            ['b'],
            ['b'],
        ]);
    });

    it('does not retry represented watch reads after disposal', async () => {
        await service.load(scope);
        await service.loadWatchPositions(['a', 'foreign']);
        const read = deferred<UnifiedCollectionItem[]>();
        favorites.getFavoritesStrict.mockReturnValueOnce(read.promise);
        const retry = service.retry();
        await Promise.resolve();
        TestBed.resetTestingModule();
        read.resolve([]);
        await retry;
        expect(positions.getAllPlaybackPositions.mock.calls).toEqual([['a']]);
        expect(service.favoriteFor(item)).toBeUndefined();
    });

    it('retries a failed scoped favourite read and preserves known membership when a write fails', async () => {
        favorites.getFavorites.mockRejectedValueOnce(new Error('private'));
        await service.load(scope);
        expect(service.failed()).toBe(true);
        expect(service.favoriteFor(item)).toBeUndefined();
        await service.retry();
        expect(service.failed()).toBe(false);
        favorites.addFavorite.mockRejectedValueOnce(new Error('private'));
        await service.toggleFavorite(item);
        expect(service.failed()).toBe(true);
        expect(service.favoriteFor(item)).toBe(false);
    });

    it('uses strict snapshots for initial and post-write reads, and retries to persisted membership', async () => {
        favorites.getFavorites = jest.fn().mockResolvedValue([]);
        favorites.getFavoritesStrict
            .mockRejectedValueOnce(new Error('storage failed'))
            .mockResolvedValueOnce([item])
            .mockRejectedValueOnce(new Error('storage failed'))
            .mockResolvedValueOnce([]);
        await service.load(scope);
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.actionsFor(item).map((action) => action.id)).toEqual([
            'details',
        ]);
        expect(service.failed()).toBe(true);
        await service.retry();
        expect(service.favoriteFor(item)).toBe(true);
        await service.toggleFavorite(item);
        expect(favorites.removeFavorite).toHaveBeenCalledWith(item);
        expect(service.failed()).toBe(true);
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.actionsFor(item).map((action) => action.id)).toEqual([
            'details',
        ]);
        await service.retry();
        expect(service.favoriteFor(item)).toBe(false);
        expect(service.failed()).toBe(false);
        expect(favorites.getFavorites).not.toHaveBeenCalled();
        expect(favorites.getFavoritesStrict).toHaveBeenCalledTimes(4);
    });

    it('does not execute a queued write from a snapshot invalidated by a successful write whose reread failed', async () => {
        const second = { ...item, xtreamId: 8, uid: 'xtream::a::movie:8' };
        favorites.getFavoritesStrict
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('storage failed'));
        await service.load(scope);
        await Promise.all([
            service.toggleFavorite(item),
            service.toggleFavorite(second),
        ]);
        expect(favorites.addFavorite).toHaveBeenCalledTimes(1);
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.favoriteFor(second)).toBeUndefined();
        expect(service.pendingFavoriteKeys().size).toBe(0);
    });

    it('leaves membership unknown before bulk hydration and performs no card reads', async () => {
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.actionsFor(item).map((action) => action.id)).toEqual([
            'details',
        ]);
        await service.load(scope);
        for (let index = 0; index < 30; index++)
            expect(service.favoriteFor(item)).toBe(false);
        expect(favorites.getFavorites).toHaveBeenCalledTimes(1);
        expect(favorites.getFavorites).toHaveBeenCalledWith(
            'playlist',
            'a',
            'xtream'
        );
    });

    it('does not confuse source, playlist or kind with an existing favorite', async () => {
        favorites.getFavorites.mockResolvedValue([item]);
        await service.load(scope);
        expect(service.favoriteFor(item)).toBe(true);
        expect(service.favoriteFor({ ...item, contentType: 'series' })).toBe(
            false
        );
        expect(
            service.favoriteFor({ ...item, playlistId: 'b' })
        ).toBeUndefined();
        expect(
            service.favoriteFor({
                ...item,
                sourceType: 'stalker',
                xtreamId: undefined,
                stalkerId: '7',
            })
        ).toBeUndefined();
    });

    it('ignores an older source read that resolves after the new source', async () => {
        const first = deferred<UnifiedCollectionItem[]>();
        favorites.getFavorites
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce([]);
        const pending = service.load(scope);
        await Promise.resolve();
        await service.load({ ...scope, playlistId: 'b' });
        first.resolve([item]);
        await pending;
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.failed()).toBe(false);
    });

    it('keeps failed reads unknown rather than showing false membership', async () => {
        favorites.getFavorites.mockRejectedValue(
            new Error('private provider failure')
        );
        await service.load(scope);
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.failed()).toBe(true);
    });

    it('removes using the persisted SQLite row and re-reads membership', async () => {
        const stored = { ...item, contentId: 102 };
        favorites.getFavorites
            .mockResolvedValueOnce([stored])
            .mockResolvedValueOnce([]);
        await service.load(scope);
        await service.toggleFavorite(item);
        expect(favorites.removeFavorite).toHaveBeenCalledWith(stored);
        expect(favorites.addFavorite).not.toHaveBeenCalled();
        expect(service.favoriteFor(item)).toBe(false);
    });

    it('does not claim a successful favourite after a no-op persistence write', async () => {
        await service.load(scope);
        await service.toggleFavorite(item);
        expect(favorites.addFavorite).toHaveBeenCalledWith(item);
        expect(service.favoriteFor(item)).toBe(false);
    });

    it('blocks repeat toggles and ignores stale mutation refreshes after switching sources', async () => {
        const write = deferred<void>();
        favorites.addFavorite.mockReturnValue(write.promise);
        favorites.getFavorites
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([item]);
        await service.load(scope);
        const pending = service.toggleFavorite(item);
        await service.toggleFavorite(item);
        expect(favorites.addFavorite).toHaveBeenCalledTimes(1);
        expect(
            service.actionsFor(item).find((action) => action.id === 'favorite')
                ?.disabled
        ).toBe(true);
        const nextScope = service.load({ ...scope, playlistId: 'b' });
        write.resolve();
        await pending;
        await nextScope;
        expect(service.favoriteFor(item)).toBeUndefined();
        expect(service.failed()).toBe(false);
    });

    it('serialises different-item refreshes so an older snapshot cannot erase a newer favourite', async () => {
        const second = { ...item, xtreamId: 8, uid: 'xtream::a::movie:8' };
        const firstSnapshot = deferred<UnifiedCollectionItem[]>();
        favorites.getFavorites
            .mockResolvedValueOnce([])
            .mockReturnValueOnce(firstSnapshot.promise)
            .mockResolvedValueOnce([item, second]);
        await service.load(scope);
        const firstWrite = service.toggleFavorite(item);
        const secondWrite = service.toggleFavorite(second);
        for (let tick = 0; tick < 5; tick++) await Promise.resolve();
        expect(favorites.getFavorites).toHaveBeenCalledTimes(2);
        expect(favorites.addFavorite).toHaveBeenCalledTimes(1);
        firstSnapshot.resolve([item]);
        await Promise.all([firstWrite, secondWrite]);
        expect(favorites.addFavorite).toHaveBeenCalledTimes(2);
        expect(service.favoriteFor(item)).toBe(true);
        expect(service.favoriteFor(second)).toBe(true);
    });

    it.each(['add', 'remove'] as const)(
        'keeps accepted queued %s intent when an earlier refresh observes an external membership change',
        async (intent) => {
            const second = {
                ...item,
                xtreamId: 8,
                uid: 'xtream::a::movie:8',
                contentId: 108,
            };
            favorites.getFavoritesStrict
                .mockResolvedValueOnce(intent === 'add' ? [] : [second])
                .mockResolvedValueOnce(
                    intent === 'add' ? [item, second] : [item]
                )
                .mockResolvedValueOnce(
                    intent === 'add' ? [item, second] : [item]
                );
            await service.load(scope);
            await Promise.all([
                service.toggleFavorite(item),
                service.toggleFavorite(second),
            ]);
            if (intent === 'add') {
                expect(favorites.addFavorite.mock.calls).toEqual([
                    [item],
                    [second],
                ]);
                expect(favorites.removeFavorite).not.toHaveBeenCalled();
            } else {
                expect(favorites.addFavorite.mock.calls).toEqual([[item]]);
                expect(favorites.removeFavorite).toHaveBeenCalledWith(second);
            }
            expect(service.favoriteFor(second)).toBe(intent === 'add');
        }
    );

    it('uses refreshed persisted metadata without changing an accepted queued Remove intent', async () => {
        const second = {
            ...item,
            xtreamId: 8,
            uid: 'xtream::a::movie:8',
            contentId: 108,
        };
        const refreshed = { ...second, contentId: 208 };
        favorites.getFavoritesStrict
            .mockResolvedValueOnce([second])
            .mockResolvedValueOnce([item, refreshed])
            .mockResolvedValueOnce([item]);
        await service.load(scope);
        await Promise.all([
            service.toggleFavorite(item),
            service.toggleFavorite(second),
        ]);
        expect(favorites.removeFavorite).toHaveBeenCalledWith(refreshed);
        expect(service.favoriteFor(second)).toBe(false);
    });

    it('reloads the same surface only after a pending write settles', async () => {
        const write = deferred<void>();
        favorites.addFavorite.mockReturnValue(write.promise);
        favorites.getFavorites
            .mockResolvedValueOnce([])
            .mockResolvedValue([item]);
        await service.load(scope);
        const pending = service.toggleFavorite(item);
        const reloaded = service.load(scope);
        expect(service.favoriteFor(item)).toBeUndefined();
        write.resolve();
        await Promise.all([pending, reloaded]);
        expect(favorites.addFavorite).toHaveBeenCalledTimes(1);
        expect(favorites.addFavorite).toHaveBeenCalledWith(item);
        expect(service.favoriteFor(item)).toBe(true);
    });

    it('finishes accepted queued writes before a same-scope reload publishes its snapshot', async () => {
        const second = { ...item, xtreamId: 8, uid: 'xtream::a::movie:8' };
        const firstWrite = deferred<void>();
        const persisted: UnifiedCollectionItem[] = [];
        const events: string[] = [];
        favorites.getFavoritesStrict.mockImplementation(async () => {
            events.push(`read:${persisted.length}`);
            return [...persisted];
        });
        favorites.addFavorite.mockImplementation(
            async (row: UnifiedCollectionItem) => {
                if (row.xtreamId === 7) await firstWrite.promise;
                persisted.push(row);
                events.push(`write:${row.xtreamId}`);
            }
        );
        await service.load(scope);
        const first = service.toggleFavorite(item);
        const secondPending = service.toggleFavorite(second);
        const reload = service.load(scope);
        firstWrite.resolve();
        await Promise.all([first, secondPending, reload]);
        expect(events).toEqual([
            'read:0',
            'write:7',
            'read:1',
            'write:8',
            'read:2',
            'read:2',
        ]);
        expect(service.favoriteFor(item)).toBe(true);
        expect(service.favoriteFor(second)).toBe(true);
    });

    it('finishes an accepted persistence write after its view is destroyed without publishing old state', async () => {
        await service.load(scope);
        const accepted = service.toggleFavorite(item);
        TestBed.resetTestingModule();
        await accepted;
        expect(favorites.addFavorite).toHaveBeenCalledTimes(1);
        expect(favorites.addFavorite).toHaveBeenCalledWith(item);
        expect(service.favoriteFor(item)).toBeUndefined();
    });

    it('does not apply a pending read after destruction', async () => {
        const read = deferred<UnifiedCollectionItem[]>();
        favorites.getFavorites.mockReturnValue(read.promise);
        const pending = service.load(scope);
        TestBed.resetTestingModule();
        read.resolve([item]);
        await pending;
        expect(service.favoriteFor(item)).toBeUndefined();
    });
});
