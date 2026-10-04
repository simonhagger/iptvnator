import { SavedVodValidationError } from '@iptvnator/shared/interfaces';
import {
    createSavedVodPlaylist,
    duplicateSavedVodPlaylist,
    renameSavedVodPlaylist,
} from './saved-vod-playlist-metadata';
import { startSavedVodExecution } from './saved-vod-playlist-execution';

const CREATED = '2026-10-04T12:00:00Z';
const UPDATED = '2026-10-04T13:00:00Z';
const original = () =>
    createSavedVodPlaylist('original', 'Weekend', CREATED, [
        {
            id: 'first',
            title: 'First movie',
            groupId: 'curated-group',
            reference: {
                provider: 'xtream',
                sourceId: 'source',
                kind: 'movie',
                contentId: '42',
            },
        },
    ]);

describe('saved VOD playlist metadata policy', () => {
    it('validates trimmed names before creating a document', () => {
        expect(createSavedVodPlaylist('new', '  Weekend  ', CREATED).name).toBe(
            'Weekend'
        );
        for (const name of ['', '   ', 'a'.repeat(101)]) {
            expect(() => createSavedVodPlaylist('new', name, CREATED)).toThrow(
                SavedVodValidationError
            );
        }
    });

    it('renames without losing the run or changing creation time and persisted revision', () => {
        const list = original();
        const execution = startSavedVodExecution(list, {
            id: 'run',
            updatedAt: CREATED,
        });
        const running = { ...list, revision: 7, execution };
        const renamed = renameSavedVodPlaylist(
            running,
            '  Next weekend  ',
            UPDATED
        );
        expect(renamed.name).toBe('Next weekend');
        expect(renamed.execution).toEqual(execution);
        expect(renamed.createdAt).toBe(CREATED);
        expect(renamed.updatedAt).toBe(UPDATED);
        expect(renamed.revision).toBe(7);
        expect(renameSavedVodPlaylist(running, ' Weekend ', UPDATED)).toBe(
            running
        );
        expect(() => renameSavedVodPlaylist(running, ' ', UPDATED)).toThrow(
            SavedVodValidationError
        );
    });

    it('duplicates content and provenance into new occurrences without execution or progress', () => {
        const list = original();
        const running = {
            ...list,
            execution: startSavedVodExecution(list, {
                id: 'run',
                updatedAt: CREATED,
            }),
        };
        const duplicate = duplicateSavedVodPlaylist(running, {
            id: 'copy',
            name: 'Weekend copy',
            entryIds: ['copy-first'],
            createdAt: UPDATED,
        });
        expect(duplicate).toMatchObject({
            id: 'copy',
            revision: 1,
            execution: null,
            createdAt: UPDATED,
            updatedAt: UPDATED,
        });
        expect(duplicate.entries[0]).toEqual({
            ...list.entries[0],
            id: 'copy-first',
        });
        expect(duplicate.entries[0].reference).not.toBe(
            list.entries[0].reference
        );
        expect(list.entries[0].id).toBe('first');
        expect(running.execution.currentEntryId).toBe('first');
    });

    it('rejects reused or mismatched identities rather than creating an ambiguous copy', () => {
        const list = original();
        const options = {
            id: 'copy',
            name: 'Copy',
            entryIds: ['copy-first'],
            createdAt: UPDATED,
        };
        for (const changes of [
            { id: 'original' },
            { entryIds: [] },
            { entryIds: ['first'] },
        ]) {
            expect(() =>
                duplicateSavedVodPlaylist(list, { ...options, ...changes })
            ).toThrow();
        }
        const repeated = {
            ...list,
            entries: [list.entries[0], { ...list.entries[0], id: 'second' }],
        };
        expect(() =>
            duplicateSavedVodPlaylist(repeated, {
                ...options,
                entryIds: ['copy-first', 'copy-first'],
            })
        ).toThrow(SavedVodValidationError);
    });
});
