import type { XtreamContentItem } from './xtream-data-source.interface';

export type PwaStorageValidator = (value: unknown) => void;

export function normalizePwaStoredId(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/** The same parser serves legacy reads and optionally validated cover reads. */
export function parsePwaFavorites(
    raw: string | null,
    validate?: PwaStorageValidator
): Record<string, number[]> {
    const value = parseStorageMap(raw, validate);
    const normalized: Record<string, number[]> = {};
    for (const [playlistId, ids] of Object.entries(value)) {
        if (!Array.isArray(ids)) continue;
        normalized[playlistId] = ids
            .map(normalizePwaStoredId)
            .filter((id): id is number => id !== null);
    }
    return normalized;
}

export function parsePwaCollectionItems(
    raw: string | null,
    validate?: PwaStorageValidator
): Record<string, Record<string, XtreamContentItem>> {
    return parseStorageMap(raw, validate) as Record<
        string,
        Record<string, XtreamContentItem>
    >;
}

function parseStorageMap(
    raw: string | null,
    validate?: PwaStorageValidator
): Record<string, unknown> {
    const value: unknown = raw === null ? {} : JSON.parse(raw);
    validate?.(value);
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
}
