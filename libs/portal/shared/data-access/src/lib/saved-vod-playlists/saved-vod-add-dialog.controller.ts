import {
    DestroyRef,
    computed,
    inject,
    Injectable,
    signal,
} from '@angular/core';
import { ParentalLockService } from '@iptvnator/services';
import type {
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
} from '@iptvnator/shared/interfaces';
import {
    SavedVodPlaylistsCommandsService,
    type SavedVodCandidate,
    type SavedVodEditResult,
} from './saved-vod-playlists-commands.service';
import { SavedVodPlaylistsStorageService } from './saved-vod-playlists-storage.service';

export interface SavedVodAddResult {
    readonly playlistId: string;
    readonly addedCount: number;
}

/** Disposal ignores late results; an already-submitted atomic write may finish. */
@Injectable()
export class SavedVodAddDialogController {
    readonly parentalLock = inject(ParentalLockService);
    private readonly storage = inject(SavedVodPlaylistsStorageService);
    private readonly commands = inject(SavedVodPlaylistsCommandsService);
    private alive = true;
    private generation = 0;

    readonly initialized = signal(false);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly lists = signal<readonly SavedVodPlaylistSummary[]>([]);
    readonly selectedId = signal('');
    readonly selected = signal<SavedVodPlaylist | null>(null);
    readonly notice = signal<string | null>(null);
    readonly requiresRefresh = signal(false);
    readonly canRead = computed(
        () => this.initialized() && !this.parentalLock.active()
    );

    constructor() {
        inject(DestroyRef).onDestroy(() => this.dispose());
    }

    async initialize(): Promise<boolean> {
        if (!this.alive || this.loading() || this.busy()) return false;
        this.loading.set(true);
        this.notice.set(null);
        const generation = ++this.generation;
        try {
            await this.parentalLock.initialize();
            if (!this.alive || generation !== this.generation) return false;
            this.initialized.set(true);
            if (this.parentalLock.active()) return false;
            const lists = await this.storage.list();
            if (!this.current(generation)) return false;
            this.lists.set(lists);
            return true;
        } catch {
            if (this.alive && generation === this.generation) {
                this.notice.set('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
            }
            return false;
        } finally {
            if (this.alive && generation === this.generation)
                this.loading.set(false);
        }
    }

    async select(id: string): Promise<void> {
        if (!this.canAct()) return;
        const generation = ++this.generation;
        this.selectedId.set(id);
        this.selected.set(null);
        this.notice.set(null);
        if (!id) {
            this.requiresRefresh.set(false);
            this.loading.set(false);
            return;
        }
        this.loading.set(true);
        try {
            const selected = await this.storage.get(id);
            if (!this.current(generation)) return;
            this.selected.set(selected);
            if (selected) {
                this.requiresRefresh.set(false);
                this.upsertSummary(selected);
            } else {
                this.requiresRefresh.set(true);
                this.notice.set('SAVED_VOD_PLAYLISTS.DELETED_ELSEWHERE');
                this.lists.update((lists) =>
                    lists.filter((list) => list.id !== id)
                );
            }
        } catch {
            if (this.current(generation)) {
                this.requiresRefresh.set(true);
                this.notice.set('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
            }
        } finally {
            if (this.alive && generation === this.generation)
                this.loading.set(false);
        }
    }

    /** Explicit read after a conflict; never retry the rejected write automatically. */
    async refresh(): Promise<void> {
        if (!this.canAct() || this.loading()) return;
        const selectedId = this.selectedId();
        this.selected.set(null);
        this.requiresRefresh.set(Boolean(selectedId));
        const loaded = await this.initialize();
        if (loaded && this.canAct() && selectedId)
            await this.select(selectedId);
    }

    async add(
        candidates: readonly SavedVodCandidate[],
        options: {
            readonly newName?: string;
            readonly allowDuplicates: boolean;
        }
    ): Promise<SavedVodAddResult | null> {
        if (!this.canAct() || this.loading() || candidates.length === 0)
            return null;
        const original = this.selected();
        if (
            options.newName === undefined &&
            (!original || this.requiresRefresh())
        )
            return null;
        this.busy.set(true);
        this.notice.set(null);
        try {
            let result: SavedVodEditResult;
            if (options.newName !== undefined) {
                result = await this.commands.create(
                    options.newName,
                    candidates,
                    options.allowDuplicates
                );
            } else if (original) {
                result = await this.commands.append(
                    original,
                    candidates,
                    options.allowDuplicates
                );
            } else {
                return null;
            }
            if (!this.canRead() || !this.alive) return null;
            if (result.status === 'conflict') {
                this.selected.set(null);
                this.requiresRefresh.set(options.newName === undefined);
                this.notice.set(
                    options.newName !== undefined
                        ? 'SAVED_VOD_PLAYLISTS.SAVE_FAILED'
                        : result.current
                          ? 'SAVED_VOD_PLAYLISTS.CONFLICT_REFRESH'
                          : 'SAVED_VOD_PLAYLISTS.DELETED_ELSEWHERE'
                );
                return null;
            }
            return {
                playlistId: result.playlist.id,
                addedCount:
                    result.playlist.entries.length -
                    (options.newName === undefined
                        ? (original?.entries.length ?? 0)
                        : 0),
            };
        } catch {
            if (this.alive && this.canRead())
                this.notice.set('SAVED_VOD_PLAYLISTS.SAVE_FAILED');
            return null;
        } finally {
            if (this.alive) this.busy.set(false);
        }
    }

    dispose(): void {
        this.alive = false;
        ++this.generation;
        this.selected.set(null);
        this.lists.set([]);
    }

    private canAct(): boolean {
        return this.alive && this.canRead() && !this.busy();
    }

    private upsertSummary(playlist: SavedVodPlaylist): void {
        const summary: SavedVodPlaylistSummary = {
            id: playlist.id,
            name: playlist.name,
            revision: playlist.revision,
            entryCount: playlist.entries.length,
            createdAt: playlist.createdAt,
            updatedAt: playlist.updatedAt,
        };
        this.lists.update((lists) =>
            lists.some((list) => list.id === summary.id)
                ? lists.map((list) => (list.id === summary.id ? summary : list))
                : [...lists, summary]
        );
    }

    private current(generation: number): boolean {
        return this.alive && this.canRead() && generation === this.generation;
    }
}
