import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
    SavedVodPlaylistsCommandsService,
    SavedVodPlaylistsStorageService,
    type SavedVodEditResult,
} from '@iptvnator/portal/shared/data-access';
import type {
    SavedVodDeleteResult,
    SavedVodEntry,
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
} from '@iptvnator/shared/interfaces';

export type SavedVodManagerNotice =
    | 'load-failed'
    | 'save-failed'
    | 'changed-elsewhere'
    | 'deleted-elsewhere'
    | null;
type UndoClear = {
    listId: string;
    revision: number;
    entries: readonly SavedVodEntry[];
};

/** One instance per management pane; persistence commands remain stateless. */
@Injectable()
export class SavedVodPlaylistsController {
    private readonly storage = inject(SavedVodPlaylistsStorageService);
    private readonly commands = inject(SavedVodPlaylistsCommandsService);
    private readonly listsState = signal<SavedVodPlaylistSummary[]>([]);
    private readonly selectedState = signal<SavedVodPlaylist | null>(null);
    private readonly selectedIdState = signal<string | null>(null);
    private readonly loadingListsState = signal(false);
    private readonly loadingDetailState = signal(false);
    private readonly busyState = signal(false);
    private readonly noticeState = signal<SavedVodManagerNotice>(null);
    private readonly undoState = signal<UndoClear | null>(null);
    private listRead = 0;
    private detailRead = 0;
    private disposed = false;

    readonly lists = this.listsState.asReadonly();
    readonly selected = this.selectedState.asReadonly();
    readonly selectedId = this.selectedIdState.asReadonly();
    readonly loadingLists = this.loadingListsState.asReadonly();
    readonly loadingDetail = this.loadingDetailState.asReadonly();
    readonly busy = this.busyState.asReadonly();
    readonly notice = this.noticeState.asReadonly();
    readonly undoClear = this.undoState.asReadonly();

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.disposed = true;
            this.listRead++;
            this.detailRead++;
        });
    }

    async refresh(): Promise<void> {
        if (this.busy() || this.disposed) return;
        const request = ++this.listRead;
        this.loadingListsState.set(true);
        this.noticeState.set(null);
        try {
            const lists = await this.storage.list();
            if (this.disposed || request !== this.listRead) return;
            this.listsState.set(this.sorted(lists));
            const selectedId = this.selectedId();
            await this.select(
                lists.some((list) => list.id === selectedId)
                    ? selectedId
                    : (this.lists()[0]?.id ?? null)
            );
        } catch {
            if (!this.disposed && request === this.listRead) {
                this.noticeState.set('load-failed');
            }
        } finally {
            if (!this.disposed && request === this.listRead) {
                this.loadingListsState.set(false);
            }
        }
    }

    async select(id: string | null): Promise<void> {
        if (this.busy() || this.disposed) return;
        const request = ++this.detailRead;
        this.selectedIdState.set(id);
        this.selectedState.set(null);
        this.undoState.set(null);
        this.noticeState.set(null);
        this.loadingDetailState.set(id !== null);
        if (id === null) return;
        try {
            const document = await this.storage.get(id);
            if (this.disposed || request !== this.detailRead) return;
            this.selectedState.set(document);
            if (document) {
                this.upsertSummary(document);
            } else {
                this.dropSummary(id);
                this.noticeState.set('deleted-elsewhere');
            }
        } catch {
            if (!this.disposed && request === this.detailRead) {
                this.noticeState.set('load-failed');
            }
        } finally {
            if (!this.disposed && request === this.detailRead) {
                this.loadingDetailState.set(false);
            }
        }
    }

    create(name: string): Promise<boolean> {
        return this.write(() => this.commands.create(name), null, true);
    }
    duplicate(name: string): Promise<boolean> {
        const document = this.selected();
        return document
            ? this.write(
                  () => this.commands.duplicate(document, name),
                  null,
                  true
              )
            : Promise.resolve(false);
    }
    rename(name: string): Promise<boolean> {
        return this.edit((document) => this.commands.rename(document, name));
    }
    move(entryId: string, targetIndex: number): Promise<boolean> {
        return this.edit((document) =>
            this.commands.move(document, entryId, targetIndex)
        );
    }
    remove(entryId: string): Promise<boolean> {
        return this.edit((document) =>
            this.commands.remove(document, new Set([entryId]))
        );
    }
    clear(): Promise<boolean> {
        const document = this.selected();
        return document
            ? this.write(
                  () => this.commands.clear(document),
                  document.id,
                  false,
                  document.entries
              )
            : Promise.resolve(false);
    }
    undo(): Promise<boolean> {
        const previous = this.undoClear();
        const document = this.selected();
        if (
            !previous ||
            !document ||
            previous.listId !== document.id ||
            previous.revision !== document.revision
        ) {
            this.undoState.set(null);
            return Promise.resolve(false);
        }
        return this.write(
            () => this.commands.restoreEntries(document, previous.entries),
            document.id
        );
    }
    async delete(): Promise<boolean> {
        const document = this.selected();
        if (!document) return false;
        const deleted = await this.write(
            () => this.commands.delete(document),
            document.id
        );
        if (deleted) await this.select(this.lists()[0]?.id ?? null);
        return deleted;
    }

    private edit(
        operation: (document: SavedVodPlaylist) => Promise<SavedVodEditResult>
    ) {
        const document = this.selected();
        return document
            ? this.write(() => operation(document), document.id)
            : Promise.resolve(false);
    }

    private async write(
        operation: () => Promise<SavedVodEditResult | SavedVodDeleteResult>,
        targetId: string | null,
        selectSaved = false,
        undoEntries?: readonly SavedVodEntry[]
    ): Promise<boolean> {
        if (
            this.busy() ||
            this.loadingLists() ||
            this.loadingDetail() ||
            this.disposed
        )
            return false;
        this.busyState.set(true);
        this.noticeState.set(null);
        this.undoState.set(null);
        this.listRead++;
        this.detailRead++;
        try {
            const result = await operation();
            if (this.disposed) return false;
            if (result.status === 'conflict') {
                if (result.current) {
                    this.upsertSummary(result.current);
                    if (this.selectedId() === result.current.id)
                        this.selectedState.set(result.current);
                    this.noticeState.set('changed-elsewhere');
                } else {
                    if (targetId) this.dropSummary(targetId);
                    if (this.selectedId() === targetId)
                        this.selectedState.set(null);
                    this.noticeState.set('deleted-elsewhere');
                }
                return false;
            }
            if (result.status === 'deleted') {
                if (targetId) this.dropSummary(targetId);
                this.selectedState.set(null);
                this.selectedIdState.set(null);
                return true;
            }
            this.upsertSummary(result.playlist);
            if (selectSaved || this.selectedId() === result.playlist.id) {
                this.selectedIdState.set(result.playlist.id);
                this.selectedState.set(result.playlist);
            }
            if (result.status === 'saved' && undoEntries?.length) {
                this.undoState.set({
                    listId: result.playlist.id,
                    revision: result.playlist.revision,
                    entries: undoEntries,
                });
            }
            return true;
        } catch {
            if (!this.disposed) this.noticeState.set('save-failed');
            return false;
        } finally {
            if (!this.disposed) this.busyState.set(false);
        }
    }

    private upsertSummary(document: SavedVodPlaylist): void {
        const summary: SavedVodPlaylistSummary = {
            id: document.id,
            name: document.name,
            revision: document.revision,
            entryCount: document.entries.length,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        };
        this.listsState.update((lists) =>
            this.sorted([
                ...lists.filter((list) => list.id !== document.id),
                summary,
            ])
        );
    }
    private dropSummary(id: string): void {
        this.listsState.update((lists) =>
            lists.filter((list) => list.id !== id)
        );
    }
    private sorted(
        lists: readonly SavedVodPlaylistSummary[]
    ): SavedVodPlaylistSummary[] {
        return [...lists].sort(
            (a, b) =>
                Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id)
        );
    }
}
