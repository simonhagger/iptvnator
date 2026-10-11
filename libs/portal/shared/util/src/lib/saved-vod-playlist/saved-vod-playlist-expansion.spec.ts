import {
    MAX_SAVED_VOD_ENTRIES,
    SavedVodValidationError,
} from '@iptvnator/shared/interfaces/saved-vod-validation';
import {
    expandSavedVodGroup,
    previewSavedVodGroupRefresh,
    type SavedVodExpansionInput,
    type SavedVodExpansionMetadata,
    type SavedVodGroupDescriptor,
} from './saved-vod-playlist-expansion';

const NOW = '2026-10-04T12:00:00Z';
const group: SavedVodGroupDescriptor = {
    id: 'whole-show',
    title: 'Show',
    source: { provider: 'xtream', sourceId: 'source', seriesId: '100' },
    scope: { kind: 'series' },
};
const episode = (
    season: number,
    number: number,
    id = String(season * 100 + number)
): SavedVodExpansionMetadata => ({
    title: `Season ${season}, episode ${number}`,
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'episode',
        seriesId: '100',
        contentId: id,
        seasonNumber: season,
        episodeNumber: number,
    },
});
const input = (
    metadata: readonly SavedVodExpansionMetadata[],
    overrides: Partial<SavedVodExpansionInput> = {}
): SavedVodExpansionInput => ({
    metadata,
    occurrenceIds: ['first', 'second', 'third', 'fourth'],
    capturedAt: NOW,
    sequence: 1,
    availableSlots: MAX_SAVED_VOD_ENTRIES,
    ...overrides,
});
const stalkerGroup: SavedVodGroupDescriptor = {
    id: 'stalker-season',
    title: 'Season',
    source: {
        provider: 'stalker',
        sourceId: 'portal',
        seriesId: 'show-raw',
        seriesMode: 'series',
    },
    scope: { kind: 'season', seasonNumber: 0, seasonId: 'season-raw' },
};
const stalkerEpisode = (
    seasonId = 'season-raw'
): SavedVodExpansionMetadata => ({
    title: 'Special',
    reference: {
        provider: 'stalker',
        sourceId: 'portal',
        kind: 'episode',
        seriesId: 'show-raw',
        seriesMode: 'series',
        seasonId,
        seasonNumber: 0,
        episodeNumber: 1,
    },
});

describe('pure saved VOD season/show expansion proposals', () => {
    it('orders seasons and episodes numerically and does not depend on provider response order', () => {
        const metadata = [
            episode(2, 1),
            episode(1, 10),
            episode(1, 2),
            episode(0, 1),
        ];
        const first = expandSavedVodGroup(group, input(metadata));
        expect(first.entries.map((entry) => entry.title)).toEqual([
            'Season 0, episode 1',
            'Season 1, episode 2',
            'Season 1, episode 10',
            'Season 2, episode 1',
        ]);
        expect(first.entries.map((entry) => entry.id)).toEqual([
            'first',
            'second',
            'third',
            'fourth',
        ]);
        expect(
            expandSavedVodGroup(group, input([...metadata].reverse()))
        ).toEqual(first);
        expect(metadata.map((entry) => entry.title)).toEqual([
            'Season 2, episode 1',
            'Season 1, episode 10',
            'Season 1, episode 2',
            'Season 0, episode 1',
        ]);
    });

    it('selects the requested season and source/series without turning movies into episodes', () => {
        const other = episode(1, 2);
        const season: SavedVodGroupDescriptor = {
            ...group,
            scope: { kind: 'season', seasonNumber: 1 },
        };
        const snapshot = expandSavedVodGroup(
            season,
            input([
                episode(2, 1),
                episode(1, 1),
                {
                    ...other,
                    reference: { ...other.reference, sourceId: 'other-source' },
                },
                {
                    title: 'Movie',
                    reference: {
                        provider: 'xtream',
                        sourceId: 'source',
                        kind: 'movie',
                        contentId: '100',
                    },
                },
                {
                    ...other,
                    reference: {
                        provider: 'xtream',
                        sourceId: 'source',
                        kind: 'episode',
                        contentId: '102',
                        seriesId: '200',
                        seasonNumber: 1,
                        episodeNumber: 2,
                    },
                },
            ])
        );
        expect(snapshot.entries).toHaveLength(1);
        expect(snapshot.entries[0].reference).toEqual(episode(1, 1).reference);
        expect(snapshot.entries[0].groupId).toBe(group.id);
    });

    it('uses the raw Stalker season identity as well as display coordinates and mode', () => {
        const item = stalkerEpisode();
        const snapshot = expandSavedVodGroup(
            stalkerGroup,
            input([
                stalkerEpisode('another-season'),
                item,
                {
                    ...item,
                    reference: {
                        provider: 'stalker',
                        sourceId: 'portal',
                        kind: 'episode',
                        seriesId: 'show-raw',
                        seasonId: 'season-raw',
                        seriesMode: 'vod-series',
                        seasonNumber: 0,
                        episodeNumber: 1,
                    },
                },
            ])
        );
        expect(snapshot.entries).toHaveLength(1);
        expect(snapshot.entries[0].reference).toEqual(item.reference);
    });

    it('deduplicates content by default and requires an explicit choice for repeated occurrences', () => {
        const item = episode(1, 1);
        const normal = expandSavedVodGroup(group, input([item, item]));
        const duplicates = expandSavedVodGroup(
            group,
            input([item, item]),
            true
        );
        expect(normal.entries.map((entry) => entry.id)).toEqual(['first']);
        expect(duplicates.entries.map((entry) => entry.id)).toEqual([
            'first',
            'second',
        ]);
        expect(duplicates.allowDuplicates).toBe(true);
        expect(duplicates.entries[0].reference).toEqual(
            duplicates.entries[1].reference
        );
    });

    it('uses a stable reference/title tie break for conflicting duplicate metadata', () => {
        const reference = episode(1, 1).reference;
        const metadata = [
            { title: 'Z title', reference },
            { title: 'A title', reference },
        ];
        expect(
            expandSavedVodGroup(group, input(metadata)).entries[0].title
        ).toBe('A title');
        expect(expandSavedVodGroup(group, input(metadata))).toEqual(
            expandSavedVodGroup(group, input([...metadata].reverse()))
        );
    });

    it('fails atomically when the group exceeds the remaining list capacity', () => {
        expect(() =>
            expandSavedVodGroup(
                group,
                input([episode(1, 1), episode(1, 2)], { availableSlots: 1 })
            )
        ).toThrow(SavedVodValidationError);
        expect(
            expandSavedVodGroup(group, input([], { availableSlots: 0 })).entries
        ).toEqual([]);
    });

    it('enforces the persisted maximum even when a caller supplies a larger limit', () => {
        expect(() =>
            expandSavedVodGroup(
                group,
                input([], { availableSlots: MAX_SAVED_VOD_ENTRIES + 1 })
            )
        ).toThrow(SavedVodValidationError);
        const metadata = Array.from(
            { length: MAX_SAVED_VOD_ENTRIES + 1 },
            (_, index) => episode(1, index + 1)
        );
        expect(() => expandSavedVodGroup(group, input(metadata))).toThrow(
            SavedVodValidationError
        );
    });

    it('accepts the maximum number of entries when every supplied occurrence ID is unique', () => {
        const metadata = Array.from(
            { length: MAX_SAVED_VOD_ENTRIES },
            (_, index) => episode(1, index + 1)
        );
        const occurrenceIds = metadata.map((_, index) => `entry-${index}`);
        expect(
            expandSavedVodGroup(group, input(metadata, { occurrenceIds }))
                .entries
        ).toHaveLength(MAX_SAVED_VOD_ENTRIES);
    });

    it.each([
        { occurrenceIds: [] },
        { occurrenceIds: ['invalid/id'] },
        { occurrenceIds: ['first'], reservedOccurrenceIds: new Set(['first']) },
        { capturedAt: 'not a timestamp' },
        { sequence: 0 },
        { sequence: 1.5 },
        { availableSlots: -1 },
    ])(
        'rejects invalid caller-supplied identities/time/sequence/capacity',
        (overrides) => {
            expect(() =>
                expandSavedVodGroup(group, input([episode(1, 1)], overrides))
            ).toThrow(SavedVodValidationError);
        }
    );

    it('rejects two occurrences assigned the same ID', () => {
        expect(() =>
            expandSavedVodGroup(
                group,
                input([episode(1, 1), episode(1, 2)], {
                    occurrenceIds: ['same', 'same'],
                })
            )
        ).toThrow(SavedVodValidationError);
    });

    it('allowlists metadata and descriptor fields instead of copying resolved URLs or secrets', () => {
        const metadata = {
            ...episode(1, 1),
            streamUrl: 'https://media.invalid/private',
            password: 'test-secret',
            reference: {
                ...episode(1, 1).reference,
                headers: { Authorization: 'test-secret' },
            },
        };
        const descriptor = {
            ...group,
            headers: { Authorization: 'test-secret' },
        };
        const snapshot = expandSavedVodGroup(descriptor, input([metadata]));
        expect(snapshot.group).toEqual(group);
        expect(snapshot.entries[0]).toEqual({
            id: 'first',
            title: metadata.title,
            reference: episode(1, 1).reference,
            groupId: group.id,
        });
        expect(JSON.stringify(snapshot)).not.toContain('test-secret');
        expect(JSON.stringify(snapshot)).not.toContain('https://');
    });
});

describe('raw expansion metadata input boundary', () => {
    function expectRejectedBatch(
        metadata: readonly SavedVodExpansionMetadata[],
        field: string,
        descriptor = group
    ) {
        const original = expandSavedVodGroup(
            descriptor,
            input([episode(1, 1)])
        );
        for (const propose of [
            () => expandSavedVodGroup(descriptor, input(metadata)),
            () =>
                previewSavedVodGroupRefresh(
                    original,
                    input(metadata, { sequence: 2 })
                ),
        ]) {
            expect(propose).toThrow(SavedVodValidationError);
            expect(propose).toThrow(`Invalid saved playlist field: ${field}`);
        }
    }

    it('rejects a malformed later duplicate instead of dropping it during deduplication', () => {
        const valid = episode(1, 1);
        expectRejectedBatch(
            [valid, { ...valid, title: 'Z'.repeat(301) }],
            'title'
        );
    });

    it('rejects an oversized raw duplicate batch even when its proposal would contain one entry', () => {
        expectRejectedBatch(
            Array<SavedVodExpansionMetadata>(MAX_SAVED_VOD_ENTRIES + 1).fill(
                episode(1, 1)
            ),
            'entries'
        );
    });

    it('rejects sparse metadata with a field-only validation error', () => {
        expectRejectedBatch(Array<SavedVodExpansionMetadata>(1), 'entry');
    });

    it.each([
        {
            field: 'title',
            invalid: { ...episode(2, 1), title: '' },
        },
        {
            field: 'episodeNumber',
            invalid: {
                ...episode(2, 1),
                reference: { ...episode(2, 1).reference, episodeNumber: 0 },
            },
        },
    ])(
        'validates out-of-scope $field before filtering the requested season',
        ({ field, invalid }) => {
            expectRejectedBatch([episode(1, 1), invalid], field, {
                ...group,
                scope: { kind: 'season', seasonNumber: 1 },
            });
        }
    );
});

describe('explicit saved VOD group refresh previews', () => {
    it('preserves matching IDs and reports additions/removals without mutating the old snapshot', () => {
        const original = expandSavedVodGroup(
            group,
            input([episode(1, 1), episode(1, 2)])
        );
        const before = JSON.stringify(original);
        const existing = { ...episode(1, 2), title: 'Updated episode title' };
        const preview = previewSavedVodGroupRefresh(
            original,
            input([episode(1, 3), existing], {
                occurrenceIds: ['new-third'],
                sequence: 2,
                capturedAt: '2026-10-05T12:00:00Z',
            })
        );
        expect(preview.snapshot.entries.map((entry) => entry.id)).toEqual([
            'second',
            'new-third',
        ]);
        expect(preview.snapshot.entries[0].title).toBe(existing.title);
        expect(preview.addedReferences).toEqual([episode(1, 3).reference]);
        expect(preview.removedReferences).toEqual([episode(1, 1).reference]);
        expect(preview.retainedOrderChanged).toBe(false);
        expect(JSON.stringify(original)).toBe(before);
    });

    it('preserves Xtream occurrence identity when the provider corrects episode coordinates', () => {
        const original = expandSavedVodGroup(
            group,
            input([episode(1, 1, '101'), episode(1, 2, '102')])
        );
        const preview = previewSavedVodGroupRefresh(
            original,
            input([episode(1, 2, '101'), episode(1, 1, '102')], {
                occurrenceIds: [],
                sequence: 2,
            })
        );
        expect(preview.snapshot.entries.map((entry) => entry.id)).toEqual([
            'second',
            'first',
        ]);
        expect(preview.addedReferences).toEqual([]);
        expect(preview.removedReferences).toEqual([]);
        expect(preview.retainedOrderChanged).toBe(true);
    });

    it('does not report an inserted episode as a reorder of retained entries', () => {
        const original = expandSavedVodGroup(
            group,
            input([episode(1, 2), episode(1, 3)])
        );
        const preview = previewSavedVodGroupRefresh(
            original,
            input([episode(1, 1), episode(1, 2), episode(1, 3)], {
                occurrenceIds: ['new-first'],
                sequence: 2,
            })
        );
        expect(preview.snapshot.entries.map((entry) => entry.id)).toEqual([
            'new-first',
            'first',
            'second',
        ]);
        expect(preview.retainedOrderChanged).toBe(false);
    });

    it('preserves repeated occurrences FIFO and reports each explicitly removed reference', () => {
        const item = stalkerEpisode();
        const original = expandSavedVodGroup(
            stalkerGroup,
            input([item, item, item]),
            true
        );
        const preview = previewSavedVodGroupRefresh(
            original,
            input([item], { occurrenceIds: [], sequence: 2 })
        );
        expect(preview.snapshot.allowDuplicates).toBe(true);
        expect(preview.snapshot.entries.map((entry) => entry.id)).toEqual([
            'first',
        ]);
        expect(preview.removedReferences).toEqual([
            item.reference,
            item.reference,
        ]);
    });

    it('does not recycle the ID of a removed occurrence for new content', () => {
        const original = expandSavedVodGroup(group, input([episode(1, 1)]));
        expect(() =>
            previewSavedVodGroupRefresh(
                original,
                input([episode(1, 2)], {
                    occurrenceIds: ['first'],
                    sequence: 2,
                })
            )
        ).toThrow(SavedVodValidationError);
    });

    it.each([0, 1, 1.5, Number.NaN])(
        'rejects an invalid or stale refresh sequence %s',
        (sequence) => {
            const original = expandSavedVodGroup(group, input([episode(1, 1)]));
            expect(() =>
                previewSavedVodGroupRefresh(
                    original,
                    input([episode(1, 1)], { occurrenceIds: [], sequence })
                )
            ).toThrow(SavedVodValidationError);
        }
    );

    it('refuses a previous snapshot whose entries belong to a different group', () => {
        const original = expandSavedVodGroup(group, input([episode(1, 1)]));
        const previous = {
            ...original,
            entries: [{ ...original.entries[0], groupId: 'another-group' }],
        };
        expect(() =>
            previewSavedVodGroupRefresh(previous, input([], { sequence: 2 }))
        ).toThrow(SavedVodValidationError);
    });
});
