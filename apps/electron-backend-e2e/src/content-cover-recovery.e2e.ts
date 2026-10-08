import {
    closeElectronApp,
    contentCardByTitle,
    expect,
    launchElectronApp,
    openGlobalFavorites,
    openGlobalRecent,
    restartElectronApp,
    test,
    xtreamMockServer,
} from './electron-test-fixtures';

for (const mode of ['favorites', 'recent'] as const) {
    test(`@cover @electron ${mode} recovers a failed progress read through visible Retry`, async ({
        dataDir,
    }) => {
        test.setTimeout(90000);
        let app = await launchElectronApp(dataDir);
        const playlistId = `cover-recovery-${mode}`;
        const titles = ['Recovery first movie', 'Recovery second movie'];
        try {
            const positions = await app.mainWindow.evaluate(
                async ({ playlistId, titles, serverUrl }) => {
                    const api = window.electron;
                    const created = await api.dbCreatePlaylist({
                        id: playlistId,
                        name: playlistId,
                        serverUrl,
                        username: 'user1',
                        password: 'pass1',
                        type: 'xtream',
                    });
                    if (!created.success) throw new Error('Cannot seed source');
                    await api.dbSaveCategories(
                        playlistId,
                        [
                            {
                                category_id: '42',
                                category_name: 'Recovery movies',
                                parent_id: 0,
                            },
                        ],
                        'movies'
                    );
                    const saved = await api.dbSaveContent(
                        playlistId,
                        titles.map((name, index) => ({
                            stream_id: index + 1,
                            category_id: '42',
                            name,
                        })),
                        'movie'
                    );
                    if (!saved.success) throw new Error('Cannot seed movies');
                    const rows = await api.dbGetContent(playlistId, 'movie');
                    if (rows.length !== 2)
                        throw new Error('Missing seeded movies');
                    for (const row of rows) {
                        const favorite = await api.dbAddFavorite(
                            row.id,
                            playlistId
                        );
                        const recent = await api.dbAddRecentItem(
                            row.id,
                            playlistId
                        );
                        if (!favorite.success || !recent.success)
                            throw new Error('Cannot seed collection');
                    }
                    const progress = await api.dbSavePlaybackPosition(
                        playlistId,
                        {
                            contentXtreamId: 1,
                            contentType: 'vod',
                            positionSeconds: 30,
                            durationSeconds: 100,
                        }
                    );
                    if (!progress.success)
                        throw new Error('Cannot seed progress');
                    return api.dbGetAllPlaybackPositions(playlistId);
                },
                { playlistId, titles, serverUrl: xtreamMockServer }
            );
            expect(positions).toEqual([
                expect.objectContaining({
                    contentXtreamId: 1,
                    positionSeconds: 30,
                }),
            ]);
            // Hydrate the persisted source normally, then fail only the bulk
            // progress bridge used by the collection. Membership remains healthy.
            app = await restartElectronApp(app, dataDir);
            await app.electronApp.evaluate(({ ipcMain }) => {
                const state = globalThis as typeof globalThis & {
                    coverRecoveryFailedReads: number;
                };
                state.coverRecoveryFailedReads = 0;
                ipcMain.removeHandler('DB_GET_ALL_PLAYBACK_POSITIONS');
                ipcMain.handle('DB_GET_ALL_PLAYBACK_POSITIONS', () => {
                    ++state.coverRecoveryFailedReads;
                    throw new Error('Synthetic progress read failure');
                });
            });
            const page = app.mainWindow;
            if (mode === 'favorites') await openGlobalFavorites(page);
            else await openGlobalRecent(page);
            const collection = page.locator('app-unified-collection-page');
            const alert = collection.getByRole('alert');
            await expect(alert).toContainText(
                'Could not load viewing progress'
            );
            const cards = collection.locator('.content-card');
            await expect(cards).toHaveCount(2);
            const activations = cards.locator('.content-card__activation');
            const originalOrder = await activations.evaluateAll((elements) =>
                elements.map((element) => element.getAttribute('aria-label'))
            );
            const first = contentCardByTitle(page, titles[0]).first();
            await expect(
                first.getByTestId('content-cover-favorite')
            ).toBeVisible();
            await expect(
                first.getByTestId('content-cover-progress')
            ).toHaveCount(0);
            await page.screenshot({
                path: test.info().outputPath('progress-read-failed.png'),
            });
            const failedReads = () =>
                app.electronApp.evaluate(
                    () =>
                        (
                            globalThis as typeof globalThis & {
                                coverRecoveryFailedReads: number;
                            }
                        ).coverRecoveryFailedReads
                );
            const beforeRetry = await failedReads();
            await alert
                .getByRole('button', { name: 'Retry', exact: true })
                .click();
            await expect.poll(failedReads).toBeGreaterThan(beforeRetry);
            await expect(alert).toBeVisible();

            // Return the real SQLite snapshot captured above. This app instance
            // is test-owned and closes below, so the synthetic handler cannot leak.
            await app.electronApp.evaluate(({ ipcMain }, positions) => {
                ipcMain.removeHandler('DB_GET_ALL_PLAYBACK_POSITIONS');
                ipcMain.handle(
                    'DB_GET_ALL_PLAYBACK_POSITIONS',
                    () => positions
                );
            }, positions);
            await alert
                .getByRole('button', { name: 'Retry', exact: true })
                .click();
            await expect(alert).toHaveCount(0);
            await expect(
                first.getByTestId('content-cover-progress')
            ).toHaveAttribute('aria-valuenow', '30');
            await expect(
                first.getByTestId('content-cover-favorite')
            ).toBeVisible();
            expect(
                await activations.evaluateAll((elements) =>
                    elements.map((element) =>
                        element.getAttribute('aria-label')
                    )
                )
            ).toEqual(originalOrder);
            await expect(page.locator('app-portal-inline-player')).toHaveCount(
                0
            );
            await page.screenshot({
                path: test.info().outputPath('progress-read-recovered.png'),
            });
        } finally {
            await closeElectronApp(app);
        }
    });
}
