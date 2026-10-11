import { and, desc, eq } from 'drizzle-orm';
import { savedVodPlaylists } from '@iptvnator/shared/database/schema';
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
import type { AppDatabase } from '../database.types';

type ReadDatabase = Pick<AppDatabase, 'select'>;

function readPlaylist(db: ReadDatabase, id: string): SavedVodPlaylist | null {
    const row = db
        .select()
        .from(savedVodPlaylists)
        .where(eq(savedVodPlaylists.id, id))
        .get();
    if (!row) return null;
    const document = parseSavedVodPlaylist(row.document);
    if (document.id !== row.id || document.revision !== row.revision)
        throw new SavedVodValidationError('stored identity or revision');
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

export function listSavedVodPlaylists(
    db: AppDatabase
): SavedVodPlaylistSummary[] {
    const { id, name, revision, entryCount, createdAt, updatedAt } =
        savedVodPlaylists;
    return db
        .select({ id, name, revision, entryCount, createdAt, updatedAt })
        .from(savedVodPlaylists)
        .orderBy(desc(updatedAt), id)
        .all();
}

export function getSavedVodPlaylist(
    db: AppDatabase,
    id: string
): SavedVodPlaylist | null {
    if (typeof id !== 'string' || id.length > 256)
        throw new SavedVodValidationError('id');
    return readPlaylist(db, id);
}

/** A synchronous transaction performs comparison and writes without an await gap. */
export function saveSavedVodPlaylist(
    db: AppDatabase,
    input: unknown,
    expectedRevision: number | null
): SavedVodWriteResult {
    const candidate = normalizeSavedVodPlaylist(input);
    if (expectedRevision !== null) checkRevision(expectedRevision);
    return db.transaction(
        (tx): SavedVodWriteResult => {
            const current = readPlaylist(tx, candidate.id);
            if ((current?.revision ?? null) !== expectedRevision)
                return { status: 'conflict', current };
            const playlist: SavedVodPlaylist = {
                ...candidate,
                revision: (expectedRevision ?? 0) + 1,
                createdAt: current?.createdAt ?? candidate.createdAt,
            };
            const row = {
                id: playlist.id,
                name: playlist.name,
                revision: playlist.revision,
                entryCount: playlist.entries.length,
                document: serializeSavedVodPlaylist(playlist),
                createdAt: playlist.createdAt,
                updatedAt: playlist.updatedAt,
            };
            if (current) {
                tx.update(savedVodPlaylists)
                    .set(row)
                    .where(
                        and(
                            eq(savedVodPlaylists.id, playlist.id),
                            eq(savedVodPlaylists.revision, current.revision)
                        )
                    )
                    .run();
            } else tx.insert(savedVodPlaylists).values(row).run();
            return { status: 'saved', playlist };
        },
        { behavior: 'immediate' }
    );
}

export function deleteSavedVodPlaylist(
    db: AppDatabase,
    id: string,
    expectedRevision: number
): SavedVodDeleteResult {
    checkRevision(expectedRevision);
    return db.transaction(
        (tx): SavedVodDeleteResult => {
            const current = readPlaylist(tx, id);
            if (!current || current.revision !== expectedRevision)
                return { status: 'conflict', current };
            tx.delete(savedVodPlaylists)
                .where(
                    and(
                        eq(savedVodPlaylists.id, id),
                        eq(savedVodPlaylists.revision, expectedRevision)
                    )
                )
                .run();
            return { status: 'deleted' };
        },
        { behavior: 'immediate' }
    );
}
