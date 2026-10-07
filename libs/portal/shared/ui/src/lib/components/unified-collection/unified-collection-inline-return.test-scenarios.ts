import type { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionMode } from '@iptvnator/portal/shared/data-access';
import type { UnifiedCollectionItem } from '@iptvnator/portal/shared/util';
import { UnifiedCollectionPageComponent } from './unified-collection-page.component';

interface InlineReturnHarness {
    fixture: () => ComponentFixture<UnifiedCollectionPageComponent>;
    host: Type<{
        mode: CollectionMode;
        pageComponent?: UnifiedCollectionPageComponent;
    }>;
    favorites: { getFavorites: jest.Mock; getFavoritesStrict: jest.Mock };
    recentRead: jest.Mock;
    positionsRead: jest.Mock;
    router: { url: string };
}

/** Reuses the real mounted page/history harness for both collection modes. */
export function registerInlineDetailReturnTests(
    harness: InlineReturnHarness
): void {
    it.each(['recent', 'favorites'] as const)(
        'refreshes persisted %s cover snapshots on inline detail return without reading on open or looping',
        async (mode) => {
            harness.fixture().destroy();
            const item: UnifiedCollectionItem = {
                uid: 'xtream::portal::vod:7',
                name: 'Inline Movie',
                contentType: 'movie',
                sourceType: 'xtream',
                playlistId: 'portal',
                playlistName: 'Portal',
                xtreamId: 7,
            };
            const position = {
                contentType: 'vod',
                contentXtreamId: 7,
                playlistId: 'portal',
                positionSeconds: 40,
                durationSeconds: 100,
            };
            harness.favorites.getFavorites.mockResolvedValue([item]);
            let savedFavorites: UnifiedCollectionItem[] = [];
            harness.favorites.getFavoritesStrict.mockImplementation(
                async () => savedFavorites
            );
            harness.recentRead.mockResolvedValue([item]);
            let savedPositions = [position];
            harness.positionsRead.mockImplementation(
                async () => savedPositions
            );
            const originalUrl = harness.router.url;
            harness.router.url = `/workspace/global-${mode}`;
            const hostFixture = TestBed.createComponent(harness.host);
            hostFixture.componentInstance.mode = mode;
            try {
                hostFixture.detectChanges();
                await hostFixture.whenStable();
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                const page = hostFixture.componentInstance.pageComponent;
                expect(page?.allItems()[0].coverIndicators).toMatchObject({
                    favorite: mode === 'favorites',
                    watchState: 'in-progress',
                    progress: 40,
                });
                const reads = harness.positionsRead.mock.calls.length;
                page?.onGridItemSelected(item);
                hostFixture.detectChanges();
                await hostFixture.whenStable();
                expect(page?.selectedDetailItem()).toEqual(item);
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads);
                savedFavorites = [item];
                savedPositions = [{ ...position, positionSeconds: 100 }];
                window.history.replaceState({}, document.title);
                window.dispatchEvent(new PopStateEvent('popstate'));
                await hostFixture.whenStable();
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                hostFixture.detectChanges();
                expect(page?.selectedDetailItem()).toBeNull();
                expect(page?.allItems()[0].coverIndicators).toMatchObject({
                    favorite: true,
                    watchState: 'watched',
                    progress: 100,
                });
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads + 1);
                hostFixture.detectChanges();
                await hostFixture.whenStable();
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads + 1);
                page?.onGridItemSelected(item);
                hostFixture.detectChanges();
                await hostFixture.whenStable();
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads + 1);
                savedFavorites = [];
                savedPositions = [];
                window.history.replaceState({}, document.title);
                window.dispatchEvent(new PopStateEvent('popstate'));
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                hostFixture.detectChanges();
                expect(page?.allItems()[0].coverIndicators).toMatchObject({
                    favorite: mode === 'favorites',
                    watchState: 'unwatched',
                    progress: 0,
                });
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads + 2);
                hostFixture.destroy();
                window.dispatchEvent(new PopStateEvent('popstate'));
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                expect(harness.positionsRead).toHaveBeenCalledTimes(reads + 2);
            } finally {
                hostFixture.destroy();
                harness.router.url = originalUrl;
                harness.favorites.getFavorites
                    .mockReset()
                    .mockResolvedValue([]);
                harness.favorites.getFavoritesStrict
                    .mockReset()
                    .mockResolvedValue([]);
                harness.recentRead.mockReset().mockResolvedValue([]);
            }
        }
    );
}
