import type {
    SavedVodEntry,
    SavedVodExecution,
    SavedVodPlaylist,
} from '@iptvnator/shared/interfaces';
import {
    appendSavedVodEntries,
    moveSavedVodEntry,
    removeSavedVodEntries,
    savedVodReferenceKey,
} from './saved-vod-playlist-edits';
import {
    advanceSavedVodExecution,
    recordSavedVodProgress,
    savedVodResumePosition,
    startSavedVodExecution,
} from './saved-vod-playlist-execution';

const NOW = '2026-10-04T12:00:00Z';
const movie = (
    id: string,
    contentId = id === 'a' ? '1' : id === 'b' ? '2' : '3'
): SavedVodEntry => ({
    id,
    title: `Movie ${contentId}`,
    reference: {
        provider: 'xtream',
        sourceId: 'source-1',
        kind: 'movie',
        contentId,
    },
});
const playlist = (entries = [movie('a'), movie('b')]): SavedVodPlaylist => ({
    schemaVersion: 1,
    id: 'list-1',
    name: 'Weekend',
    revision: 1,
    entries,
    execution: null,
    createdAt: NOW,
    updatedAt: NOW,
});
const observe = (execution: SavedVodExecution) => ({
    executionId: execution.id,
    playbackRevision: execution.playbackRevision,
    entryId: execution.currentEntryId ?? '',
});
const start = (list = playlist()) =>
    startSavedVodExecution(list, { id: 'run-1', updatedAt: NOW });

describe('saved VOD playlist identity and editing', () => {
    it('deduplicates content within the same source, while explicit duplicates keep distinct occurrences', () => {
        const original = playlist();
        expect(appendSavedVodEntries(original, [movie('copy', '1')], NOW)).toBe(
            original
        );
        const result = appendSavedVodEntries(
            original,
            [movie('copy', '1')],
            NOW,
            true
        );
        expect(result.entries.map((entry) => entry.id)).toEqual([
            'a',
            'b',
            'copy',
        ]);
        expect(original.entries).toHaveLength(2);
        expect(() =>
            appendSavedVodEntries(original, [movie('a')], NOW, true)
        ).toThrow();
    });

    it('distinguishes source, provider, content kind and raw Stalker identity', () => {
        const reference = movie('a').reference;
        const keys = [
            reference,
            { ...reference, sourceId: 'source-2' },
            {
                provider: 'stalker' as const,
                sourceId: 'source-1',
                kind: 'movie' as const,
                contentId: 'a',
            },
            {
                provider: 'stalker' as const,
                sourceId: 'source-1',
                kind: 'episode' as const,
                seriesId: 'a',
                seriesMode: 'series' as const,
                seasonId: 'season-1',
                seasonNumber: 1,
                episodeNumber: 1,
            },
        ].map(savedVodReferenceKey);
        expect(new Set(keys).size).toBe(4);
    });

    it('reorders and removes saved entries without changing the execution snapshot', () => {
        const base = playlist();
        const original = { ...base, execution: start(base) };
        const moved = moveSavedVodEntry(original, 'a', 1, NOW);
        expect(moved.entries.map((entry) => entry.id)).toEqual(['b', 'a']);
        const removed = removeSavedVodEntries(moved, new Set(['a']), NOW);
        expect(removed.entries.map((entry) => entry.id)).toEqual(['b']);
        expect(removed.execution?.entries.map((entry) => entry.id)).toEqual([
            'a',
            'b',
        ]);
        expect(removed.execution?.currentEntryId).toBe('a');
        expect(original.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
    });
});

describe('saved VOD playlist execution', () => {
    it('starts empty lists safely and rejects invalid shuffle permutations', () => {
        expect(start(playlist([])).currentEntryId).toBeNull();
        for (const order of [['a'], ['a', 'a'], ['a', 'missing']]) {
            expect(() =>
                startSavedVodExecution(playlist(), {
                    id: 'run',
                    updatedAt: NOW,
                    order,
                })
            ).toThrow();
        }
        const shuffled = startSavedVodExecution(playlist(), {
            id: 'run',
            updatedAt: NOW,
            order: ['b', 'a'],
        });
        expect(shuffled.entries.map((entry) => entry.id)).toEqual(['b', 'a']);
        expect(shuffled.mode).toBe('shuffle');
    });

    it('resumes per-occurrence progress and ignores late events from another run or transition', () => {
        let execution = start(playlist([movie('a'), movie('copy', '1')]));
        const first = observe(execution);
        execution = recordSavedVodProgress(execution, first, 42, 100, NOW);
        expect(savedVodResumePosition(execution)).toBe(42);
        execution = advanceSavedVodExecution(execution, first, NOW);
        expect(execution.currentEntryId).toBe('copy');
        expect(savedVodResumePosition(execution)).toBe(0);
        expect(recordSavedVodProgress(execution, first, 90, 100, NOW)).toBe(
            execution
        );
        expect(advanceSavedVodExecution(execution, first, NOW)).toBe(execution);
        expect(
            recordSavedVodProgress(
                execution,
                { ...observe(execution), executionId: 'old-run' },
                10,
                100,
                NOW
            )
        ).toBe(execution);
        const restarted = start(playlist());
        expect(restarted.progress).toEqual([]);
        expect(execution.progress[0].completed).toBe(true);
    });

    it('clamps valid progress and ignores invalid player measurements', () => {
        const execution = start();
        for (const position of [NaN, Infinity, -1]) {
            expect(
                recordSavedVodProgress(
                    execution,
                    observe(execution),
                    position,
                    100,
                    NOW
                )
            ).toBe(execution);
        }
        expect(
            savedVodResumePosition(
                recordSavedVodProgress(
                    execution,
                    observe(execution),
                    120,
                    100,
                    NOW
                )
            )
        ).toBe(100);
        expect(
            recordSavedVodProgress(
                execution,
                observe(execution),
                12,
                Infinity,
                NOW
            ).progress[0].durationSeconds
        ).toBeNull();
    });

    it('separates Skip from completion and finishes ordered playback without wrapping', () => {
        let execution = start();
        execution = advanceSavedVodExecution(
            execution,
            observe(execution),
            NOW,
            'skip'
        );
        expect(execution.progress[0].completed).toBe(false);
        execution = advanceSavedVodExecution(
            execution,
            observe(execution),
            NOW
        );
        expect(execution.currentEntryId).toBeNull();
        expect(execution.progress[1].completed).toBe(true);
    });

    it('repeats one with a new observation token and makes manual Skip advance', () => {
        let execution = startSavedVodExecution(playlist(), {
            id: 'run',
            updatedAt: NOW,
            repeat: 'one',
        });
        const previous = observe(execution);
        execution = advanceSavedVodExecution(execution, previous, NOW);
        expect(execution.currentEntryId).toBe('a');
        expect(savedVodResumePosition(execution)).toBe(0);
        expect(advanceSavedVodExecution(execution, previous, NOW)).toBe(
            execution
        );
        execution = recordSavedVodProgress(
            execution,
            observe(execution),
            8,
            100,
            NOW
        );
        expect(savedVodResumePosition(execution)).toBe(8);
        execution = advanceSavedVodExecution(
            execution,
            observe(execution),
            NOW,
            'skip'
        );
        expect(execution.currentEntryId).toBe('b');
    });

    it('wraps Repeat All while keeping the saved list order unchanged', () => {
        const list = playlist();
        let execution = startSavedVodExecution(list, {
            id: 'run',
            updatedAt: NOW,
            repeat: 'all',
        });
        execution = advanceSavedVodExecution(
            execution,
            observe(execution),
            NOW
        );
        execution = advanceSavedVodExecution(
            execution,
            observe(execution),
            NOW
        );
        expect(execution.currentEntryId).toBe('a');
        expect(savedVodResumePosition(execution)).toBe(0);
        expect(list.execution).toBeNull();
    });
});
