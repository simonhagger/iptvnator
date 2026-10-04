import { TestBed } from '@angular/core/testing';
import {
    createSavedVodPlaylist,
    startSavedVodExecution,
} from '@iptvnator/portal/shared/util';
import {
    SAVED_VOD_PLAYLIST_RUNTIME,
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
const list = () =>
    createSavedVodPlaylist('list', 'Weekend', NOW, [
        { ...candidate, id: 'first' },
    ]);

describe('saved VOD playlist persistence commands', () => {
    const storage = { save: jest.fn(), delete: jest.fn() };
    let commands: SavedVodPlaylistsCommandsService;
    beforeEach(() => {
        let serial = 0;
        storage.save.mockReset();
        storage.delete.mockReset();
        TestBed.configureTestingModule({
            providers: [
                { provide: SavedVodPlaylistsStorageService, useValue: storage },
                {
                    provide: SAVED_VOD_PLAYLIST_RUNTIME,
                    useValue: { newId: () => `id-${++serial}`, now: () => NOW },
                },
            ],
        });
        commands = TestBed.inject(SavedVodPlaylistsCommandsService);
    });

    it('creates a list through create-only CAS and deduplicates ordinary additions', async () => {
        await commands.create('  Weekend  ', [candidate, candidate]);
        const [document, expected] = storage.save.mock.calls[0];
        expect(expected).toBeNull();
        expect(document.name).toBe('Weekend');
        expect(document.entries).toHaveLength(1);
        expect(document.execution).toBeNull();
    });

    it('returns conflicts directly without retrying or overwriting another window', async () => {
        const original = list();
        const current = { ...original, revision: 8, name: 'Another window' };
        storage.save.mockResolvedValue({ status: 'conflict', current });
        await expect(commands.rename(original, 'My edit')).resolves.toEqual({
            status: 'conflict',
            current,
        });
        expect(storage.save).toHaveBeenCalledTimes(1);
        expect(storage.save.mock.calls[0][1]).toBe(original.revision);
        expect(current.name).toBe('Another window');
    });

    it('avoids writes for no-op moves, renames and content already in the list', async () => {
        const original = list();
        await expect(
            commands.rename(original, 'Weekend')
        ).resolves.toMatchObject({ status: 'unchanged' });
        await expect(
            commands.move(original, 'first', 0)
        ).resolves.toMatchObject({ status: 'unchanged' });
        await expect(
            commands.append(original, [candidate])
        ).resolves.toMatchObject({ status: 'unchanged' });
        expect(storage.save).not.toHaveBeenCalled();
    });

    it('permits deliberate duplicate occurrences without reusing their IDs', async () => {
        await commands.append(list(), [candidate], true);
        const [document, expected] = storage.save.mock.calls[0];
        expect(expected).toBe(1);
        expect(
            document.entries.map((entry: { id: string }) => entry.id)
        ).toEqual(['first', 'id-1']);
    });

    it('clears and restores curated entries while retaining the active run and using the latest revision', async () => {
        const original = list();
        const execution = startSavedVodExecution(original, {
            id: 'run',
            updatedAt: NOW,
        });
        const running = { ...original, revision: 3, execution };
        await commands.clear(running);
        const [cleared, expected] = storage.save.mock.calls[0];
        expect(expected).toBe(3);
        expect(cleared.entries).toEqual([]);
        expect(cleared.execution).toBe(execution);
        await commands.restoreEntries(
            { ...cleared, revision: 4 },
            original.entries
        );
        const [restored, undoExpected] = storage.save.mock.calls[1];
        expect(undoExpected).toBe(4);
        expect(restored.entries).toEqual(original.entries);
        expect(restored.execution).toBe(execution);
    });

    it('duplicates without copying playback execution and deletes with the observed revision', async () => {
        const original = list();
        await commands.duplicate(
            {
                ...original,
                execution: startSavedVodExecution(original, {
                    id: 'run',
                    updatedAt: NOW,
                }),
            },
            'Copy'
        );
        expect(storage.save.mock.calls[0][0]).toMatchObject({
            id: 'id-1',
            entries: [{ id: 'id-2' }],
            execution: null,
        });
        expect(storage.save.mock.calls[0][1]).toBeNull();
        await commands.delete(original);
        expect(storage.delete).toHaveBeenCalledWith(
            original.id,
            original.revision
        );
    });
});
