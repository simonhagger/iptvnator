import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import {
    closeElectronApp,
    expect,
    launchElectronApp,
    test,
} from './electron-test-fixtures';

const document: SavedVodPlaylist = {
    schemaVersion: 1,
    id: 'weekend',
    name: 'Weekend',
    revision: 1,
    entries: [
        {
            id: 'movie-1',
            title: 'Movie',
            reference: {
                provider: 'xtream',
                sourceId: 'missing-source',
                kind: 'movie',
                contentId: '42',
            },
        },
    ],
    execution: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
};

test('@electron saved playlists persist through the real worker and app restart', async ({
    dataDir,
}) => {
    let app = await launchElectronApp(dataDir);
    try {
        const before = await app.mainWindow.evaluate(async (value) => {
            const bridge = window.electron;
            if (
                !bridge.dbSaveSavedVodPlaylist ||
                !bridge.dbListSavedVodPlaylists
            )
                throw new Error('Missing saved playlist bridge');
            const created = await bridge.dbSaveSavedVodPlaylist(value, null);
            const competing = await Promise.all([
                bridge.dbSaveSavedVodPlaylist(
                    { ...value, name: 'First edit' },
                    1
                ),
                bridge.dbSaveSavedVodPlaylist(
                    { ...value, name: 'Second edit' },
                    1
                ),
            ]);
            return {
                created,
                competing,
                summaries: await bridge.dbListSavedVodPlaylists(),
            };
        }, document);
        expect(before.created).toEqual({ status: 'saved', playlist: document });
        expect(before.competing.map((result) => result.status).sort()).toEqual([
            'conflict',
            'saved',
        ]);
        const winner = before.competing.find(
            (result) => result.status === 'saved'
        );
        if (!winner || winner.status !== 'saved')
            throw new Error('Missing winning revision');
        expect(before.summaries).toEqual([
            {
                id: document.id,
                name: winner.playlist.name,
                revision: 2,
                entryCount: 1,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
            },
        ]);
        await closeElectronApp(app);
        app = await launchElectronApp(dataDir);
        const after = await app.mainWindow.evaluate(async () => {
            const bridge = window.electron;
            if (
                !bridge.dbGetSavedVodPlaylist ||
                !bridge.dbDeleteSavedVodPlaylist ||
                !bridge.dbListSavedVodPlaylists
            )
                throw new Error('Missing saved playlist bridge');
            const retained = await bridge.dbGetSavedVodPlaylist('weekend');
            const staleDelete = await bridge.dbDeleteSavedVodPlaylist(
                'weekend',
                1
            );
            const deleted = await bridge.dbDeleteSavedVodPlaylist('weekend', 2);
            return {
                retained,
                staleDelete,
                deleted,
                summaries: await bridge.dbListSavedVodPlaylists(),
            };
        });
        expect(after.retained).toEqual(winner.playlist);
        expect(after.staleDelete).toEqual({
            status: 'conflict',
            current: winner.playlist,
        });
        expect(after.deleted).toEqual({ status: 'deleted' });
        expect(after.summaries).toEqual([]);
    } finally {
        await closeElectronApp(app);
    }
});
