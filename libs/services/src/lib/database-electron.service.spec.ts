import { DatabaseService } from './database-electron.service';

describe('DatabaseService browser guards', () => {
    const originalElectron = window.electron;
    let service: DatabaseService;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            writable: true,
            value: undefined,
        });
        consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        service = new DatabaseService();
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        Object.defineProperty(window, 'electron', {
            configurable: true,
            writable: true,
            value: originalElectron,
        });
    });

    it('treats app state persistence as unavailable without the Electron bridge', async () => {
        await expect(service.getAppState('xtream-key')).resolves.toBeNull();
        await expect(
            service.setAppState('xtream-key', 'completed')
        ).resolves.toBe(false);
        await expect(
            service.getXtreamImportStatus('playlist-1', 'movie')
        ).resolves.toBe('idle');
        await expect(
            service.setXtreamImportStatus('playlist-1', 'movie', 'completed')
        ).resolves.toBe(false);
        await expect(
            service.getContentByXtreamId(20229, 'playlist-1', 'movie')
        ).resolves.toBeNull();
        await expect(service.getGlobalRecentlyViewed()).resolves.toEqual([]);
        await expect(service.getGlobalFavorites()).resolves.toEqual([]);
        await expect(service.getAllGlobalFavorites()).resolves.toEqual([]);
        await expect(
            service.clearGlobalRecentlyViewed()
        ).resolves.toBeUndefined();
        await expect(service.addToFavorites(20229, 'playlist-1')).resolves.toBe(
            false
        );
        await expect(
            service.removeFromFavorites(20229, 'playlist-1')
        ).resolves.toBe(false);
        await expect(service.isFavorite(20229, 'playlist-1')).resolves.toBe(
            false
        );
        await expect(service.getFavorites('playlist-1')).resolves.toEqual([]);
        await expect(service.getRecentItems('playlist-1')).resolves.toEqual([]);
        await expect(service.addRecentItem(20229, 'playlist-1')).resolves.toBe(
            false
        );
        await expect(
            service.clearPlaylistRecentItems('playlist-1')
        ).resolves.toBe(false);
        await expect(
            service.removeRecentItem(20229, 'playlist-1')
        ).resolves.toBe(false);
        await expect(
            service.removeRecentItemsBatch([
                { contentId: 20229, playlistId: 'playlist-1' },
            ])
        ).resolves.toBe(false);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it.each(['playlist', 'global'] as const)(
        'propagates actual bridge read failures for strict %s favorites',
        async (scope) => {
            const failure = new Error('database unavailable');
            const read = jest.fn().mockRejectedValue(failure);
            window.electron = {
                dbGetFavorites: read,
                dbGetAllGlobalFavorites: read,
            } as unknown as Window['electron'];

            const legacy =
                scope === 'playlist'
                    ? service.getFavorites('playlist-1')
                    : service.getAllGlobalFavorites();
            await expect(legacy).resolves.toEqual([]);
            const strict =
                scope === 'playlist'
                    ? service.getFavorites('playlist-1', true)
                    : service.getAllGlobalFavorites(true);
            await expect(strict).rejects.toBe(failure);
            expect(read).toHaveBeenCalledTimes(2);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        }
    );

    it('keeps strict membership unknown when favorite storage is unavailable', async () => {
        await expect(service.getFavorites('playlist-1', true)).rejects.toThrow(
            'Favorites storage is unavailable'
        );
        await expect(service.getAllGlobalFavorites(true)).rejects.toThrow(
            'Favorites storage is unavailable'
        );
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('reads complete membership from its dedicated bridge without using the display query', async () => {
        const rows = Array.from({ length: 501 }, (_, id) => ({ id }));
        const read = jest.fn().mockResolvedValue(rows);
        const display = jest.fn();
        window.electron = {
            dbGetAllGlobalFavoriteMembership: read,
            dbGetAllGlobalFavorites: display,
        } as unknown as Window['electron'];

        await expect(service.getAllGlobalFavoriteMembership()).resolves.toBe(
            rows
        );
        expect(read).toHaveBeenCalledTimes(1);
        expect(display).not.toHaveBeenCalled();
    });

    it('rejects unavailable, failed and invalid complete-membership reads', async () => {
        await expect(service.getAllGlobalFavoriteMembership()).rejects.toThrow(
            'Favorites storage is unavailable'
        );
        const failure = new Error('storage failed');
        const read = jest.fn().mockRejectedValue(failure);
        window.electron = {
            dbGetAllGlobalFavoriteMembership: read,
        } as unknown as Window['electron'];
        await expect(service.getAllGlobalFavoriteMembership()).rejects.toBe(
            failure
        );
        read.mockResolvedValue(null);
        await expect(service.getAllGlobalFavoriteMembership()).rejects.toThrow(
            'Favorite membership response is invalid'
        );
        read.mockResolvedValue([]);
        await expect(service.getAllGlobalFavoriteMembership()).resolves.toEqual(
            []
        );
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
