import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SavedVodEntryRowComponent } from '@iptvnator/portal/shared/ui';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { ParentalLockService } from '@iptvnator/services';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MockPipe } from 'ng-mocks';
import { Subject } from 'rxjs';
import { SavedVodPlaylistsController } from './saved-vod-playlists.controller';
import { SavedVodPlaylistsManagerComponent } from './saved-vod-playlists-manager.component';
import { SavedVodPlaylistsPageComponent } from './saved-vod-playlists-page.component';

describe('saved VOD parental gate', () => {
    let fixture: ComponentFixture<SavedVodPlaylistsPageComponent>;
    const parentalLock = {
        active: signal(false),
        initialize: jest.fn(),
        requestUnlock: jest.fn(),
    };
    const controller = {
        lists: signal([]),
        selected: signal(null),
        selectedId: signal(null),
        loadingLists: signal(false),
        loadingDetail: signal(false),
        busy: signal(false),
        notice: signal(null),
        undoClear: signal(null),
        refresh: jest.fn(),
        create: jest.fn(),
    };
    const closed = new Subject<string | undefined>();
    const close = jest.fn(() => closed.next(undefined));
    beforeEach(async () => {
        parentalLock.active.set(false);
        parentalLock.initialize.mockReset().mockResolvedValue(undefined);
        parentalLock.requestUnlock.mockReset();
        controller.refresh.mockReset();
        controller.create.mockReset();
        close.mockClear();
        await TestBed.configureTestingModule({
            imports: [SavedVodPlaylistsPageComponent],
            providers: [
                { provide: ParentalLockService, useValue: parentalLock },
                {
                    provide: MatDialog,
                    useValue: {
                        open: () => ({ close, afterClosed: () => closed }),
                    },
                },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
                provideMockStore({
                    selectors: [
                        { selector: selectAllPlaylistsMeta, value: [] },
                    ],
                }),
            ],
        })
            .overrideComponent(SavedVodPlaylistsPageComponent, {
                remove: { imports: [TranslatePipe] },
                add: {
                    imports: [MockPipe(TranslatePipe, (key: string) => key)],
                },
            })
            .overrideComponent(SavedVodPlaylistsManagerComponent, {
                set: {
                    providers: [
                        {
                            provide: SavedVodPlaylistsController,
                            useValue: controller,
                        },
                    ],
                    imports: [
                        MatButtonModule,
                        MatIconModule,
                        MatTooltipModule,
                        SavedVodEntryRowComponent,
                        MockPipe(TranslatePipe, (key: string) => key),
                    ],
                },
            })
            .compileComponents();
    });

    it('does not read or render snapshots until the lock settings are initialized', async () => {
        let resolve!: () => void;
        parentalLock.initialize.mockReturnValue(
            new Promise<void>((done) => {
                resolve = done;
            })
        );
        fixture = TestBed.createComponent(SavedVodPlaylistsPageComponent);
        fixture.detectChanges();
        expect(controller.refresh).not.toHaveBeenCalled();
        parentalLock.active.set(true);
        resolve();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(controller.refresh).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'SAVED_VOD_PLAYLISTS.LOCKED_DESCRIPTION'
        );
        expect(
            fixture.nativeElement.querySelector(
                'app-saved-vod-playlists-manager'
            )
        ).toBeNull();
    });

    it('creates the management pane after unlock and destroys its pending dialogs on relock', async () => {
        fixture = TestBed.createComponent(SavedVodPlaylistsPageComponent);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(controller.refresh).toHaveBeenCalledTimes(1);
        const manager = fixture.debugElement.children[0]
            .componentInstance as SavedVodPlaylistsManagerComponent;
        const pending = manager.name('create');
        parentalLock.active.set(true);
        fixture.detectChanges();
        await pending;
        expect(close).toHaveBeenCalledTimes(1);
        expect(controller.create).not.toHaveBeenCalled();
        expect(
            fixture.nativeElement.querySelector(
                'app-saved-vod-playlists-manager'
            )
        ).toBeNull();
    });

    it('keeps the gate closed on failed initialization and exposes retry', async () => {
        parentalLock.initialize.mockRejectedValue(new Error('unreadable'));
        fixture = TestBed.createComponent(SavedVodPlaylistsPageComponent);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(controller.refresh).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'SAVED_VOD_PLAYLISTS.LOAD_FAILED'
        );
        parentalLock.initialize.mockResolvedValue(undefined);
        await fixture.componentInstance.initialize();
        fixture.detectChanges();
        expect(controller.refresh).toHaveBeenCalledTimes(1);
    });
});
