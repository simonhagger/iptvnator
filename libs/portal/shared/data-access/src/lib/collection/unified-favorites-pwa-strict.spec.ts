import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import {
    DatabaseService,
    ParentalLockService,
    PlaylistsService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import {
    PwaXtreamDataSource,
    XTREAM_DATA_SOURCE,
    XtreamApiService,
} from '@iptvnator/portal/xtream/data-access';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';

describe('PWA strict favorite membership through the real adapter', () => {
    let service: UnifiedFavoritesDataService;
    let adapter: PwaXtreamDataSource;
    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [
                UnifiedFavoritesDataService,
                PwaXtreamDataSource,
                {
                    provide: XTREAM_DATA_SOURCE,
                    useExisting: PwaXtreamDataSource,
                },
                {
                    provide: Store,
                    useValue: {
                        select: () =>
                            of([
                                {
                                    _id: 'p',
                                    title: 'Portal',
                                    serverUrl: 'http://mock',
                                },
                            ]),
                    },
                },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
                { provide: DatabaseService, useValue: {} },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: {
                        supportsPortalActivityStorage: false,
                        supportsAppStateStorage: false,
                    },
                },
                {
                    provide: PlaylistsService,
                    useValue: { getPlaylistById: () => of(undefined) },
                },
                {
                    provide: ParentalLockService,
                    useValue: {
                        active: () => false,
                        lockedXtreamIds: () => [],
                        withholdsEverything: () => false,
                    },
                },
                {
                    provide: XtreamApiService,
                    useValue: {
                        getStreams: jest.fn().mockResolvedValue([
                            {
                                stream_id: 7,
                                name: 'Saved film',
                                category_id: '42',
                            },
                        ]),
                    },
                },
            ],
        });
        service = TestBed.inject(UnifiedFavoritesDataService);
        adapter = TestBed.inject(PwaXtreamDataSource);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        localStorage.clear();
    });

    it.each(['denied', 'malformed'] as const)(
        'rejects %s storage and recovers persisted membership without rewriting it',
        async (failure) => {
            await adapter.getContent(
                'p',
                { serverUrl: 'http://mock', username: 'u', password: 'p' },
                'movie'
            );
            await adapter.addFavorite(7, 'p');
            const saved = localStorage.getItem('xtream-favorites');
            const originalGet = Storage.prototype.getItem;
            const read = jest
                .spyOn(Storage.prototype, 'getItem')
                .mockImplementation(function (this: Storage, key: string) {
                    if (key === 'xtream-favorites') {
                        if (failure === 'denied')
                            throw new Error('Storage unavailable');
                        return '{malformed';
                    }
                    return originalGet.call(this, key);
                });
            await expect(
                service.getFavoritesStrict('playlist', 'p', 'xtream')
            ).rejects.toThrow();
            await expect(service.getFavoritesStrict('all')).rejects.toThrow();
            await expect(
                service.getFavorites('playlist', 'p', 'xtream')
            ).resolves.toEqual([]);
            read.mockRestore();
            await expect(
                service.getFavoritesStrict('playlist', 'p', 'xtream')
            ).resolves.toEqual([
                expect.objectContaining({
                    xtreamId: 7,
                    contentId: 7,
                    name: 'Saved film',
                    playlistId: 'p',
                }),
            ]);
            expect(localStorage.getItem('xtream-favorites')).toBe(saved);
        }
    );

    it.each(['denied', 'malformed'] as const)(
        'rejects %s required collection snapshots and restores membership after recovery',
        async (failure) => {
            localStorage.setItem(
                'xtream-favorites',
                JSON.stringify({ p: [7] })
            );
            const snapshot = JSON.stringify({
                p: {
                    '7': {
                        id: 7,
                        xtream_id: 7,
                        title: 'Saved film',
                        type: 'movie',
                    },
                },
            });
            localStorage.setItem('xtream-collection-items', snapshot);
            const originalGet = Storage.prototype.getItem;
            const read = jest
                .spyOn(Storage.prototype, 'getItem')
                .mockImplementation(function (this: Storage, key: string) {
                    if (key === 'xtream-collection-items') {
                        if (failure === 'denied')
                            throw new Error('Storage unavailable');
                        return '{malformed';
                    }
                    return originalGet.call(this, key);
                });
            await expect(
                service.getFavoritesStrict('playlist', 'p', 'xtream')
            ).rejects.toThrow();
            await expect(
                service.getFavorites('playlist', 'p', 'xtream')
            ).resolves.toEqual([]);
            read.mockRestore();
            await expect(
                service.getFavoritesStrict('playlist', 'p', 'xtream')
            ).resolves.toEqual([
                expect.objectContaining({ xtreamId: 7, name: 'Saved film' }),
            ]);
            expect(localStorage.getItem('xtream-collection-items')).toBe(
                snapshot
            );
        }
    );

    it('rejects unresolved referenced favorites instead of certifying a partial hydrated collection', async () => {
        localStorage.setItem('xtream-favorites', JSON.stringify({ p: [7, 8] }));
        localStorage.setItem(
            'xtream-collection-items',
            JSON.stringify({
                p: {
                    '7': {
                        id: 7,
                        xtream_id: 7,
                        title: 'Saved film',
                        type: 'movie',
                    },
                },
            })
        );
        await expect(
            service.getFavoritesStrict('playlist', 'p', 'xtream')
        ).rejects.toThrow();
        await expect(
            service.getFavorites('playlist', 'p', 'xtream')
        ).resolves.toEqual([expect.objectContaining({ xtreamId: 7 })]);
    });

    it.each(['', 'null', '[]', '{"p":{}}', '{"p":[0]}'])(
        'rejects invalid stored membership %s while legacy readers preserve their fallback',
        async (stored) => {
            localStorage.setItem('xtream-favorites', stored);
            await expect(
                service.getFavoritesStrict('playlist', 'p', 'xtream')
            ).rejects.toThrow();
            await expect(
                service.getFavorites('playlist', 'p', 'xtream')
            ).resolves.toEqual([]);
        }
    );

    it.each([
        { operation: 'add', failure: 'denied' },
        { operation: 'remove', failure: 'denied' },
        { operation: 'add', failure: 'malformed' },
        { operation: 'remove', failure: 'malformed' },
    ] as const)(
        'rejects $operation before any write when current membership is $failure',
        async ({ operation, failure }) => {
            localStorage.setItem(
                'xtream-favorites',
                JSON.stringify({ p: [7], other: [99] })
            );
            const saved = localStorage.getItem('xtream-favorites');
            const originalGet = Storage.prototype.getItem;
            const read = jest
                .spyOn(Storage.prototype, 'getItem')
                .mockImplementation(function (this: Storage, key: string) {
                    if (key === 'xtream-favorites') {
                        if (failure === 'denied')
                            throw new Error('Storage unavailable');
                        return '{malformed';
                    }
                    return originalGet.call(this, key);
                });
            const writes = jest.spyOn(Storage.prototype, 'setItem');
            await expect(
                operation === 'add'
                    ? adapter.addFavorite(8, 'p')
                    : adapter.removeFavorite(7, 'p')
            ).rejects.toThrow();
            expect(writes).not.toHaveBeenCalled();
            read.mockRestore();
            expect(localStorage.getItem('xtream-favorites')).toBe(saved);
        }
    );

    it.each(['add', 'remove'] as const)(
        'reads current membership for %s after deferred validation loads',
        async (operation) => {
            localStorage.setItem(
                'xtream-favorites',
                JSON.stringify({ p: [7, 8] })
            );
            const command =
                operation === 'add'
                    ? adapter.addFavorite(9, 'p')
                    : adapter.removeFavorite(7, 'p');
            // Another owner updates persistence while the deferred module loads.
            // The accepted command must retain that update when it reads/writes.
            localStorage.setItem(
                'xtream-favorites',
                JSON.stringify({ p: [7, 8], other: [99] })
            );
            await command;
            expect(
                JSON.parse(localStorage.getItem('xtream-favorites') ?? '{}')
            ).toEqual({
                p: operation === 'add' ? [7, 8, 9] : [8],
                other: [99],
            });
        }
    );

    it('rejects failed required API hydration instead of declaring referenced favorites absent', async () => {
        localStorage.setItem('xtream-favorites', JSON.stringify({ p: [7] }));
        localStorage.setItem(
            'xtream-playlists',
            JSON.stringify([
                {
                    id: 'p',
                    serverUrl: 'http://mock',
                    username: 'u',
                    password: 'p',
                },
            ])
        );
        const requests = jest
            .spyOn(TestBed.inject(XtreamApiService), 'getStreams')
            .mockRejectedValue(new Error('Provider unavailable'));
        await expect(
            service.getFavoritesStrict('playlist', 'p', 'xtream')
        ).rejects.toThrow();
        await expect(
            service.getFavorites('playlist', 'p', 'xtream')
        ).resolves.toEqual([]);
        expect(requests).toHaveBeenCalled();
    });

    it('rejects corrupt referenced snapshots instead of reporting an unrelated favorite kind', async () => {
        localStorage.setItem('xtream-favorites', JSON.stringify({ p: [7] }));
        localStorage.setItem(
            'xtream-collection-items',
            JSON.stringify({ p: { '7': { id: 7, title: 'Saved film' } } })
        );
        await expect(
            service.getFavoritesStrict('playlist', 'p', 'xtream')
        ).rejects.toThrow();
    });

    it('accepts historical numeric-string IDs and genuine known-empty storage without rewriting either', async () => {
        await expect(
            service.getFavoritesStrict('playlist', 'p', 'xtream')
        ).resolves.toEqual([]);
        const stored = JSON.stringify({ p: ['7'] });
        localStorage.setItem('xtream-favorites', stored);
        localStorage.setItem(
            'xtream-collection-items',
            JSON.stringify({
                p: {
                    '7': {
                        id: 7,
                        xtream_id: 7,
                        title: 'Saved film',
                        type: 'movie',
                    },
                },
            })
        );
        await expect(
            service.getFavoritesStrict('playlist', 'p', 'xtream')
        ).resolves.toEqual([expect.objectContaining({ xtreamId: 7 })]);
        expect(localStorage.getItem('xtream-favorites')).toBe(stored);
    });
});
