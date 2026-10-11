import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    inject,
    Injector,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    SavedVodEntryRowComponent,
    type SavedVodEntryRowLabels,
    SavedVodPlaylistNameDialogComponent,
    type SavedVodPlaylistNameDialogData,
} from '@iptvnator/portal/shared/ui';
import {
    ConfirmDialogComponent,
    type ConfirmDialogData,
} from '@iptvnator/ui/components';
import { Store } from '@ngrx/store';
import { ParentalLockService } from '@iptvnator/services';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SavedVodPlaylistsController } from './saved-vod-playlists.controller';

type NameAction = 'create' | 'rename' | 'duplicate';
const NAME_KEYS: Record<NameAction, string> = {
    create: 'NEW',
    rename: 'RENAME',
    duplicate: 'DUPLICATE',
};

/** Mounted only after the page's parental gate; teardown closes its own dialogs. */
@Component({
    selector: 'app-saved-vod-playlists-manager',
    imports: [
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslatePipe,
        SavedVodEntryRowComponent,
    ],
    providers: [SavedVodPlaylistsController],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './saved-vod-playlists-manager.component.html',
    styleUrl: './saved-vod-playlists-manager.component.scss',
})
export class SavedVodPlaylistsManagerComponent {
    readonly controller = inject(SavedVodPlaylistsController);
    private readonly dialogs = inject(MatDialog);
    private readonly translate = inject(TranslateService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly injector = inject(Injector);
    private readonly parentalLock = inject(ParentalLockService);
    private readonly sources = inject(Store).selectSignal(
        selectAllPlaylistsMeta
    );
    private closeDialog: (() => void) | null = null;
    private disposed = false;
    readonly pending = computed(
        () =>
            this.controller.busy() ||
            this.controller.loadingLists() ||
            this.controller.loadingDetail()
    );
    readonly noticeKey = computed(() => {
        const notice = this.controller.notice();
        return notice
            ? `SAVED_VOD_PLAYLISTS.${notice.replace(/-/g, '_').toUpperCase()}`
            : null;
    });

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.disposed = true;
            this.closeDialog?.();
        });
        if (!this.parentalLock.active()) void this.controller.refresh();
    }

    sourceName(id: string): string {
        return (
            this.sources().find((source) => source._id === id)?.title ||
            this.label('MISSING_SOURCE')
        );
    }

    rowLabels(): SavedVodEntryRowLabels {
        return {
            movie: this.label('MOVIE'),
            episode: this.label('EPISODE'),
            moveUp: this.label('MOVE_UP'),
            moveDown: this.label('MOVE_DOWN'),
            remove: this.label('REMOVE_ENTRY'),
        };
    }

    async name(action: NameAction): Promise<void> {
        if (!this.canEdit() || this.closeDialog) return;
        const selected = this.controller.selected();
        if (action !== 'create' && !selected) return;
        const initialName =
            action === 'duplicate'
                ? this.label('COPY_NAME', { name: selected?.name })
                : action === 'rename'
                  ? selected?.name
                  : undefined;
        const dialog = this.dialogs.open<
            SavedVodPlaylistNameDialogComponent,
            SavedVodPlaylistNameDialogData,
            string
        >(SavedVodPlaylistNameDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            data: {
                title: this.label(NAME_KEYS[action]),
                actionLabel: this.label(NAME_KEYS[action]),
                initialName,
            },
        });
        this.closeDialog = () => dialog.close();
        const name = await firstValueFrom(dialog.afterClosed());
        this.closeDialog = null;
        if (
            !name ||
            !this.canEdit() ||
            (action !== 'create' &&
                this.controller.selectedId() !== selected?.id)
        )
            return;
        const mayRestoreFocus = this.focusGuard();
        const saved = await this.controller[action](name);
        if (saved) this.focusHeading(mayRestoreFocus);
    }

    async confirm(action: 'clear' | 'delete'): Promise<void> {
        const selected = this.controller.selected();
        if (!selected || !this.canEdit() || this.closeDialog) return;
        const key = action.toUpperCase();
        const dialog = this.dialogs.open<
            ConfirmDialogComponent,
            ConfirmDialogData,
            boolean
        >(ConfirmDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            data: {
                title: this.label(`${key}_TITLE`),
                message: this.label(`${key}_MESSAGE`, { name: selected.name }),
                confirmLabel: this.label(key),
                tone: 'destructive',
                onConfirm: () => undefined,
            },
        });
        this.closeDialog = () => dialog.close();
        const confirmed = await firstValueFrom(dialog.afterClosed());
        this.closeDialog = null;
        if (
            !confirmed ||
            !this.canEdit() ||
            this.controller.selectedId() !== selected.id
        )
            return;
        const mayRestoreFocus = this.focusGuard();
        if (await this.controller[action]()) this.focusHeading(mayRestoreFocus);
    }

    async move(event: { entryId: string; targetIndex: number }): Promise<void> {
        if (!this.canEdit()) return;
        const direction =
            this.host.nativeElement.ownerDocument.activeElement?.getAttribute(
                'data-test-id'
            );
        const mayRestoreFocus = this.focusGuard();
        await this.controller.move(event.entryId, event.targetIndex);
        this.focusAfterRender(() => {
            if (!mayRestoreFocus()) return;
            const row = this.row(event.entryId);
            const previous = Array.from(
                row?.querySelectorAll<HTMLButtonElement>('button') ?? []
            ).find(
                (button) =>
                    button.dataset['testId'] === direction && !button.disabled
            );
            (
                previous ??
                row?.querySelector<HTMLButtonElement>('button:not(:disabled)')
            )?.focus();
        });
    }

    async remove(entryId: string): Promise<void> {
        if (!this.canEdit()) return;
        const entries = this.controller.selected()?.entries ?? [];
        const index = entries.findIndex((entry) => entry.id === entryId);
        const nextId = entries[index + 1]?.id ?? entries[index - 1]?.id;
        const mayRestoreFocus = this.focusGuard();
        const removed = await this.controller.remove(entryId);
        this.focusAfterRender(() => {
            if (!mayRestoreFocus()) return;
            const next = this.row(
                removed ? (nextId ?? '') : entryId
            )?.querySelector<HTMLButtonElement>(
                '[data-test-id="saved-vod-entry-remove"]'
            );
            if (next) next.focus();
            else this.heading()?.focus();
        });
    }

    async undo(): Promise<void> {
        if (!this.canEdit()) return;
        const mayRestoreFocus = this.focusGuard();
        if (await this.controller.undo()) this.focusHeading(mayRestoreFocus);
    }

    private label(key: string, parameters?: Record<string, unknown>): string {
        return this.translate.instant(`SAVED_VOD_PLAYLISTS.${key}`, parameters);
    }
    private canEdit(): boolean {
        return !this.disposed && !this.parentalLock.active() && !this.pending();
    }
    private row(id: string): HTMLElement | undefined {
        return Array.from(
            this.host.nativeElement.querySelectorAll<HTMLElement>(
                'app-saved-vod-entry-row'
            )
        ).find((row) => row.dataset['entryId'] === id);
    }
    private heading(): HTMLElement | null {
        return this.host.nativeElement.querySelector<HTMLElement>(
            '[data-test-id="saved-vod-detail-heading"]'
        );
    }
    private focusHeading(mayRestoreFocus: () => boolean): void {
        this.focusAfterRender(() => {
            if (mayRestoreFocus()) this.heading()?.focus();
        });
    }
    private focusGuard(): () => boolean {
        const document = this.host.nativeElement.ownerDocument;
        const original = document.activeElement;
        return () =>
            document.activeElement === original ||
            document.activeElement === document.body;
    }
    private focusAfterRender(callback: () => void): void {
        if (!this.disposed)
            afterNextRender(
                () => {
                    if (!this.disposed) callback();
                },
                { injector: this.injector }
            );
    }
}
