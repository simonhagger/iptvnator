import type { XtreamContentItem } from './xtream-data-source.interface';

/** Loaded for PWA cover reads and writes; legacy parsing stays on the initial path. */
export function assertPwaFavoriteStorage(value: unknown): void {
    assertStorageMap(value, 'Invalid stored favorite membership');
    for (const ids of Object.values(value)) {
        if (!Array.isArray(ids))
            throw new Error('Invalid stored favorite membership');
        for (const id of ids) {
            const numeric = Number(id);
            if (
                !Number.isFinite(numeric) ||
                numeric <= 0 ||
                !['string', 'number'].includes(typeof id)
            )
                throw new Error('Invalid stored favorite identity');
        }
    }
}

export function assertPwaCollectionStorage(value: unknown): void {
    assertStorageMap(value, 'Invalid stored collection snapshots');
    if (
        Object.values(value).some(
            (items) =>
                !items || typeof items !== 'object' || Array.isArray(items)
        )
    )
        throw new Error('Invalid stored collection snapshots');
}

export function assertPwaFavoriteItems(
    ids: readonly number[],
    items: ReadonlyMap<number, XtreamContentItem>
): void {
    for (const id of ids) {
        const item = items.get(id);
        if (
            !item ||
            Number(item.xtream_id) !== id ||
            !['movie', 'vod', 'series', 'live'].includes(item.type)
        )
            throw new Error('Cannot resolve stored favorite identities');
    }
}

function assertStorageMap(
    value: unknown,
    message: string
): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(message);
}
