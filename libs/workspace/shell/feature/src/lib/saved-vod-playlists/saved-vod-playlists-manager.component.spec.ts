import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { createSavedVodPlaylist } from '@iptvnator/portal/shared/util';
import {
    SavedVodPlaylistNameDialogComponent,
    SavedVodEntryRowComponent,
} from '@iptvnator/portal/shared/ui';
import type {
    SavedVodEntry,
    SavedVodPlaylist,
} from '@iptvnator/shared/interfaces';
import { ConfirmDialogComponent } from '@iptvnator/ui/components';
import { ParentalLockService } from '@iptvnator/services';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MockPipe } from 'ng-mocks';
import { Subject } from 'rxjs';
import {
    SavedVodPlaylistsController,
    type SavedVodManagerNotice,
} from './saved-vod-playlists.controller';
import { SavedVodPlaylistsManagerComponent } from './saved-vod-playlists-manager.component';

const entries: SavedVodEntry[] = ['a', 'b', 'c'].map((id, index) => ({
    id,
    title: `Film ${id}`,
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'movie',
        contentId: String(index + 1),
    },
}));
const list = () =>
    createSavedVodPlaylist('list', 'Weekend', '2026-10-04T12:00:00Z', entries);

describe('saved VOD management view', () => {
    let fixture: ComponentFixture<SavedVodPlaylistsManagerComponent>;
    let component: SavedVodPlaylistsManagerComponent;
    let closed: Subject<string | boolean | undefined>;
    const dialogs = { open: jest.fn() };
    const activeLock = signal(false);
    const controller = {
        lists: signal([{ id: 'list', name: 'Weekend', entryCount: 3 }]),
        selected: signal<SavedVodPlaylist | null>(list()),
        selectedId: signal<string | null>('list'),
        loadingLists: signal(false),
        loadingDetail: signal(false),
        busy: signal(false),
        notice: signal<SavedVodManagerNotice>(null),
        undoClear: signal<unknown>(null),
        refresh: jest.fn(),
        select: jest.fn(),
        create: jest.fn(),
        rename: jest.fn(),
        duplicate: jest.fn(),
        clear: jest.fn(),
        delete: jest.fn(),
        move: jest.fn(),
        remove: jest.fn(),
        undo: jest.fn(),
    };
    const dialogClose = jest.fn();

    beforeEach(async () => {
        activeLock.set(false);
        Object.values(controller).forEach((value) => {
            if (jest.isMockFunction(value)) value.mockReset();
        });
        controller.selected.set(list());
        controller.selectedId.set('list');
        controller.lists.set([{ id: 'list', name: 'Weekend', entryCount: 3 }]);
        controller.loadingLists.set(false);
        controller.loadingDetail.set(false);
        controller.busy.set(false);
        controller.notice.set(null);
        controller.undoClear.set(null);
        closed = new Subject();
        dialogClose
            .mockReset()
            .mockImplementation(() => closed.next(undefined));
        dialogs.open
            .mockReset()
            .mockReturnValue({ close: dialogClose, afterClosed: () => closed });
        await TestBed.configureTestingModule({
            imports: [SavedVodPlaylistsManagerComponent],
            providers: [
                { provide: MatDialog, useValue: dialogs },
                {
                    provide: ParentalLockService,
                    useValue: { active: activeLock },
                },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
                provideMockStore({
                    selectors: [
                        {
                            selector: selectAllPlaylistsMeta,
                            value: [{ _id: 'source', title: 'Home library' }],
                        },
                    ],
                }),
            ],
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
        fixture = TestBed.createComponent(SavedVodPlaylistsManagerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });
    const row = (id: string): HTMLElement =>
        fixture.nativeElement.querySelector(`[data-entry-id="${id}"]`);
    const button = (id: string, action: string): HTMLButtonElement =>
        row(id).querySelector(
            `[data-test-id="saved-vod-entry-${action}"]`
        ) as HTMLButtonElement;

    it('selects named lists and renders source names with shared occurrence controls', () => {
        fixture.nativeElement
            .querySelector('[data-test-id="saved-vod-list"]')
            .click();
        expect(controller.select).toHaveBeenCalledWith('list');
        expect(fixture.nativeElement.textContent).toContain('Home library');
        expect(button('a', 'up').disabled).toBe(true);
        expect(button('c', 'down').disabled).toBe(true);
        expect(component.sourceName('deleted-source')).toBe(
            'SAVED_VOD_PLAYLISTS.MISSING_SOURCE'
        );
    });

    it.each(['create', 'rename', 'duplicate'] as const)(
        'persists %s only after a name is accepted',
        async (action) => {
            controller[action].mockResolvedValue(false);
            const pending = component.name(action);
            expect(dialogs.open).toHaveBeenCalledWith(
                SavedVodPlaylistNameDialogComponent,
                expect.objectContaining({
                    data: expect.objectContaining({
                        actionLabel: expect.any(String),
                    }),
                })
            );
            expect(controller[action]).not.toHaveBeenCalled();
            closed.next('Friday');
            await pending;
            expect(controller[action]).toHaveBeenCalledWith('Friday');
        }
    );

    it('cancelling a name leaves storage unchanged and allows another dialog', async () => {
        const pending = component.name('create');
        closed.next(undefined);
        await pending;
        expect(controller.create).not.toHaveBeenCalled();
        const next = component.name('rename');
        closed.next(undefined);
        await next;
        expect(dialogs.open).toHaveBeenCalledTimes(2);
    });

    it.each(['clear', 'delete'] as const)(
        'requires explicit destructive confirmation to %s',
        async (action) => {
            controller[action].mockResolvedValue(false);
            const cancelled = component.confirm(action);
            closed.next(false);
            await cancelled;
            expect(controller[action]).not.toHaveBeenCalled();
            const confirmed = component.confirm(action);
            closed.next(true);
            await confirmed;
            expect(dialogs.open).toHaveBeenLastCalledWith(
                ConfirmDialogComponent,
                expect.objectContaining({
                    data: expect.objectContaining({
                        tone: 'destructive',
                        confirmLabel: `SAVED_VOD_PLAYLISTS.${action.toUpperCase()}`,
                    }),
                })
            );
            expect(controller[action]).toHaveBeenCalledTimes(1);
        }
    );

    it('ignores a dialog result after selection changes', async () => {
        const pending = component.name('rename');
        controller.selectedId.set('other');
        closed.next('Wrong list');
        await pending;
        expect(controller.rename).not.toHaveBeenCalled();
    });

    it('closes its dialog on teardown and ignores a late accepted result', async () => {
        const pending = component.name('create');
        fixture.destroy();
        closed.next('Late');
        await pending;
        expect(dialogClose).toHaveBeenCalledTimes(1);
        expect(controller.create).not.toHaveBeenCalled();
    });

    it('blocks a dialog result immediately when parental controls relock before teardown', async () => {
        const pending = component.name('rename');
        activeLock.set(true);
        closed.next('Protected name');
        await pending;
        expect(controller.rename).not.toHaveBeenCalled();
        await component.remove('b');
        expect(controller.remove).not.toHaveBeenCalled();
    });

    it('disables edits during a write and shows explicit conflict recovery', () => {
        controller.busy.set(true);
        controller.notice.set('changed-elsewhere');
        fixture.detectChanges();
        expect(button('b', 'remove').disabled).toBe(true);
        expect(
            fixture.nativeElement.querySelector(
                '[data-test-id="saved-vod-new"]'
            ).disabled
        ).toBe(true);
        expect(
            fixture.nativeElement.querySelector(
                '[data-test-id="saved-vod-notice"]'
            ).textContent
        ).toContain('SAVED_VOD_PLAYLISTS.CHANGED_ELSEWHERE');
    });

    it('shows clear Undo only while the controller considers it valid', () => {
        controller.undoClear.set({ listId: 'list', revision: 2 });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.undo')).not.toBeNull();
        controller.undoClear.set(null);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.undo')).toBeNull();
    });

    it('moves a keyboard-focused occurrence without losing its focus at a boundary', async () => {
        button('b', 'up').focus();
        controller.move.mockImplementation(async () => {
            controller.selected.set({
                ...list(),
                entries: [entries[1], entries[0], entries[2]],
            });
            return true;
        });
        await component.move({ entryId: 'b', targetIndex: 0 });
        fixture.detectChanges();
        expect(controller.move).toHaveBeenCalledWith('b', 0);
        expect(document.activeElement).toBe(button('b', 'down'));
    });

    it('restores focus to the next occurrence after removal', async () => {
        button('b', 'remove').focus();
        controller.remove.mockImplementation(async () => {
            controller.selected.set({
                ...list(),
                entries: [entries[0], entries[2]],
            });
            return true;
        });
        await component.remove('b');
        fixture.detectChanges();
        expect(document.activeElement).toBe(button('c', 'remove'));
    });

    it('does not take focus back when the user moved to another control during persistence', async () => {
        button('b', 'remove').focus();
        controller.remove.mockImplementation(async () => {
            fixture.nativeElement
                .querySelector('[data-test-id="saved-vod-new"]')
                .focus();
            return false;
        });
        await component.remove('b');
        fixture.detectChanges();
        expect(document.activeElement).toBe(
            fixture.nativeElement.querySelector(
                '[data-test-id="saved-vod-new"]'
            )
        );
    });

    it('keeps focus on the original occurrence when removal fails', async () => {
        button('b', 'remove').focus();
        controller.remove.mockResolvedValue(false);
        await component.remove('b');
        fixture.detectChanges();
        expect(document.activeElement).toBe(button('b', 'remove'));
    });

    it('does not move focus to a heading after a name save when another control gained focus', async () => {
        controller.rename.mockImplementation(async () => {
            fixture.nativeElement
                .querySelector('[data-test-id="saved-vod-new"]')
                .focus();
            return true;
        });
        const pending = component.name('rename');
        closed.next('Friday');
        await pending;
        fixture.detectChanges();
        expect(document.activeElement).toBe(
            fixture.nativeElement.querySelector(
                '[data-test-id="saved-vod-new"]'
            )
        );
    });
});
