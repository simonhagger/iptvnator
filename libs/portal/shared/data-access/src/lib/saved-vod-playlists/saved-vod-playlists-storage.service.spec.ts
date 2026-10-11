import { TestBed } from '@angular/core/testing';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import type {
    ElectronBridgeApi,
    SavedVodPlaylist,
} from '@iptvnator/shared/interfaces';
import { BrowserSavedVodPlaylists } from './browser-saved-vod-playlists';
import { SavedVodPlaylistsStorageService } from './saved-vod-playlists-storage.service';

const playlist: SavedVodPlaylist = {
    schemaVersion: 1,
    id: 'weekend',
    name: 'Weekend',
    revision: 1,
    entries: [],
    execution: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
};

describe('saved playlist runtime storage selection', () => {
    const original = window.electron;
    const runtime = { isElectron: true, supportsSavedVodPlaylistStorage: true };
    const bridge = () => ({
        dbListSavedVodPlaylists: jest.fn().mockResolvedValue([]),
        dbGetSavedVodPlaylist: jest.fn().mockResolvedValue(playlist),
        dbSaveSavedVodPlaylist: jest
            .fn()
            .mockResolvedValue({ status: 'saved', playlist }),
        dbDeleteSavedVodPlaylist: jest
            .fn()
            .mockResolvedValue({ status: 'deleted' }),
    });
    function setup(methods: Partial<ElectronBridgeApi>) {
        window.electron = methods as ElectronBridgeApi;
        TestBed.configureTestingModule({
            providers: [
                { provide: RuntimeCapabilitiesService, useValue: runtime },
            ],
        });
        return TestBed.inject(SavedVodPlaylistsStorageService);
    }
    beforeEach(() => {
        runtime.isElectron = true;
        runtime.supportsSavedVodPlaylistStorage = true;
    });
    afterEach(() => {
        window.electron = original;
        jest.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('uses the complete typed desktop bridge for every operation', async () => {
        const methods = bridge();
        const service = setup(methods);
        await service.list();
        await service.get('weekend');
        await service.save(playlist, 1);
        await service.delete('weekend', 1);
        expect(methods.dbListSavedVodPlaylists).toHaveBeenCalledTimes(1);
        expect(methods.dbGetSavedVodPlaylist).toHaveBeenCalledWith('weekend');
        expect(methods.dbSaveSavedVodPlaylist).toHaveBeenCalledWith(
            playlist,
            1
        );
        expect(methods.dbDeleteSavedVodPlaylist).toHaveBeenCalledWith(
            'weekend',
            1
        );
    });

    it('rejects an incomplete desktop bridge without creating a divergent browser store', () => {
        const browser = jest.spyOn(BrowserSavedVodPlaylists.prototype, 'list');
        const service = setup({
            ...bridge(),
            dbDeleteSavedVodPlaylist: undefined,
        });
        expect(() => service.list()).toThrow('updated desktop app');
        expect(browser).not.toHaveBeenCalled();
    });

    it('respects the explicit runtime capability even if bridge functions exist', () => {
        runtime.supportsSavedVodPlaylistStorage = false;
        const service = setup(bridge());
        expect(() => service.list()).toThrow('updated desktop app');
    });

    it('uses browser persistence for a PWA', async () => {
        runtime.isElectron = false;
        const browser = jest
            .spyOn(BrowserSavedVodPlaylists.prototype, 'list')
            .mockResolvedValue([]);
        const methods = bridge();
        await setup(methods).list();
        expect(browser).toHaveBeenCalledTimes(1);
        expect(methods.dbListSavedVodPlaylists).not.toHaveBeenCalled();
    });

    it('removes unknown credential fields before crossing IPC', async () => {
        const methods = bridge();
        await setup(methods).save(
            { ...playlist, password: 'synthetic-secret' } as SavedVodPlaylist,
            1
        );
        expect(methods.dbSaveSavedVodPlaylist).toHaveBeenCalledWith(
            playlist,
            1
        );
    });
});
