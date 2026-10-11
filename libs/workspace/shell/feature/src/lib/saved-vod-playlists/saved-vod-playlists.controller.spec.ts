import { TestBed } from '@angular/core/testing';
import {
    SavedVodPlaylistsCommandsService,
    SavedVodPlaylistsStorageService,
} from '@iptvnator/portal/shared/data-access';
import {
    createSavedVodPlaylist,
    startSavedVodExecution,
} from '@iptvnator/portal/shared/util';
import type {
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';
import { SavedVodPlaylistsController } from './saved-vod-playlists.controller';

const NOW = '2026-10-04T12:00:00Z';
const list = (id = 'a') =>
    createSavedVodPlaylist(id, `List ${id}`, NOW, [
        {
            id: `entry-${id}`,
            title: 'Movie',
            reference: {
                provider: 'xtream',
                sourceId: 'source',
                kind: 'movie',
                contentId: '42',
            },
        },
    ]);
const summary = (document: SavedVodPlaylist): SavedVodPlaylistSummary => ({
    id: document.id,
    name: document.name,
    revision: document.revision,
    entryCount: document.entries.length,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
});
function deferred<T>() {
    let resolve: (result: T) => void = () => undefined;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

describe('saved VOD management pane state', () => {
    let controller: SavedVodPlaylistsController;
    const storage = { list: jest.fn(), get: jest.fn() };
    const commands = {
        create: jest.fn(),
        duplicate: jest.fn(),
        rename: jest.fn(),
        move: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn(),
        restoreEntries: jest.fn(),
        delete: jest.fn(),
    };
    beforeEach(() => {
        Object.values(storage).forEach((mock) => mock.mockReset());
        Object.values(commands).forEach((mock) => mock.mockReset());
        storage.list.mockResolvedValue([summary(list())]);
        storage.get.mockImplementation(async (id: string) => list(id));
        TestBed.configureTestingModule({
            providers: [
                SavedVodPlaylistsController,
                { provide: SavedVodPlaylistsStorageService, useValue: storage },
                {
                    provide: SavedVodPlaylistsCommandsService,
                    useValue: commands,
                },
            ],
        });
        controller = TestBed.inject(SavedVodPlaylistsController);
    });

    it('ignores late selection loads from a previously selected list', async () => {
        const older = deferred<SavedVodPlaylist>();
        storage.get.mockImplementation((id: string) =>
            id === 'a' ? older.promise : Promise.resolve(list(id))
        );
        const first = controller.select('a');
        await controller.select('b');
        older.resolve(list('a'));
        await first;
        expect(controller.selected()?.id).toBe('b');
        expect(controller.loadingDetail()).toBe(false);
    });

    it('keeps the latest refresh authoritative and orders timestamps with or without milliseconds', async () => {
        const older = deferred<SavedVodPlaylistSummary[]>();
        storage.get.mockImplementation(async (id: string) =>
            id === 'b'
                ? { ...list('b'), updatedAt: '2026-10-04T12:00:00.001Z' }
                : list(id)
        );
        storage.list.mockReturnValueOnce(older.promise).mockResolvedValueOnce([
            summary(list('a')),
            summary({
                ...list('b'),
                updatedAt: '2026-10-04T12:00:00.001Z',
            }),
        ]);
        const first = controller.refresh();
        await controller.refresh();
        older.resolve([summary(list('obsolete'))]);
        await first;
        expect(controller.lists().map((item) => item.id)).toEqual(['b', 'a']);
        expect(controller.selected()?.id).toBe('b');
        expect(controller.loadingLists()).toBe(false);
    });

    it('serializes writes and holds selection while a mutation is pending', async () => {
        await controller.refresh();
        const pending = deferred<SavedVodWriteResult>();
        commands.rename.mockReturnValue(pending.promise);
        const save = controller.rename('Renamed');
        expect(controller.busy()).toBe(true);
        await expect(controller.rename('Second edit')).resolves.toBe(false);
        await controller.select('b');
        expect(controller.selected()?.id).toBe('a');
        pending.resolve({
            status: 'saved',
            playlist: { ...list(), revision: 2, name: 'Renamed' },
        });
        await expect(save).resolves.toBe(true);
        expect(commands.rename).toHaveBeenCalledTimes(1);
        expect(controller.lists()[0].name).toBe('Renamed');
        expect(controller.busy()).toBe(false);
    });

    it('shows current content on a conflict without pretending the edit succeeded', async () => {
        await controller.refresh();
        const current = { ...list(), revision: 3, name: 'Another window' };
        commands.rename.mockResolvedValue({ status: 'conflict', current });
        await expect(controller.rename('My edit')).resolves.toBe(false);
        expect(controller.selected()).toBe(current);
        expect(controller.notice()).toBe('changed-elsewhere');
        expect(controller.lists()[0].revision).toBe(3);
        expect(controller.undoClear()).toBeNull();
    });

    it('restores Clear only against the saved revision and retains the run snapshot', async () => {
        const original = list();
        const running = {
            ...original,
            execution: startSavedVodExecution(original, {
                id: 'run',
                updatedAt: NOW,
            }),
        };
        storage.get.mockResolvedValue(running);
        await controller.refresh();
        const cleared = { ...running, entries: [], revision: 2 };
        commands.clear.mockResolvedValue({
            status: 'saved',
            playlist: cleared,
        });
        await controller.clear();
        expect(controller.undoClear()?.revision).toBe(2);
        commands.restoreEntries.mockResolvedValue({
            status: 'saved',
            playlist: { ...running, revision: 3 },
        });
        await expect(controller.undo()).resolves.toBe(true);
        expect(commands.restoreEntries).toHaveBeenCalledWith(
            cleared,
            running.entries
        );
        expect(controller.selected()?.execution).toBe(running.execution);
        expect(controller.undoClear()).toBeNull();
        await expect(controller.undo()).resolves.toBe(false);
    });

    it('clears an Undo slot when another window deleted the list', async () => {
        await controller.refresh();
        commands.clear.mockResolvedValue({
            status: 'saved',
            playlist: { ...list(), revision: 2, entries: [] },
        });
        await controller.clear();
        commands.restoreEntries.mockResolvedValue({
            status: 'conflict',
            current: null,
        });
        await expect(controller.undo()).resolves.toBe(false);
        expect(controller.selected()).toBeNull();
        expect(controller.lists()).toEqual([]);
        expect(controller.notice()).toBe('deleted-elsewhere');
        expect(controller.undoClear()).toBeNull();
    });

    it('retains content on a write failure and releases the busy state', async () => {
        await controller.refresh();
        const original = controller.selected();
        commands.remove.mockRejectedValue(new Error('Storage failure'));
        await expect(controller.remove('entry-a')).resolves.toBe(false);
        expect(controller.selected()).toBe(original);
        expect(controller.notice()).toBe('save-failed');
        expect(controller.busy()).toBe(false);
    });

    it('selects a created list only after persistence succeeds', async () => {
        await controller.refresh();
        const created = list('new');
        commands.create.mockResolvedValue({
            status: 'saved',
            playlist: created,
        });
        await expect(controller.create('List new')).resolves.toBe(true);
        expect(controller.selected()).toBe(created);
        expect(controller.lists().map((item) => item.id)).toEqual(['a', 'new']);
        expect(controller.undoClear()).toBeNull();
    });

    it('updates sidebar metadata when selection reads a newer stored document', async () => {
        const current = { ...list(), revision: 8, name: 'Renamed elsewhere' };
        storage.get.mockResolvedValue(current);
        await controller.refresh();
        expect(controller.selected()).toBe(current);
        expect(controller.lists()[0]).toMatchObject({
            revision: 8,
            name: current.name,
        });
    });

    it('selects the next remaining list after confirmed deletion', async () => {
        storage.list.mockResolvedValue([
            summary(list('a')),
            summary(list('b')),
        ]);
        await controller.refresh();
        commands.delete.mockResolvedValue({ status: 'deleted' });
        await expect(controller.delete()).resolves.toBe(true);
        expect(controller.lists().map((item) => item.id)).toEqual(['b']);
        expect(controller.selected()?.id).toBe('b');
        expect(controller.busy()).toBe(false);
        expect(controller.loadingDetail()).toBe(false);
    });

    it('ignores a response after the management pane is destroyed', async () => {
        const pending = deferred<SavedVodPlaylist>();
        storage.get.mockReturnValue(pending.promise);
        const load = controller.select('a');
        TestBed.resetTestingModule();
        pending.resolve(list());
        await load;
        expect(controller.selected()).toBeNull();
    });
});
