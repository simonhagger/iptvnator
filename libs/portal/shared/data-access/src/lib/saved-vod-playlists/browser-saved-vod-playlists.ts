import {
    normalizeSavedVodPlaylist,
    parseSavedVodPlaylist,
    serializeSavedVodPlaylist,
    SavedVodValidationError,
} from '@iptvnator/shared/interfaces/saved-vod-validation';
import type {
    SavedVodDeleteResult,
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';

const DOCUMENTS = 'documents';
const SUMMARIES = 'summaries';

/** A separate DB leaves the existing provider-source IndexedDB schema untouched. */
export class BrowserSavedVodPlaylists {
    private opening: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (this.opening) return this.opening;
        this.opening = new Promise<IDBDatabase>((resolve, reject) => {
            const factory = globalThis.indexedDB;
            if (!factory)
                return reject(
                    new Error('Saved playlist storage is unavailable')
                );
            const request = factory.open('iptvnator-saved-vod', 1);
            let abandoned = false;
            request.onupgradeneeded = () => {
                request.result.createObjectStore(DOCUMENTS, { keyPath: 'id' });
                request.result.createObjectStore(SUMMARIES, { keyPath: 'id' });
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                abandoned = true;
                reject(
                    new Error(
                        'Close another app window to finish the saved playlist storage upgrade'
                    )
                );
            };
            request.onsuccess = () => {
                if (abandoned) {
                    request.result.close();
                    return;
                }
                request.result.onversionchange = () => {
                    request.result.close();
                    this.opening = null;
                };
                resolve(request.result);
            };
        }).catch((error) => {
            this.opening = null;
            throw error;
        });
        return this.opening;
    }

    /** All work after the read stays synchronous inside the active IDB transaction. */
    private async transaction<T>(
        stores: string[],
        mode: IDBTransactionMode,
        request: (transaction: IDBTransaction) => IDBRequest,
        consume: (value: unknown, transaction: IDBTransaction) => T
    ): Promise<T> {
        const db = await this.open();
        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(stores, mode);
            let result: T;
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = transaction.onabort = () =>
                reject(
                    transaction.error ??
                        new Error('Saved playlist transaction failed')
                );
            try {
                const read = request(transaction);
                read.onsuccess = () => {
                    try {
                        result = consume(read.result, transaction);
                    } catch (error) {
                        transaction.abort();
                        reject(error);
                    }
                };
            } catch (error) {
                transaction.abort();
                reject(error);
            }
        });
    }

    list(): Promise<SavedVodPlaylistSummary[]> {
        return this.transaction(
            [SUMMARIES],
            'readonly',
            (tx) => tx.objectStore(SUMMARIES).getAll(),
            (value) => {
                if (!Array.isArray(value))
                    throw new SavedVodValidationError('stored summaries');
                return (value as SavedVodPlaylistSummary[])
                    .map((row) => ({
                        id: row.id,
                        name: row.name,
                        revision: row.revision,
                        entryCount: row.entryCount,
                        createdAt: row.createdAt,
                        updatedAt: row.updatedAt,
                    }))
                    .sort(
                        (a, b) =>
                            b.updatedAt.localeCompare(a.updatedAt) ||
                            a.id.localeCompare(b.id)
                    );
            }
        );
    }

    get(id: string): Promise<SavedVodPlaylist | null> {
        return this.transaction(
            [DOCUMENTS],
            'readonly',
            (tx) => tx.objectStore(DOCUMENTS).get(id),
            (value) => readDocument(value, id)
        );
    }

    save(
        input: SavedVodPlaylist,
        expectedRevision: number | null
    ): Promise<SavedVodWriteResult> {
        const candidate = normalizeSavedVodPlaylist(input);
        if (expectedRevision !== null) checkRevision(expectedRevision);
        return this.transaction<SavedVodWriteResult>(
            [DOCUMENTS, SUMMARIES],
            'readwrite',
            (tx) => tx.objectStore(DOCUMENTS).get(candidate.id),
            (value, tx) => {
                const current = readDocument(value, candidate.id);
                if ((current?.revision ?? null) !== expectedRevision)
                    return { status: 'conflict', current };
                const playlist: SavedVodPlaylist = {
                    ...candidate,
                    revision: (expectedRevision ?? 0) + 1,
                    createdAt: current?.createdAt ?? candidate.createdAt,
                };
                tx.objectStore(DOCUMENTS).put({
                    id: playlist.id,
                    document: serializeSavedVodPlaylist(playlist),
                });
                tx.objectStore(SUMMARIES).put({
                    id: playlist.id,
                    name: playlist.name,
                    revision: playlist.revision,
                    entryCount: playlist.entries.length,
                    createdAt: playlist.createdAt,
                    updatedAt: playlist.updatedAt,
                } satisfies SavedVodPlaylistSummary);
                return { status: 'saved', playlist };
            }
        );
    }

    delete(
        id: string,
        expectedRevision: number
    ): Promise<SavedVodDeleteResult> {
        checkRevision(expectedRevision);
        return this.transaction<SavedVodDeleteResult>(
            [DOCUMENTS, SUMMARIES],
            'readwrite',
            (tx) => tx.objectStore(DOCUMENTS).get(id),
            (value, tx) => {
                const current = readDocument(value, id);
                if (!current || current.revision !== expectedRevision)
                    return { status: 'conflict', current };
                tx.objectStore(DOCUMENTS).delete(id);
                tx.objectStore(SUMMARIES).delete(id);
                return { status: 'deleted' };
            }
        );
    }
}

function readDocument(value: unknown, id: string): SavedVodPlaylist | null {
    if (value === undefined) return null;
    const row = value as { document?: unknown };
    if (!row || typeof row.document !== 'string')
        throw new SavedVodValidationError('stored document');
    const document = parseSavedVodPlaylist(row.document);
    if (document.id !== id)
        throw new SavedVodValidationError('stored identity');
    return document;
}

function checkRevision(revision: unknown): asserts revision is number {
    if (
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < 1
    )
        throw new SavedVodValidationError('expected revision');
}
