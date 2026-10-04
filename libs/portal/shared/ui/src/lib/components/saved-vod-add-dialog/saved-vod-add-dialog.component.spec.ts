import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
    SavedVodAddDialogController,
    type SavedVodAddResult,
    type SavedVodCandidate,
} from '@iptvnator/portal/shared/data-access';
import { createSavedVodPlaylist } from '@iptvnator/portal/shared/util';
import { TranslatePipe } from '@ngx-translate/core';
import { MockPipe } from 'ng-mocks';
import { Subject } from 'rxjs';
import { SavedVodAddDialogComponent } from './saved-vod-add-dialog.component';

const candidate: SavedVodCandidate = {
    title: 'Movie',
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'movie',
        contentId: '42',
    },
};
const result: SavedVodAddResult = { playlistId: 'new', addedCount: 1 };

describe('shared add-to-saved-list dialog', () => {
    let fixture: ComponentFixture<SavedVodAddDialogComponent>;
    let state: {
        initialized: ReturnType<typeof signal<boolean>>;
        loading: ReturnType<typeof signal<boolean>>;
        busy: ReturnType<typeof signal<boolean>>;
        notice: ReturnType<typeof signal<string | null>>;
        requiresRefresh: ReturnType<typeof signal<boolean>>;
        selectedId: ReturnType<typeof signal<string>>;
        selected: ReturnType<
            typeof signal<ReturnType<typeof createSavedVodPlaylist> | null>
        >;
        lists: ReturnType<
            typeof signal<readonly { id: string; name: string }[]>
        >;
        canRead: ReturnType<typeof computed<boolean>>;
        parentalLock: {
            active: ReturnType<typeof signal<boolean>>;
            requestUnlock: jest.Mock;
        };
        initialize: jest.Mock;
        select: jest.Mock;
        refresh: jest.Mock;
        add: jest.Mock;
        dispose: jest.Mock;
    };
    const close = jest.fn();
    let closing: Subject<unknown>;

    beforeEach(async () => {
        close.mockReset();
        closing = new Subject();
        const initialized = signal(true);
        const active = signal(false);
        state = {
            initialized,
            loading: signal(false),
            busy: signal(false),
            notice: signal(null),
            requiresRefresh: signal(false),
            selectedId: signal(''),
            selected: signal(null),
            lists: signal([]),
            canRead: computed(() => initialized() && !active()),
            parentalLock: {
                active,
                requestUnlock: jest.fn().mockResolvedValue(true),
            },
            initialize: jest.fn().mockResolvedValue(undefined),
            select: jest.fn(),
            refresh: jest.fn(),
            add: jest.fn().mockResolvedValue(result),
            dispose: jest.fn(),
        };
        await TestBed.configureTestingModule({
            imports: [SavedVodAddDialogComponent, NoopAnimationsModule],
            providers: [
                {
                    provide: MAT_DIALOG_DATA,
                    useValue: { candidates: [candidate] },
                },
                {
                    provide: MatDialogRef,
                    useValue: {
                        close,
                        beforeClosed: () => closing.asObservable(),
                    },
                },
            ],
        })
            .overrideComponent(SavedVodAddDialogComponent, {
                set: {
                    providers: [
                        {
                            provide: SavedVodAddDialogController,
                            useValue: state,
                        },
                    ],
                },
            })
            .overrideComponent(SavedVodAddDialogComponent, {
                remove: { imports: [TranslatePipe] },
                add: {
                    imports: [MockPipe(TranslatePipe, (key: string) => key)],
                },
            })
            .compileComponents();
        fixture = TestBed.createComponent(SavedVodAddDialogComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });

    it('validates a new name and submits the populated request through the rendered form', async () => {
        const input: HTMLInputElement = fixture.nativeElement.querySelector(
            '[data-test-id="saved-vod-add-name"]'
        );
        const save: HTMLButtonElement = fixture.nativeElement.querySelector(
            '[data-test-id="saved-vod-add-save"]'
        );
        expect(save.disabled).toBe(true);
        input.value = '  Film night  ';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(save.disabled).toBe(false);
        fixture.nativeElement
            .querySelector('form')
            .dispatchEvent(new Event('submit', { cancelable: true }));
        await fixture.whenStable();
        expect(state.add).toHaveBeenCalledWith([candidate], {
            newName: 'Film night',
            allowDuplicates: false,
        });
        expect(close).toHaveBeenCalledWith(result);
    });

    it('defaults to deduplication and permits an explicit duplicate choice', async () => {
        const input: HTMLInputElement = fixture.nativeElement.querySelector(
            '[data-test-id="saved-vod-add-duplicates"] input'
        );
        expect(input.checked).toBe(false);
        input.click();
        fixture.componentInstance.name.setValue('New list');
        fixture.detectChanges();
        await fixture.componentInstance.submit();
        expect(state.add).toHaveBeenCalledWith([candidate], {
            newName: 'New list',
            allowDuplicates: true,
        });
    });

    it('shows the captured entry count and blocks saving after a conflict', () => {
        state.lists.set([{ id: 'list', name: 'Weekend' }]);
        fixture.componentInstance.mode.set('existing');
        state.selectedId.set('list');
        state.selected.set(
            createSavedVodPlaylist('list', 'Weekend', '2026-10-04T12:00:00Z')
        );
        fixture.detectChanges();
        const save: HTMLButtonElement = fixture.nativeElement.querySelector(
            '[data-test-id="saved-vod-add-save"]'
        );
        expect(save.disabled).toBe(false);
        state.selected.set(null);
        state.requiresRefresh.set(true);
        state.notice.set('SAVED_VOD_PLAYLISTS.CONFLICT_REFRESH');
        fixture.detectChanges();
        expect(save.disabled).toBe(true);
        fixture.nativeElement
            .querySelector('[data-test-id="saved-vod-add-refresh"]')
            .click();
        expect(state.refresh).toHaveBeenCalledTimes(1);
        expect(state.add).not.toHaveBeenCalled();
    });

    it('withholds form content during initialization and closes on relock', () => {
        state.initialized.set(false);
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('mat-radio-group')
        ).toBeNull();
        state.parentalLock.active.set(true);
        state.initialized.set(true);
        fixture.detectChanges();
        // This instance was already exposed while unlocked: relock closes it.
        expect(close).toHaveBeenCalledWith();
        expect(state.dispose).toHaveBeenCalledTimes(1);
    });

    it('opens a locked gate without exposing stored list names', () => {
        fixture.destroy();
        close.mockClear();
        state.dispose.mockClear();
        state.parentalLock.active.set(true);
        state.lists.set([{ id: 'protected', name: 'Protected list title' }]);
        fixture = TestBed.createComponent(SavedVodAddDialogComponent);
        fixture.detectChanges();
        expect(close).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).not.toContain(
            'Protected list title'
        );
        expect(
            fixture.nativeElement.querySelector('mat-radio-group')
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector(
                '[data-test-id="saved-vod-add-save"]'
            )
        ).toBeNull();
    });

    it('ignores a successful save completing after Cancel', async () => {
        let resolve!: (value: SavedVodAddResult) => void;
        state.add.mockReturnValue(
            new Promise<SavedVodAddResult>((done) => {
                resolve = done;
            })
        );
        fixture.componentInstance.name.setValue('New');
        const saving = fixture.componentInstance.submit();
        fixture.componentInstance.cancel();
        resolve(result);
        await saving;
        expect(close).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledWith();
        expect(state.dispose).toHaveBeenCalledTimes(1);
    });

    it('disables duplicate selection during a pending write', () => {
        state.busy.set(true);
        fixture.detectChanges();
        expect(fixture.componentInstance.duplicates.disabled).toBe(true);
        state.busy.set(false);
        fixture.detectChanges();
        expect(fixture.componentInstance.duplicates.disabled).toBe(false);
    });

    it('does not replace a backdrop or Escape cancellation with a late saved result', async () => {
        let resolve!: (value: SavedVodAddResult) => void;
        state.add.mockReturnValue(
            new Promise<SavedVodAddResult>((done) => {
                resolve = done;
            })
        );
        fixture.componentInstance.name.setValue('New');
        const saving = fixture.componentInstance.submit();
        closing.next(undefined);
        resolve(result);
        await saving;
        expect(close).not.toHaveBeenCalled();
        expect(state.dispose).toHaveBeenCalledTimes(1);
    });

    it('submits an existing target even though the unused new-name field is invalid', async () => {
        fixture.componentInstance.mode.set('existing');
        state.selectedId.set('list');
        state.selected.set(
            createSavedVodPlaylist('list', 'Weekend', '2026-10-04T12:00:00Z')
        );
        fixture.detectChanges();
        expect(fixture.componentInstance.name.invalid).toBe(true);
        const save: HTMLButtonElement = fixture.nativeElement.querySelector(
            '[data-test-id="saved-vod-add-save"]'
        );
        expect(save.disabled).toBe(false);
        fixture.nativeElement
            .querySelector('form')
            .dispatchEvent(new Event('submit', { cancelable: true }));
        await fixture.whenStable();
        expect(state.add).toHaveBeenCalledWith([candidate], {
            allowDuplicates: false,
        });
        expect(close).toHaveBeenCalledWith(result);
    });
});
