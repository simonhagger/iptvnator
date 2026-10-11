import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '@iptvnator/shared/database/schema';
import { SAVED_VOD_PLAYLISTS_TABLE_SQL } from '@iptvnator/shared/database';
import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import {
    deleteSavedVodPlaylist,
    getSavedVodPlaylist,
    listSavedVodPlaylists,
    saveSavedVodPlaylist,
} from './saved-vod-playlists.operations';

const NOW = '2026-10-04T12:00:00Z';
const document = (): SavedVodPlaylist => ({
    schemaVersion: 1,
    id: 'weekend',
    name: 'Weekend',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    execution: null,
    entries: [
        {
            id: 'entry-1',
            title: 'Movie',
            reference: {
                provider: 'xtream',
                sourceId: 'source-1',
                kind: 'movie',
                contentId: '42',
            },
        },
    ],
});

describe('saved VOD SQLite transactions', () => {
    let directory: string;
    let first: Database.Database;
    let second: Database.Database;
    const db = () => drizzle(first, { schema });
    const other = () => drizzle(second, { schema });
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'iptvnator-saved-vod-'));
        first = new Database(join(directory, 'lists.db'));
        first.exec(SAVED_VOD_PLAYLISTS_TABLE_SQL);
        second = new Database(join(directory, 'lists.db'));
    });
    afterEach(() => {
        first.close();
        second.close();
        rmSync(directory, { recursive: true, force: true });
    });

    it('persists the same validated document across connections and reopening', () => {
        expect(saveSavedVodPlaylist(db(), document(), null).status).toBe(
            'saved'
        );
        expect(getSavedVodPlaylist(other(), 'weekend')).toEqual(document());
        second.close();
        second = new Database(join(directory, 'lists.db'));
        expect(getSavedVodPlaylist(other(), 'weekend')).toEqual(document());
        expect(listSavedVodPlaylists(other())).toEqual([
            {
                id: 'weekend',
                name: 'Weekend',
                revision: 1,
                entryCount: 1,
                createdAt: NOW,
                updatedAt: NOW,
            },
        ]);
    });

    it('rejects stale edits and creation collisions without replacing a newer document', () => {
        saveSavedVodPlaylist(db(), document(), null);
        const edited = {
            ...document(),
            name: 'Renamed',
            updatedAt: '2026-10-05T12:00:00Z',
        };
        expect(saveSavedVodPlaylist(other(), edited, 1).status).toBe('saved');
        expect(saveSavedVodPlaylist(db(), document(), 1)).toEqual({
            status: 'conflict',
            current: { ...edited, revision: 2 },
        });
        expect(saveSavedVodPlaylist(db(), document(), null).status).toBe(
            'conflict'
        );
        expect(listSavedVodPlaylists(db())[0]).toMatchObject({
            name: 'Renamed',
            revision: 2,
        });
    });

    it('guards deletion with the current revision and deletes document and summary together', () => {
        saveSavedVodPlaylist(db(), document(), null);
        expect(deleteSavedVodPlaylist(other(), 'weekend', 2).status).toBe(
            'conflict'
        );
        expect(deleteSavedVodPlaylist(other(), 'weekend', 1)).toEqual({
            status: 'deleted',
        });
        expect(getSavedVodPlaylist(db(), 'weekend')).toBeNull();
        expect(listSavedVodPlaylists(db())).toEqual([]);
    });

    it('rejects invalid edits atomically and strips unknown credential fields before persistence', () => {
        saveSavedVodPlaylist(
            db(),
            { ...document(), password: 'synthetic-secret' },
            null
        );
        const stored = first
            .prepare('SELECT document FROM saved_vod_playlists')
            .get() as { document: string };
        expect(stored.document).not.toContain('synthetic-secret');
        expect(() =>
            saveSavedVodPlaylist(db(), { ...document(), name: '' }, 1)
        ).toThrow();
        expect(getSavedVodPlaylist(other(), 'weekend')).toEqual(document());
    });
});
