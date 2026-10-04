import type {
    SavedVodEntry,
    SavedVodExecution,
    SavedVodPlaylist,
    SavedVodProgress,
    SavedVodReference,
} from './saved-vod-playlist.interface';

export const MAX_SAVED_VOD_ENTRIES = 2000;
export const MAX_SAVED_VOD_DOCUMENT_CHARS = 2 * 1024 * 1024;

/** Errors describe the field, never the supplied value or a resolved stream. */
export class SavedVodValidationError extends Error {
    constructor(field: string) {
        super(`Invalid saved playlist field: ${field}`);
        this.name = 'SavedVodValidationError';
    }
}

type RecordValue = Record<string, unknown>;
const invalid = (field: string): never => {
    throw new SavedVodValidationError(field);
};
const object = (value: unknown, field: string): RecordValue =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as RecordValue)
        : invalid(field);
const text = (value: unknown, field: string, max: number): string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max
        ? value
        : invalid(field);
const id = (value: unknown, field: string): string => {
    const result = text(value, field, 256);
    return /^[a-zA-Z0-9_.:-]+$/.test(result) ? result : invalid(field);
};
const integer = (value: unknown, field: string, min = 0): number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min
        ? value
        : invalid(field);
const seconds = (value: unknown, field: string): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : invalid(field);
const timestamp = (value: unknown, field: string): string => {
    const result = text(value, field, 32);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
        result
    ) && Number.isFinite(Date.parse(result))
        ? result
        : invalid(field);
};
const choice = <T extends string>(
    value: unknown,
    field: string,
    values: readonly T[]
): T =>
    typeof value === 'string' && values.includes(value as T)
        ? (value as T)
        : invalid(field);

function reference(value: unknown): SavedVodReference {
    const raw = object(value, 'reference');
    const provider = choice(raw['provider'], 'provider', [
        'xtream',
        'stalker',
    ] as const);
    const sourceId = id(raw['sourceId'], 'sourceId');
    const kind = choice(raw['kind'], 'kind', ['movie', 'episode'] as const);
    const providerId = (value: unknown, field: string): string => {
        const result = id(value, field);
        return provider === 'stalker' || /^\d+$/.test(result)
            ? result
            : invalid(field);
    };
    if (kind === 'movie') {
        return {
            provider,
            sourceId,
            kind,
            contentId: providerId(raw['contentId'], 'contentId'),
        };
    }
    const coordinates = {
        seasonNumber: integer(raw['seasonNumber'], 'seasonNumber'),
        episodeNumber: integer(raw['episodeNumber'], 'episodeNumber', 1),
    };
    const seriesId = providerId(raw['seriesId'], 'seriesId');
    return provider === 'xtream'
        ? {
              provider,
              sourceId,
              kind,
              seriesId,
              contentId: providerId(raw['contentId'], 'contentId'),
              ...coordinates,
          }
        : {
              provider,
              sourceId,
              kind,
              seriesId,
              seriesMode: choice(raw['seriesMode'], 'seriesMode', [
                  'series',
                  'vod-series',
              ] as const),
              seasonId: id(raw['seasonId'], 'seasonId'),
              ...coordinates,
          };
}

function entries(value: unknown): SavedVodEntry[] {
    if (!Array.isArray(value) || value.length > MAX_SAVED_VOD_ENTRIES)
        return invalid('entries');
    const seen = new Set<string>();
    return value.map((item) => {
        const raw = object(item, 'entry');
        const entryId = id(raw['id'], 'entry.id');
        if (seen.has(entryId)) return invalid('duplicate entry ID');
        seen.add(entryId);
        return {
            id: entryId,
            reference: reference(raw['reference']),
            title: text(raw['title'], 'title', 300),
            ...(raw['groupId'] === undefined
                ? {}
                : { groupId: id(raw['groupId'], 'groupId') }),
        };
    });
}

function execution(value: unknown): SavedVodExecution | null {
    if (value === null) return null;
    const raw = object(value, 'execution');
    const snapshot = entries(raw['entries']);
    const entryIds = new Set(snapshot.map((item) => item.id));
    const currentEntryId =
        raw['currentEntryId'] === null
            ? null
            : id(raw['currentEntryId'], 'currentEntryId');
    if (currentEntryId !== null && !entryIds.has(currentEntryId))
        return invalid('currentEntryId');
    if (
        !Array.isArray(raw['progress']) ||
        raw['progress'].length > snapshot.length
    )
        return invalid('progress');
    const seen = new Set<string>();
    const progress: SavedVodProgress[] = raw['progress'].map((item) => {
        const row = object(item, 'progress');
        const entryId = id(row['entryId'], 'progress.entryId');
        if (!entryIds.has(entryId) || seen.has(entryId))
            return invalid('progress.entryId');
        seen.add(entryId);
        const duration =
            row['durationSeconds'] === null
                ? null
                : seconds(row['durationSeconds'], 'durationSeconds');
        if (duration === 0 || typeof row['completed'] !== 'boolean')
            return invalid('progress');
        const position = seconds(row['positionSeconds'], 'positionSeconds');
        return {
            entryId,
            durationSeconds: duration,
            completed: row['completed'],
            positionSeconds:
                duration === null ? position : Math.min(duration, position),
        };
    });
    return {
        id: id(raw['id'], 'execution.id'),
        playbackRevision: integer(
            raw['playbackRevision'],
            'playbackRevision',
            1
        ),
        entries: snapshot,
        currentEntryId,
        progress,
        repeat: choice(raw['repeat'], 'repeat', ['off', 'one', 'all'] as const),
        mode: choice(raw['mode'], 'mode', ['ordered', 'shuffle'] as const),
        updatedAt: timestamp(raw['updatedAt'], 'execution.updatedAt'),
    };
}

/** Reconstruct an allowlisted document; unknown fields never reach storage or export. */
export function normalizeSavedVodPlaylist(value: unknown): SavedVodPlaylist {
    const raw = object(value, 'playlist');
    if (raw['schemaVersion'] !== 1) return invalid('schemaVersion');
    return {
        schemaVersion: 1,
        id: id(raw['id'], 'id'),
        name: text(raw['name'], 'name', 100),
        revision: integer(raw['revision'], 'revision'),
        entries: entries(raw['entries']),
        execution: execution(raw['execution']),
        createdAt: timestamp(raw['createdAt'], 'createdAt'),
        updatedAt: timestamp(raw['updatedAt'], 'updatedAt'),
    };
}

export function parseSavedVodPlaylist(document: string): SavedVodPlaylist {
    if (document.length > MAX_SAVED_VOD_DOCUMENT_CHARS)
        return invalid('document size');
    let value: unknown;
    try {
        value = JSON.parse(document);
    } catch {
        return invalid('JSON');
    }
    return normalizeSavedVodPlaylist(value);
}

export function serializeSavedVodPlaylist(playlist: SavedVodPlaylist): string {
    const document = JSON.stringify(normalizeSavedVodPlaylist(playlist));
    return document.length <= MAX_SAVED_VOD_DOCUMENT_CHARS
        ? document
        : invalid('document size');
}
