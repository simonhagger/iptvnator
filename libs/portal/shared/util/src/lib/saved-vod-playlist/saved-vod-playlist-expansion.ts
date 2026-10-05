import {
    MAX_SAVED_VOD_ENTRIES,
    normalizeSavedVodCandidates,
    normalizeSavedVodPlaylist,
    SavedVodValidationError,
} from '@iptvnator/shared/interfaces/saved-vod-validation';
import type {
    SavedVodEntry,
    SavedVodReference,
} from '@iptvnator/shared/interfaces';
import { savedVodReferenceKey } from './saved-vod-playlist-edits';
import type {
    SavedVodExpansionInput,
    SavedVodExpansionMetadata,
    SavedVodGroupDescriptor,
    SavedVodGroupRefreshPreview,
    SavedVodGroupSnapshot,
} from './saved-vod-playlist-expansion.types';
export type * from './saved-vod-playlist-expansion.types';

/**
 * Pure proposal; every raw entry validates before scope filtering or deduplication.
 * Persistence and an active execution remain caller-owned.
 */
export function expandSavedVodGroup(
    group: SavedVodGroupDescriptor,
    input: SavedVodExpansionInput,
    allowDuplicates = false
): SavedVodGroupSnapshot {
    return propose(group, input, allowDuplicates).snapshot;
}

/** Explicit refresh preserves matching IDs; duplicate references match FIFO. */
export function previewSavedVodGroupRefresh(
    previous: SavedVodGroupSnapshot,
    input: SavedVodExpansionInput
): SavedVodGroupRefreshPreview {
    if (
        !Number.isSafeInteger(previous.sequence) ||
        previous.sequence < 1 ||
        input.sequence <= previous.sequence
    )
        invalid('group sequence');
    const prior = normalizeEntries(
        previous.group,
        previous.entries,
        previous.capturedAt
    );
    if (
        prior.some(
            (entry) =>
                entry.groupId !== previous.group.id ||
                !belongsToGroup(entry.reference, previous.group)
        )
    )
        invalid('group entries');
    const preview = propose(
        previous.group,
        input,
        previous.allowDuplicates,
        prior
    );
    const previousIds = new Set(prior.map((entry) => entry.id));
    const retained = preview.snapshot.entries
        .filter((entry) => previousIds.has(entry.id))
        .map((entry) => entry.id);
    const retainedIds = new Set(retained);
    const previousOrder = prior
        .filter((entry) => retainedIds.has(entry.id))
        .map((entry) => entry.id);
    return {
        ...preview,
        retainedOrderChanged: retained.some(
            (id, index) => id !== previousOrder[index]
        ),
    };
}

function propose(
    sourceGroup: SavedVodGroupDescriptor,
    input: SavedVodExpansionInput,
    allowDuplicates: boolean,
    previous: readonly SavedVodEntry[] = []
): SavedVodGroupRefreshPreview {
    const group = normalizeGroup(sourceGroup);
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 1)
        invalid('group sequence');
    if (typeof allowDuplicates !== 'boolean') invalid('group duplicates');
    if (
        !Number.isSafeInteger(input.availableSlots) ||
        input.availableSlots < 0 ||
        input.availableSlots > MAX_SAVED_VOD_ENTRIES
    )
        invalid('group capacity');
    const metadata = orderedMetadata(
        group,
        normalizeSavedVodCandidates(input.metadata),
        allowDuplicates
    );
    if (metadata.length > input.availableSlots) invalid('group capacity');
    const previousByKey = new Map<string, SavedVodEntry[]>();
    for (const entry of previous) {
        const key = savedVodReferenceKey(entry.reference);
        const queue = previousByKey.get(key);
        if (queue) queue.push(entry);
        else previousByKey.set(key, [entry]);
    }
    const reserved = new Set([
        ...(input.reservedOccurrenceIds ?? []),
        ...previous.map((entry) => entry.id),
    ]);
    const retained = new Set<string>();
    const cursors = new Map<string, number>();
    let nextId = 0;
    const entries = metadata.map((item): SavedVodEntry => {
        const key = savedVodReferenceKey(item.reference);
        const cursor = cursors.get(key) ?? 0;
        const existing = previousByKey.get(key)?.[cursor];
        let id: string;
        if (existing) {
            id = existing.id;
            cursors.set(key, cursor + 1);
            retained.add(id);
        } else {
            id = safeId(input.occurrenceIds[nextId++], 'group occurrence ID');
            if (reserved.has(id)) invalid('group occurrence ID');
            reserved.add(id);
        }
        return {
            id,
            title: item.title,
            reference: item.reference,
            groupId: group.id,
        };
    });
    const normalized = normalizeEntries(group, entries, input.capturedAt);
    return {
        snapshot: {
            group,
            capturedAt: input.capturedAt,
            sequence: input.sequence,
            allowDuplicates,
            entries: normalized,
        },
        addedReferences: normalized
            .filter((entry) => !retained.has(entry.id))
            .map((entry) => entry.reference),
        removedReferences: previous
            .filter((entry) => !retained.has(entry.id))
            .map((entry) => entry.reference),
        retainedOrderChanged: false,
    };
}

function orderedMetadata(
    group: SavedVodGroupDescriptor,
    candidates: readonly SavedVodExpansionMetadata[],
    allowDuplicates: boolean
): SavedVodExpansionMetadata[] {
    const ordered = candidates
        .filter((item) => belongsToGroup(item.reference, group))
        .sort((a, b) => {
            if (
                a.reference.kind !== 'episode' ||
                b.reference.kind !== 'episode'
            )
                return 0;
            return (
                a.reference.seasonNumber - b.reference.seasonNumber ||
                a.reference.episodeNumber - b.reference.episodeNumber ||
                compare(
                    savedVodReferenceKey(a.reference),
                    savedVodReferenceKey(b.reference)
                ) ||
                compare(a.title, b.title)
            );
        });
    const seen = new Set<string>();
    return ordered.filter((item) => {
        const key = savedVodReferenceKey(item.reference);
        if (!allowDuplicates && seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function belongsToGroup(
    reference: SavedVodReference,
    group: SavedVodGroupDescriptor
): boolean {
    return (
        reference.kind === 'episode' &&
        reference.provider === group.source.provider &&
        reference.sourceId === group.source.sourceId &&
        reference.seriesId === group.source.seriesId &&
        (reference.provider !== 'stalker' ||
            group.source.provider !== 'stalker' ||
            reference.seriesMode === group.source.seriesMode) &&
        (group.scope.kind === 'series' ||
            (reference.seasonNumber === group.scope.seasonNumber &&
                (reference.provider !== 'stalker' ||
                    ('seasonId' in group.scope &&
                        reference.seasonId === group.scope.seasonId))))
    );
}

function normalizeEntries(
    group: SavedVodGroupDescriptor,
    entries: readonly SavedVodEntry[],
    capturedAt: string
): readonly SavedVodEntry[] {
    return normalizeSavedVodPlaylist({
        schemaVersion: 1,
        id: group.id,
        name: 'Group snapshot',
        revision: 1,
        entries,
        execution: null,
        createdAt: capturedAt,
        updatedAt: capturedAt,
    }).entries;
}

function normalizeGroup(
    group: SavedVodGroupDescriptor
): SavedVodGroupDescriptor {
    const id = safeId(group.id, 'group ID');
    const title = group.title;
    if (typeof title !== 'string' || !title.trim() || title.length > 300)
        invalid('group title');
    const provider = group.source.provider;
    if (provider !== 'xtream' && provider !== 'stalker')
        invalid('group provider');
    const sourceId = safeId(group.source.sourceId, 'group source');
    const seriesId = safeId(group.source.seriesId, 'group series');
    if (provider === 'xtream' && !/^\d+$/.test(seriesId))
        invalid('group series');
    if (group.scope.kind !== 'series' && group.scope.kind !== 'season')
        invalid('group scope');
    if (
        group.scope.kind === 'season' &&
        (!Number.isSafeInteger(group.scope.seasonNumber) ||
            group.scope.seasonNumber < 0)
    )
        invalid('group season');
    const scope =
        group.scope.kind === 'series'
            ? { kind: 'series' as const }
            : {
                  kind: 'season' as const,
                  seasonNumber: group.scope.seasonNumber,
              };
    if (group.source.provider === 'stalker') {
        const seriesMode = group.source.seriesMode;
        if (seriesMode !== 'series' && seriesMode !== 'vod-series')
            invalid('group series mode');
        const stalkerScope =
            group.scope.kind === 'series'
                ? { kind: 'series' as const }
                : {
                      kind: 'season' as const,
                      seasonNumber: group.scope.seasonNumber,
                      seasonId: safeId(
                          'seasonId' in group.scope
                              ? group.scope.seasonId
                              : undefined,
                          'group season ID'
                      ),
                  };
        return {
            id,
            title,
            source: { provider: 'stalker', sourceId, seriesId, seriesMode },
            scope: stalkerScope,
        };
    }
    return {
        id,
        title,
        source: { provider: 'xtream', sourceId, seriesId },
        scope,
    };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const invalid = (field: string): never => {
    throw new SavedVodValidationError(field);
};
function safeId(value: unknown, field: string): string {
    if (
        typeof value !== 'string' ||
        value.length > 256 ||
        !/^[a-zA-Z0-9_.:-]+$/.test(value)
    )
        return invalid(field);
    return value;
}
