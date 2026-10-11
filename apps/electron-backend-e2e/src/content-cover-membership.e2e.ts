import {
    closeElectronApp,
    expect,
    launchElectronApp,
    test,
    xtreamMockServer,
} from './electron-test-fixtures';

test('@cover @electron complete favourite membership survives the 500-row display boundary', async ({
    dataDir,
}) => {
    test.setTimeout(120000);
    const app = await launchElectronApp(dataDir);
    const primaryId = 'membership-movies';
    const secondaryId = 'membership-series';
    try {
        const seed = await app.mainWindow.evaluate(
            async ({ primaryId, secondaryId, serverUrl }) => {
                const api = window.electron;
                if (typeof api.dbGetAllGlobalFavoriteMembership !== 'function')
                    throw new Error(
                        'Built Electron is missing the complete membership bridge'
                    );
                for (const id of [primaryId, secondaryId]) {
                    const created = await api.dbCreatePlaylist({
                        id,
                        name: id,
                        serverUrl,
                        username: 'user1',
                        password: 'pass1',
                        type: 'xtream',
                    });
                    if (!created.success)
                        throw new Error(
                            'Membership fixture playlist creation failed'
                        );
                }
                await api.dbSaveCategories(
                    primaryId,
                    [
                        {
                            category_id: '42',
                            category_name: 'Membership movies',
                            parent_id: 0,
                        },
                    ],
                    'movies'
                );
                await api.dbSaveCategories(
                    secondaryId,
                    [
                        {
                            category_id: '44',
                            category_name: 'Membership series',
                            parent_id: 0,
                        },
                    ],
                    'series'
                );
                const movies = await api.dbSaveContent(
                    primaryId,
                    Array.from({ length: 500 }, (_, index) => ({
                        category_id: '42',
                        stream_id: index + 1,
                        name: `Membership movie ${index + 1}`,
                        rating: '7.4',
                        stream_icon: 'https://example.test/movie.jpg',
                        added: '1700000000',
                    })),
                    'movie'
                );
                const series = await api.dbSaveContent(
                    secondaryId,
                    [
                        {
                            category_id: '44',
                            series_id: 501,
                            name: 'Membership final series',
                            rating: '8.6',
                            cover: 'https://example.test/series.jpg',
                            added: '1700000001',
                        },
                    ],
                    'series'
                );
                const movieRows = await api.dbGetContent(primaryId, 'movie');
                const seriesRows = await api.dbGetContent(
                    secondaryId,
                    'series'
                );
                const final = seriesRows.find((row) => row.xtream_id === 501);
                if (!final)
                    throw new Error(
                        'Membership fixture series was not persisted'
                    );
                for (const row of [...movieRows, final]) {
                    const added = await api.dbAddFavorite(
                        row.id,
                        row.type === 'series' ? secondaryId : primaryId
                    );
                    if (!added.success)
                        throw new Error(
                            'Membership fixture favourite creation failed'
                        );
                }
                // Set a deterministic display order through the public persistence
                // command so the final favourite lies outside the bounded reader.
                const order = await api.dbReorderGlobalFavorites([
                    ...movieRows.map((row, position) => ({
                        content_id: row.id,
                        playlist_id: primaryId,
                        position,
                    })),
                    {
                        content_id: final.id,
                        playlist_id: secondaryId,
                        position: 500,
                    },
                ]);
                return { movies, series, order, finalId: final.id };
            },
            { primaryId, secondaryId, serverUrl: xtreamMockServer }
        );
        expect(seed.movies).toMatchObject({ success: true, count: 500 });
        expect(seed.series).toMatchObject({ success: true, count: 1 });
        expect(seed.order).toMatchObject({ success: true });

        const before = await app.mainWindow.evaluate(
            async ({ primaryId, secondaryId }) => ({
                display: await window.electron.dbGetAllGlobalFavorites(),
                membership:
                    await window.electron.dbGetAllGlobalFavoriteMembership(),
                movies: await window.electron.dbGetFavorites(primaryId),
                series: await window.electron.dbGetFavorites(secondaryId),
            }),
            { primaryId, secondaryId }
        );
        expect(before.display).toHaveLength(500);
        expect(before.display.some((row) => row.id === seed.finalId)).toBe(
            false
        );
        expect(before.membership).toHaveLength(501);
        expect(
            before.membership.find((row) => row.id === seed.finalId)
        ).toMatchObject({
            id: seed.finalId,
            xtream_id: 501,
            type: 'series',
            playlist_id: secondaryId,
            playlist_name: secondaryId,
            title: 'Membership final series',
            rating: '8.6',
            poster_url: 'https://example.test/series.jpg',
            position: 500,
        });
        expect(before.movies).toHaveLength(500);
        expect(before.series).toHaveLength(1);
        expect(before.series[0]).toMatchObject({
            id: seed.finalId,
            xtream_id: 501,
            type: 'series',
            rating: '8.6',
        });

        const removed = await app.mainWindow.evaluate(
            async ({ id, playlistId }) =>
                window.electron.dbRemoveFavorite(id, playlistId),
            { id: seed.finalId, playlistId: secondaryId }
        );
        expect(removed).toMatchObject({ success: true });
        const after = await app.mainWindow.evaluate(
            async ({ primaryId, secondaryId }) => ({
                display: await window.electron.dbGetAllGlobalFavorites(),
                membership:
                    await window.electron.dbGetAllGlobalFavoriteMembership(),
                movies: await window.electron.dbGetFavorites(primaryId),
                series: await window.electron.dbGetFavorites(secondaryId),
            }),
            { primaryId, secondaryId }
        );
        expect(after.display).toHaveLength(500);
        expect(after.membership).toHaveLength(500);
        expect(after.membership.some((row) => row.id === seed.finalId)).toBe(
            false
        );
        expect(
            after.membership.map((row) => row.id).sort((a, b) => a - b)
        ).toEqual(before.movies.map((row) => row.id).sort((a, b) => a - b));
        expect(after.movies).toEqual(before.movies);
        expect(after.series).toEqual([]);
    } finally {
        await closeElectronApp(app);
    }
});
