import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ParentalLockService } from '@iptvnator/services';
import { createSavedVodPlaylist } from '@iptvnator/portal/shared/util';
import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import { SavedVodAddDialogController } from './saved-vod-add-dialog.controller';
import {
    SavedVodPlaylistsCommandsService,
    type SavedVodCandidate,
} from './saved-vod-playlists-commands.service';
import { SavedVodPlaylistsStorageService } from './saved-vod-playlists-storage.service';

const NOW = '2026-10-04T12:00:00Z';
const candidate: SavedVodCandidate = {
    title: 'Movie',
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'movie',
        contentId: '42',
    },
};
const playlist = (revision = 3): SavedVodPlaylist => ({
    ...createSavedVodPlaylist('list', 'Weekend', NOW),
    revision,
});
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

describe('saved VOD add dialog state', () => {
    const storage = { list: jest.fn(), get: jest.fn() };
    const commands = { create: jest.fn(), append: jest.fn() };
    const parental = { active: signal(false), initialize: jest.fn() };
    let state: SavedVodAddDialogController;

    beforeEach(() => {
        jest.clearAllMocks();
        parental.active.set(false);
        parental.initialize.mockResolvedValue(undefined);
        storage.list.mockResolvedValue([
            { id: 'list', name: 'Weekend', revision: 3, entryCount: 0 },
        ]);
        storage.get.mockResolvedValue(playlist());
        commands.create.mockResolvedValue({
            status: 'saved',
            playlist: {
                ...playlist(),
                id: 'new',
                entries: [{ ...candidate, id: 'entry' }],
            },
        });
        commands.append.mockResolvedValue({
            status: 'saved',
            playlist: {
                ...playlist(),
                revision: 4,
                entries: [{ ...candidate, id: 'entry' }],
            },
        });
        TestBed.configureTestingModule({
            providers: [
                SavedVodAddDialogController,
                { provide: ParentalLockService, useValue: parental },
                { provide: SavedVodPlaylistsStorageService, useValue: storage },
                {
                    provide: SavedVodPlaylistsCommandsService,
                    useValue: commands,
                },
            ],
        });
        state = TestBed.inject(SavedVodAddDialogController);
    });

    it('does not fetch or expose list names before parental initialization', async () => {
        const pending = deferred<void>();
        parental.initialize.mockReturnValue(pending.promise);
        const loading = state.initialize();
        expect(state.initialized()).toBe(false);
        expect(storage.list).not.toHaveBeenCalled();
        pending.resolve();
        await loading;
        expect(state.lists()[0].name).toBe('Weekend');
    });

    it('withholds storage reads and mutations while parental controls are locked', async () => {
        parental.active.set(true);
        await state.initialize();
        await state.select('list');
        await state.add([candidate], {
            newName: 'New',
            allowDuplicates: false,
        });
        expect(state.lists()).toEqual([]);
        expect(storage.list).not.toHaveBeenCalled();
        expect(storage.get).not.toHaveBeenCalled();
        expect(commands.create).not.toHaveBeenCalled();
    });

    it('uses the selected snapshot without re-reading immediately before append', async () => {
        await state.initialize();
        await state.select('list');
        storage.get.mockResolvedValue(playlist(8));
        expect(
            await state.add([candidate], { allowDuplicates: false })
        ).toEqual({ playlistId: 'list', addedCount: 1 });
        expect(commands.append).toHaveBeenCalledWith(
            playlist(3),
            [candidate],
            false
        );
        expect(storage.get).toHaveBeenCalledTimes(1);
    });

    it('updates the visible target name and summary to match the captured document', async () => {
        await state.initialize();
        const renamed = {
            ...playlist(8),
            name: 'Renamed elsewhere',
            entries: [{ ...candidate, id: 'existing-entry' }],
        };
        storage.get.mockResolvedValueOnce(renamed);
        await state.select('list');
        expect(state.selected()).toEqual(renamed);
        expect(state.lists()).toEqual([
            {
                id: renamed.id,
                name: renamed.name,
                revision: renamed.revision,
                entryCount: 1,
                createdAt: renamed.createdAt,
                updatedAt: renamed.updatedAt,
            },
        ]);
        await state.add([candidate], { allowDuplicates: false });
        expect(commands.append).toHaveBeenCalledWith(
            renamed,
            [candidate],
            false
        );
        expect(storage.get).toHaveBeenCalledTimes(1);
    });

    it('requires an explicit refresh and new submission after a conflict', async () => {
        await state.initialize();
        await state.select('list');
        commands.append.mockResolvedValueOnce({
            status: 'conflict',
            current: playlist(8),
        });
        await state.add([candidate], { allowDuplicates: false });
        await state.add([candidate], { allowDuplicates: false });
        expect(commands.append).toHaveBeenCalledTimes(1);
        expect(state.requiresRefresh()).toBe(true);
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.CONFLICT_REFRESH');
        storage.get.mockResolvedValue(playlist(8));
        await state.refresh();
        expect(commands.append).toHaveBeenCalledTimes(1);
        await state.add([candidate], { allowDuplicates: true });
        expect(commands.append).toHaveBeenLastCalledWith(
            playlist(8),
            [candidate],
            true
        );
    });

    it.each(['selected', 'conflict'] as const)(
        'keeps a failed summary refresh actionable and blocks a %s target until explicit reload succeeds',
        async (initialState) => {
            await state.initialize();
            await state.select('list');
            if (initialState === 'conflict') {
                commands.append.mockResolvedValueOnce({
                    status: 'conflict',
                    current: playlist(8),
                });
                await state.add([candidate], { allowDuplicates: false });
            }
            const writes = commands.append.mock.calls.length;
            storage.list.mockRejectedValueOnce(new Error('Unavailable'));
            storage.get.mockResolvedValue(playlist(8));
            await state.refresh();
            expect(storage.get).toHaveBeenCalledTimes(1);
            expect(state.loading()).toBe(false);
            expect(state.selected()).toBeNull();
            expect(state.requiresRefresh()).toBe(true);
            expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
            await state.add([candidate], { allowDuplicates: false });
            expect(commands.append).toHaveBeenCalledTimes(writes);
            expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.LOAD_FAILED');

            await state.refresh();
            expect(state.requiresRefresh()).toBe(false);
            expect(state.notice()).toBeNull();
            expect(state.selected()?.revision).toBe(8);
            expect(commands.append).toHaveBeenCalledTimes(writes);
            await state.add([candidate], { allowDuplicates: false });
            expect(commands.append).toHaveBeenLastCalledWith(
                playlist(8),
                [candidate],
                false
            );
        }
    );

    it('retains conflict blocking when summaries reload but reading the target fails', async () => {
        await state.initialize();
        await state.select('list');
        commands.append.mockResolvedValueOnce({
            status: 'conflict',
            current: playlist(8),
        });
        await state.add([candidate], { allowDuplicates: false });
        storage.get.mockRejectedValueOnce(new Error('Unavailable'));
        await state.refresh();
        expect(state.selected()).toBeNull();
        expect(state.requiresRefresh()).toBe(true);
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
        await state.add([candidate], { allowDuplicates: false });
        expect(commands.append).toHaveBeenCalledTimes(1);
        await state.refresh();
        expect(state.requiresRefresh()).toBe(false);
        expect(commands.append).toHaveBeenCalledTimes(1);
    });

    it('does not append to a removed playlist', async () => {
        await state.initialize();
        storage.get.mockResolvedValue(null);
        await state.select('list');
        await state.add([candidate], { allowDuplicates: false });
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.DELETED_ELSEWHERE');
        expect(state.lists()).toEqual([]);
        expect(commands.append).not.toHaveBeenCalled();
    });

    it('reports a failed write without closing or retrying it', async () => {
        await state.initialize();
        commands.create.mockRejectedValueOnce(new Error('Unavailable'));
        expect(
            await state.add([candidate], {
                newName: 'New list',
                allowDuplicates: false,
            })
        ).toBeNull();
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.SAVE_FAILED');
        expect(state.busy()).toBe(false);
        expect(commands.create).toHaveBeenCalledTimes(1);
    });

    it('serializes writes and holds selected state while a write is pending', async () => {
        await state.initialize();
        await state.select('list');
        const pending =
            deferred<
                Awaited<ReturnType<SavedVodPlaylistsCommandsService['append']>>
            >();
        commands.append.mockReturnValueOnce(pending.promise);
        const saving = state.add([candidate], { allowDuplicates: false });
        await state.select('another');
        await state.add([candidate], { allowDuplicates: true });
        expect(state.selectedId()).toBe('list');
        expect(commands.append).toHaveBeenCalledTimes(1);
        pending.resolve({ status: 'unchanged', playlist: playlist() });
        expect(await saving).toEqual({ playlistId: 'list', addedCount: 0 });
    });

    it('drops disposed read results and clears already-exposed names', async () => {
        await state.initialize();
        const pending = deferred<SavedVodPlaylist | null>();
        storage.get.mockReturnValueOnce(pending.promise);
        const selecting = state.select('list');
        state.dispose();
        pending.resolve(playlist());
        await selecting;
        expect(state.lists()).toEqual([]);
        expect(state.selected()).toBeNull();
    });

    it('does not deliver a completed save after cancellation or relock', async () => {
        await state.initialize();
        const pending =
            deferred<
                Awaited<ReturnType<SavedVodPlaylistsCommandsService['create']>>
            >();
        commands.create.mockReturnValueOnce(pending.promise);
        const saving = state.add([candidate], {
            newName: 'New',
            allowDuplicates: false,
        });
        state.dispose();
        parental.active.set(true);
        pending.resolve({ status: 'saved', playlist: playlist() });
        expect(await saving).toBeNull();
        expect(state.notice()).toBeNull();
    });

    it('drops a stale selection response after the target changes', async () => {
        await state.initialize();
        const pending = deferred<SavedVodPlaylist | null>();
        storage.get
            .mockReturnValueOnce(pending.promise)
            .mockResolvedValueOnce({ ...playlist(), id: 'second' });
        const first = state.select('list');
        await state.select('second');
        pending.resolve(playlist());
        await first;
        expect(state.selected()?.id).toBe('second');
    });

    it.each(['resolve', 'reject'] as const)(
        'invalidates a pending target read when cleared, even if the old read later %ss',
        async (completion) => {
            await state.initialize();
            const pending = deferred<SavedVodPlaylist | null>();
            storage.get.mockReturnValueOnce(pending.promise);
            const selecting = state.select('list');
            expect(state.loading()).toBe(true);
            await state.select('');
            expect(state.selectedId()).toBe('');
            expect(state.selected()).toBeNull();
            expect(state.loading()).toBe(false);
            if (completion === 'resolve') pending.resolve(playlist());
            else pending.reject(new Error('Unavailable'));
            await selecting;
            expect(state.selectedId()).toBe('');
            expect(state.selected()).toBeNull();
            expect(state.loading()).toBe(false);
            expect(state.notice()).toBeNull();
            expect(commands.append).not.toHaveBeenCalled();
        }
    );

    it('supports deliberate retry after a failed list load without writing', async () => {
        storage.list.mockRejectedValueOnce(new Error('Unavailable'));
        await state.initialize();
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
        expect(state.loading()).toBe(false);
        await state.refresh();
        expect(state.notice()).toBeNull();
        expect(state.lists()[0].name).toBe('Weekend');
        expect(commands.create).not.toHaveBeenCalled();
        expect(commands.append).not.toHaveBeenCalled();
    });

    it('blocks append when loading the captured target failed', async () => {
        await state.initialize();
        storage.get.mockRejectedValueOnce(new Error('Unavailable'));
        await state.select('list');
        await state.add([candidate], { allowDuplicates: false });
        expect(state.notice()).toBe('SAVED_VOD_PLAYLISTS.LOAD_FAILED');
        expect(commands.append).not.toHaveBeenCalled();
        await state.refresh();
        expect(state.selected()?.revision).toBe(3);
    });

    it('does not report completion after parental controls relock during saving', async () => {
        await state.initialize();
        const pending =
            deferred<
                Awaited<ReturnType<SavedVodPlaylistsCommandsService['create']>>
            >();
        commands.create.mockReturnValueOnce(pending.promise);
        const saving = state.add([candidate], {
            newName: 'New',
            allowDuplicates: false,
        });
        parental.active.set(true);
        pending.resolve({ status: 'saved', playlist: playlist() });
        expect(await saving).toBeNull();
        expect(state.notice()).toBeNull();
    });
});
