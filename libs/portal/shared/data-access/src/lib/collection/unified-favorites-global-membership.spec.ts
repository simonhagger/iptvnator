import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import {
    DatabaseService,
    PlaylistsService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { UnifiedCollectionItem } from '@iptvnator/portal/shared/util';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';
import { ContentCoverDataService } from './content-cover-data.service';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';

describe('Complete global favourite membership', () => {
    const target: UnifiedCollectionItem = {
        uid: 'xtream::xtream-1::movie:501',
        name: 'Film 500',
        contentType: 'movie',
        sourceType: 'xtream',
        playlistId: 'xtream-1',
        playlistName: 'Portal',
        xtreamId: 501,
        contentId: 1500,
    };
    let service: UnifiedFavoritesDataService;
    let covers: ContentCoverDataService;
    let persisted: {
        id: number;
        category_id: number;
        title: string;
        type: string;
        xtream_id: number;
        playlist_id: string;
    }[];
    const database = {
        getAllGlobalFavorites: jest.fn(),
        getAllGlobalFavoriteMembership: jest.fn(),
    };
    const bridge = { dbRemoveFavorite: jest.fn(), dbAddFavorite: jest.fn() };

    beforeEach(() => {
        persisted = Array.from({ length: 501 }, (_, index) => ({
            id: 1000 + index,
            category_id: 20,
            title: `Film ${index}`,
            type: 'movie',
            xtream_id: index + 1,
            playlist_id: 'xtream-1',
        }));
        database.getAllGlobalFavorites
            .mockReset()
            .mockImplementation(async () => persisted.slice(0, 500));
        database.getAllGlobalFavoriteMembership
            .mockReset()
            .mockImplementation(async () => [...persisted]);
        bridge.dbAddFavorite.mockReset();
        bridge.dbRemoveFavorite
            .mockReset()
            .mockImplementation(async (id, playlistId) => {
                persisted = persisted.filter(
                    (row) => row.id !== id || row.playlist_id !== playlistId
                );
            });
        Object.defineProperty(window, 'electron', {
            value: bridge,
            configurable: true,
        });
        TestBed.configureTestingModule({
            providers: [
                UnifiedFavoritesDataService,
                ContentCoverDataService,
                { provide: DatabaseService, useValue: database },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { supportsPortalActivityStorage: true },
                },
                { provide: Store, useValue: { select: () => of([]) } },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
                { provide: PlaylistsService, useValue: {} },
                { provide: XTREAM_DATA_SOURCE, useValue: {} },
            ],
        });
        service = TestBed.inject(UnifiedFavoritesDataService);
        covers = TestBed.inject(ContentCoverDataService);
    });

    it('keeps membership beyond the 500-row display limit through removal readback', async () => {
        expect(await service.getFavorites('all')).toHaveLength(500);
        await covers.load({ scope: 'all' });
        expect(covers.favoriteFor(target)).toBe(true);
        expect(
            covers.actionsFor(target).find((action) => action.id === 'favorite')
                ?.labelKey
        ).toBe('PORTALS.REMOVE_FROM_FAVORITES');
        await covers.toggleFavorite(target);
        expect(bridge.dbRemoveFavorite).toHaveBeenCalledWith(1500, 'xtream-1');
        expect(bridge.dbAddFavorite).not.toHaveBeenCalled();
        expect(covers.favoriteFor(target)).toBe(false);
        expect(persisted).toHaveLength(500);
        expect(database.getAllGlobalFavoriteMembership).toHaveBeenCalledTimes(
            2
        );
        expect(database.getAllGlobalFavorites).toHaveBeenCalledTimes(1);
    });

    it('keeps failed complete native membership unknown until strict retry', async () => {
        database.getAllGlobalFavoriteMembership.mockRejectedValueOnce(
            new Error('membership unavailable')
        );
        await covers.load({ scope: 'all' });
        expect(covers.failed()).toBe(true);
        expect(covers.favoriteFor(target)).toBeUndefined();
        await covers.retry();
        expect(covers.favoriteFor(target)).toBe(true);
        expect(covers.failed()).toBe(false);
        expect(database.getAllGlobalFavorites).not.toHaveBeenCalled();
    });
});
