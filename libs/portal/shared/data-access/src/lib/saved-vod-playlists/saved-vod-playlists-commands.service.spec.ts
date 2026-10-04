import { TestBed } from '@angular/core/testing';
import {
    createSavedVodPlaylist,
    startSavedVodExecution,
} from '@iptvnator/portal/shared/util';
import { MAX_SAVED_VOD_ENTRIES } from '@iptvnator/shared/interfaces';
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
const episode: SavedVodCandidate = {
    title: 'Episode',
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'episode',
        seriesId: '1',
        contentId: '42',
        seasonNumber: 1,
        episodeNumber: 1,
    },
};
const list = () =>
    createSavedVodPlaylist('list', 'Weekend', NOW, [
        { ...candidate, id: 'first' },
    ]);

describe('saved VOD playlist persistence commands', () => {
    const storage = { save: jest.fn(), delete: jest.fn(), get: jest.fn() };
    let commands: SavedVodPlaylistsCommandsService;
    let runtime: { newId: jest.Mock<string, []>; now: jest.Mock<string, []> };
    beforeEach(() => {
        let serial = 0;
        runtime = {
            newId: jest.fn(() => `id-${++serial}`),
            now: jest.fn(() => NOW),
        };
        storage.save.mockReset();
        storage.delete.mockReset();
        storage.get.mockReset().mockResolvedValue(list());
        TestBed.configureTestingModule({
            providers: [
                { provide: SavedVodPlaylistsStorageService, useValue: storage },
                {
                    provide: SAVED_VOD_PLAYLIST_RUNTIME,
                    useValue: runtime,
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

    it('creates deliberate duplicate entries in one populated create-only write', async () => {
        await commands.create('Weekend', [candidate, candidate], true);
        expect(storage.save).toHaveBeenCalledTimes(1);
        const [document, expected] = storage.save.mock.calls[0];
        expect(expected).toBeNull();
        expect(
            document.entries.map((entry: { id: string }) => entry.id)
        ).toEqual(['id-2', 'id-3']);
    });

    it('does not leave an empty list when saving its initial entries fails', async () => {
        const persisted = new Map<string, unknown>();
        storage.save.mockImplementation(async (document) => {
            if (document.entries.length) throw new Error('Storage unavailable');
            persisted.set(document.id, document);
            return { status: 'saved', playlist: document };
        });
        await expect(commands.create('Weekend', [candidate])).rejects.toThrow(
            'Storage unavailable'
        );
        expect(storage.save).toHaveBeenCalledTimes(1);
        expect(storage.save.mock.calls[0][0].entries).toHaveLength(1);
        expect(persisted.size).toBe(0);
    });

    it.each([
        {
            label: 'blank duplicate title',
            valid: candidate,
            invalid: { ...candidate, title: '   ' },
        },
        {
            label: 'oversized duplicate title',
            valid: candidate,
            invalid: { ...candidate, title: 'x'.repeat(301) },
        },
        {
            label: 'duplicate episode coordinates',
            valid: episode,
            invalid: {
                ...episode,
                reference: { ...episode.reference, episodeNumber: 0 },
            },
        },
    ])(
        'rejects $label before deduplication in an existing or new list',
        ({ valid, invalid }) => {
            const original = createSavedVodPlaylist('list', 'Weekend', NOW, [
                { ...valid, id: 'first' },
            ]);
            expect(() => commands.append(original, [invalid])).toThrow();
            expect(() =>
                commands.create('Weekend', [valid, invalid])
            ).toThrow();
            expect(runtime.newId).not.toHaveBeenCalled();
            expect(runtime.now).not.toHaveBeenCalled();
            expect(storage.get).not.toHaveBeenCalled();
            expect(storage.save).not.toHaveBeenCalled();
        }
    );

    it.each(['create', 'append'] as const)(
        'rejects an oversized %s batch before allocating IDs or touching storage',
        (operation) => {
            const batch = Array<SavedVodCandidate>(
                MAX_SAVED_VOD_ENTRIES + 1
            ).fill(candidate);
            expect(() =>
                operation === 'create'
                    ? commands.create('Weekend', batch)
                    : commands.append(list(), batch)
            ).toThrow('Invalid saved playlist field: entries');
            expect(runtime.newId).not.toHaveBeenCalled();
            expect(runtime.now).not.toHaveBeenCalled();
            expect(storage.get).not.toHaveBeenCalled();
            expect(storage.save).not.toHaveBeenCalled();
        }
    );

    it('passes only allowlisted draft fields to persistence', async () => {
        const untrusted = {
            ...candidate,
            groupId: 'season-1',
            password: 'credential-marker',
            reference: {
                ...candidate.reference,
                streamUrl: 'credential-marker',
            },
        };
        await commands.create('Weekend', [untrusted]);
        expect(storage.save.mock.calls[0][0].entries).toEqual([
            { ...candidate, groupId: 'season-1', id: 'id-2' },
        ]);
        expect(JSON.stringify(storage.save.mock.calls[0][0])).not.toContain(
            'credential-marker'
        );
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

    it('reports a conflict instead of claiming a removed item is already present', async () => {
        const original = list();
        const current = { ...original, revision: 2, entries: [] };
        storage.get.mockResolvedValue(current);
        await expect(commands.append(original, [candidate])).resolves.toEqual({
            status: 'conflict',
            current,
        });
        expect(storage.get).toHaveBeenCalledWith(original.id);
        expect(storage.save).not.toHaveBeenCalled();
    });

    it('reports a deleted target rather than succeeding from a deduplicated snapshot', async () => {
        storage.get.mockResolvedValue(null);
        await expect(commands.append(list(), [candidate])).resolves.toEqual({
            status: 'conflict',
            current: null,
        });
        expect(storage.save).not.toHaveBeenCalled();
    });

    it.each(['rename', 'move', 'remove', 'clear'] as const)(
        'checks no-op %s against the observed stored revision without writing',
        async (operation) => {
            const original =
                operation === 'clear' ? { ...list(), entries: [] } : list();
            const run = () =>
                operation === 'rename'
                    ? commands.rename(original, original.name)
                    : operation === 'move'
                      ? commands.move(original, 'first', 0)
                      : operation === 'remove'
                        ? commands.remove(original, new Set(['absent']))
                        : commands.clear(original);
            storage.get.mockResolvedValue(original);
            await expect(run()).resolves.toEqual({
                status: 'unchanged',
                playlist: original,
            });
            const current = { ...original, revision: 2 };
            storage.get.mockResolvedValue(current);
            await expect(run()).resolves.toEqual({
                status: 'conflict',
                current,
            });
            storage.get.mockResolvedValue(null);
            await expect(run()).resolves.toEqual({
                status: 'conflict',
                current: null,
            });
            expect(storage.save).not.toHaveBeenCalled();
            expect(storage.get).toHaveBeenCalledTimes(3);
        }
    );

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
