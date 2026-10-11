import {
    MAX_SAVED_VOD_ENTRIES,
    normalizeSavedVodCandidates,
    normalizeSavedVodPlaylist,
    parseSavedVodPlaylist,
    serializeSavedVodPlaylist,
} from './saved-vod-playlist.validation';
import type { SavedVodProgress } from './saved-vod-playlist.interface';

const entry = {
    id: 'entry-1',
    title: 'Movie',
    reference: {
        sourceId: 'source-1',
        provider: 'xtream',
        kind: 'movie',
        contentId: '42',
    },
};
const fixture = () => ({
    schemaVersion: 1,
    id: 'list-1',
    name: 'Weekend',
    revision: 1,
    entries: [entry],
    execution: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
});

describe('saved playlist candidate batch validation', () => {
    it('reconstructs drafts with only allowed fields before they receive IDs', () => {
        expect(
            normalizeSavedVodCandidates([
                {
                    ...entry,
                    groupId: 'season-1',
                    password: 'private',
                    artworkUrl: 'https://private.example/token',
                    reference: { ...entry.reference, username: 'private' },
                },
            ])
        ).toEqual([
            {
                title: entry.title,
                reference: entry.reference,
                groupId: 'season-1',
            },
        ]);
    });

    it.each(['', '   ', 'x'.repeat(301)])(
        'rejects an invalid title on a later content duplicate',
        (title) => {
            expect(() =>
                normalizeSavedVodCandidates([entry, { ...entry, title }])
            ).toThrow('Invalid saved playlist field: title');
        }
    );

    it('rejects an oversized batch before inspecting or allocating its contents', () => {
        const oversized = Array(MAX_SAVED_VOD_ENTRIES + 1);
        Object.defineProperty(oversized, 0, {
            get: () => {
                throw new Error('Contents should not be inspected');
            },
        });
        expect(() => normalizeSavedVodCandidates(oversized)).toThrow(
            'Invalid saved playlist field: entries'
        );
    });

    it('rejects sparse batches rather than skipping missing drafts', () => {
        expect(() => normalizeSavedVodCandidates(Array(1))).toThrow(
            'Invalid saved playlist field: entry'
        );
    });
});

describe('saved playlist document validation', () => {
    it('round-trips only allowed fields and drops credential-bearing metadata at every level', () => {
        const document = normalizeSavedVodPlaylist({
            ...fixture(),
            password: 'private',
            entries: [
                {
                    ...entry,
                    artworkUrl: 'https://private.example/token',
                    reference: {
                        ...entry.reference,
                        streamUrl: 'https://private.example/user/password',
                    },
                },
            ],
        });
        expect(document).toEqual(fixture());
        expect(
            parseSavedVodPlaylist(serializeSavedVodPlaylist(document))
        ).toEqual(document);
    });

    it.each([
        { schemaVersion: 2 },
        { name: '' },
        { revision: -1 },
        { createdAt: 'yesterday' },
        { entries: [entry, entry] },
        { entries: Array(MAX_SAVED_VOD_ENTRIES + 1).fill(entry) },
    ])('rejects malformed or future documents before any write', (change) => {
        expect(() =>
            normalizeSavedVodPlaylist({ ...fixture(), ...change })
        ).toThrow();
    });

    it('rejects stream URLs used as IDs and unsupported content', () => {
        for (const reference of [
            { ...entry.reference, contentId: 'https://private.example/42' },
            { ...entry.reference, kind: 'live' },
            { ...entry.reference, provider: 'm3u' },
        ])
            expect(() =>
                normalizeSavedVodPlaylist({
                    ...fixture(),
                    entries: [{ ...entry, reference }],
                })
            ).toThrow();
    });

    it('validates execution snapshots independently of an edited list and clamps progress', () => {
        const document = normalizeSavedVodPlaylist({
            ...fixture(),
            entries: [],
            execution: {
                id: 'run-1',
                playbackRevision: 2,
                entries: [entry],
                currentEntryId: 'entry-1',
                progress: [
                    {
                        entryId: 'entry-1',
                        positionSeconds: 150,
                        durationSeconds: 100,
                        completed: false,
                    },
                ],
                mode: 'ordered',
                repeat: 'off',
                updatedAt: '2026-10-04T12:00:00Z',
            },
        });
        expect(document.entries).toHaveLength(0);
        expect(document.execution?.progress[0].positionSeconds).toBe(100);
        expect(() =>
            normalizeSavedVodPlaylist({
                ...document,
                execution: { ...document.execution, currentEntryId: 'missing' },
            })
        ).toThrow();
        expect(() =>
            normalizeSavedVodPlaylist({
                ...document,
                execution: {
                    ...document.execution,
                    progress: [
                        {
                            entryId: 'entry-1',
                            positionSeconds: Infinity,
                            durationSeconds: null,
                            completed: false,
                        },
                    ],
                },
            })
        ).toThrow();
    });

    it.each(['normalize', 'serialize'] as const)(
        'rejects sparse execution progress before %s can produce an unreadable document',
        (operation) => {
            const document = normalizeSavedVodPlaylist({
                ...fixture(),
                execution: {
                    id: 'run-1',
                    playbackRevision: 1,
                    entries: [entry],
                    currentEntryId: entry.id,
                    progress: [],
                    mode: 'ordered',
                    repeat: 'off',
                    updatedAt: fixture().updatedAt,
                },
            });
            if (!document.execution)
                throw new Error('Missing execution fixture');
            const invalid = {
                ...document,
                execution: {
                    ...document.execution,
                    progress: Array<SavedVodProgress>(1),
                },
            };
            expect(() =>
                operation === 'normalize'
                    ? normalizeSavedVodPlaylist(invalid)
                    : serializeSavedVodPlaylist(invalid)
            ).toThrow('Invalid saved playlist field: progress');
            expect(document.execution?.progress).toEqual([]);
        }
    );

    it('rejects invalid JSON without leaking its contents in errors', () => {
        expect(() => parseSavedVodPlaylist('{"password":"private"')).toThrow(
            'Invalid saved playlist field: JSON'
        );
    });
});
