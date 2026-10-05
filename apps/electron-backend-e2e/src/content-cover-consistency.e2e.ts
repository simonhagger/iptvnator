import {
    addStalkerPortal,
    addXtreamPortal,
    clickCategoryByNameExact,
    closeElectronApp,
    contentCardByTitle,
    expect,
    expectPathname,
    goToDashboard,
    launchElectronApp,
    openGlobalRecent,
    openPlaylistFavorites,
    openSources,
    openWorkspaceSection,
    resetMockServers,
    restartElectronApp,
    sourceRowByTitle,
    switchUnifiedCollectionContent,
    test,
    waitForStalkerCatalog,
    waitForXtreamWorkspaceReady,
} from './electron-test-fixtures';
import {
    fetchStalkerCategoryFixture,
    fetchXtreamSeriesFixture,
    fetchXtreamVodFixture,
} from './portal-mock-fixtures';
import { goBackFromDetail } from './dashboard-e2e-flows';
import {
    routePlayableStreams,
    startAndConfirmPlayback,
} from './playable-stream-fixture';
import {
    catalogCard,
    captureCover,
    configureCoverSettings,
    dismissCoverMenu,
    expectAvailableRating,
    expectCoverState,
    expectSavedCoverPosition,
    expectSeriesOnlyFavorites,
    exerciseCoverSearch,
    firstCatalogTitle,
    persistCoverPosition,
    routeCoverArtwork,
    selectCoverAction,
    selectCoverCategory,
} from './content-cover-consistency.fixture';

const credentials = { username: 'minimal', password: 'minimal' };

for (const provider of ['xtream', 'stalker'] as const) {
    for (const theme of ['light', 'dark'] as const) {
        test(`@cover @theme @${provider} @electron cover actions and saved state agree across catalogue, collections and dashboard in ${theme}`, async ({
            dataDir,
            request,
        }) => {
            test.setTimeout(150000);
            await resetMockServers(request, [provider]);
            const movieFixture =
                provider === 'xtream'
                    ? await fetchXtreamVodFixture(request, credentials)
                    : await fetchStalkerCategoryFixture(request, 'vod');
            const seriesFixture =
                provider === 'xtream'
                    ? await fetchXtreamSeriesFixture(request, credentials)
                    : await fetchStalkerCategoryFixture(request, 'series');
            let app = await launchElectronApp(dataDir);
            let page = app.mainWindow;
            const sourceName = `Cover ${provider} ${theme}`;
            await routeCoverArtwork(page);
            await routePlayableStreams(page);
            try {
                await configureCoverSettings(page, theme);
                await openSources(page);
                if (provider === 'xtream') {
                    await addXtreamPortal(page, {
                        name: sourceName,
                        ...credentials,
                    });
                    await waitForXtreamWorkspaceReady(page);
                } else {
                    await addStalkerPortal(page, { name: sourceName });
                    await waitForStalkerCatalog(page);
                }
                await openWorkspaceSection(page, 'Movies');
                await selectCoverCategory(page, provider, movieFixture);
                const movieTitle = await firstCatalogTitle(page);
                const movieCard = catalogCard(page, movieTitle).first();
                const movie = movieFixture.items.find(
                    (item) =>
                        item.name === movieTitle ||
                        ('o_name' in item && item.o_name === movieTitle)
                );
                expect(movie).toBeTruthy();
                const movieCoordinates = movie as {
                    stream_id?: number | string;
                    id?: number | string;
                };
                const movieId = Number(
                    movieCoordinates.stream_id ?? movieCoordinates.id
                );
                expect(movieId).toBeGreaterThan(0);
                const playlistId = /\/(?:xtreams|stalker)\/([^/]+)/.exec(
                    new URL(page.url()).pathname
                )?.[1];
                expect(playlistId).toBeTruthy();
                const rating = movieCard.getByTestId('content-cover-rating');
                const catalogRating = (await rating.count())
                    ? await rating.textContent()
                    : null;
                const catalogRatingSource = (await rating.count())
                    ? await rating.getAttribute('data-rating-source')
                    : null;
                await dismissCoverMenu(page, movieCard);
                await selectCoverAction(page, movieCard, 'favorite');
                await expect(
                    movieCard.getByTestId('content-cover-favorite')
                ).toBeVisible();
                await expect(page.locator('app-content-hero')).toHaveCount(0);
                await captureCover(
                    page,
                    movieCard,
                    `catalogue-${provider}-${theme}`,
                    true
                );
                await selectCoverAction(page, movieCard, 'details');
                await expect(page.locator('app-content-hero')).toContainText(
                    movieTitle
                );
                await startAndConfirmPlayback(page, () =>
                    page.locator('button.play-btn').first().click()
                );
                await page
                    .getByRole('button', { name: 'Close player', exact: true })
                    .click();
                await persistCoverPosition(page, playlistId!, {
                    contentXtreamId: movieId,
                    contentType: 'vod',
                    positionSeconds: 40,
                    durationSeconds: 100,
                });
                await goBackFromDetail(page);
                await openWorkspaceSection(page, 'Series');
                await selectCoverCategory(page, provider, seriesFixture);
                const seriesTitle = await firstCatalogTitle(page);
                const seriesCard = catalogCard(page, seriesTitle).first();
                const seriesRating = seriesCard.getByTestId(
                    'content-cover-rating'
                );
                const seriesCatalogRating = (await seriesRating.count())
                    ? await seriesRating.textContent()
                    : null;
                const seriesCatalogRatingSource = (await seriesRating.count())
                    ? await seriesRating.getAttribute('data-rating-source')
                    : null;
                const series = seriesFixture.items.find(
                    (item) => item.name === seriesTitle
                );
                expect(series).toBeTruthy();
                const seriesCoordinates = series as {
                    series_id?: number | string;
                    id?: number | string;
                };
                const seriesId = Number(
                    seriesCoordinates.series_id ?? seriesCoordinates.id
                );
                expect(seriesId).toBeGreaterThan(0);
                await selectCoverAction(page, seriesCard, 'favorite');
                await selectCoverAction(page, seriesCard, 'details');
                const episode = page.locator('.episode-card').first();
                await expect(episode).toBeVisible();
                const episodeId = Number(
                    await episode.getAttribute('data-episode-id')
                );
                expect(episodeId).toBeGreaterThan(0);
                await startAndConfirmPlayback(page, () => episode.click());
                await page
                    .getByRole('button', { name: 'Close player', exact: true })
                    .click();
                await persistCoverPosition(page, playlistId!, {
                    contentXtreamId: episodeId,
                    contentType: 'episode',
                    seriesXtreamId: seriesId,
                    positionSeconds: 100,
                    durationSeconds: 100,
                    seasonNumber: 1,
                    episodeNumber: 1,
                });
                await goBackFromDetail(page);
                // The seed represents rows from a previous session, so read
                // them through normal startup hydration rather than patching stores.
                app = await restartElectronApp(app, dataDir);
                page = app.mainWindow;
                await routeCoverArtwork(page);
                await routePlayableStreams(page);
                await expect(page.locator('body')).toHaveClass(
                    theme === 'dark' ? /dark-theme/ : /^(?!.*dark-theme)/
                );
                await openSources(page);
                await sourceRowByTitle(page, sourceName).first().click();
                if (provider === 'xtream')
                    await waitForXtreamWorkspaceReady(page);
                else await waitForStalkerCatalog(page);
                await openWorkspaceSection(page, 'Series');
                await selectCoverCategory(page, provider, seriesFixture);
                // One completed episode never proves that an entire series is watched.
                await expectCoverState(
                    catalogCard(page, seriesTitle).first(),
                    'in-progress',
                    100,
                    'episode'
                );

                await exerciseCoverSearch(page, {
                    provider,
                    movieTitle,
                    seriesTitle,
                    movieRating: catalogRating,
                    movieRatingSource: catalogRatingSource,
                    seriesRating: seriesCatalogRating,
                    seriesRatingSource: seriesCatalogRatingSource,
                });

                await openPlaylistFavorites(page);
                await switchUnifiedCollectionContent(page, 'Movies');
                const favoriteMovie = contentCardByTitle(
                    page,
                    movieTitle
                ).first();
                await expectCoverState(favoriteMovie, 'in-progress', 40);
                await expectAvailableRating(favoriteMovie, catalogRating);
                await dismissCoverMenu(page, favoriteMovie);
                await captureCover(
                    page,
                    favoriteMovie,
                    `collection-${provider}-${theme}`,
                    true
                );
                await switchUnifiedCollectionContent(page, 'Series');
                await expectCoverState(
                    contentCardByTitle(page, seriesTitle).first(),
                    'in-progress',
                    100,
                    'episode'
                );

                await goToDashboard(page);
                const rail = page.getByTestId('dashboard-favorite-vod-rail');
                const dashboardMovie = rail
                    .getByTestId('dashboard-favorite-vod-rail-card')
                    .filter({ hasText: movieTitle });
                const dashboardSeries = rail
                    .getByTestId('dashboard-favorite-vod-rail-card')
                    .filter({ hasText: seriesTitle });
                await expectCoverState(dashboardMovie, 'in-progress', 40);
                await expectCoverState(
                    dashboardSeries,
                    'in-progress',
                    100,
                    'episode'
                );
                await expectAvailableRating(dashboardMovie, catalogRating);
                await dismissCoverMenu(page, dashboardMovie);
                await captureCover(
                    page,
                    dashboardMovie,
                    `dashboard-${provider}-${theme}`,
                    true
                );

                await openGlobalRecent(page);
                await switchUnifiedCollectionContent(page, 'Movies');
                await expectCoverState(
                    contentCardByTitle(page, movieTitle).first(),
                    'in-progress',
                    40
                );
                await selectCoverAction(
                    page,
                    contentCardByTitle(page, movieTitle).first(),
                    'favorite'
                );
                await expect(
                    contentCardByTitle(page, movieTitle)
                        .first()
                        .getByTestId('content-cover-favorite')
                ).toHaveCount(0);
                await goToDashboard(page);
                await expect(dashboardMovie).toHaveCount(0);
                await openSources(page);
                await sourceRowByTitle(page, sourceName).first().click();
                await openWorkspaceSection(page, 'Movies');
                await selectCoverCategory(page, provider, movieFixture);
                await expect(
                    catalogCard(page, movieTitle)
                        .first()
                        .getByTestId('content-cover-favorite')
                ).toHaveCount(0);
                await openGlobalRecent(page);
                await switchUnifiedCollectionContent(page, 'Movies');
                await selectCoverAction(
                    page,
                    contentCardByTitle(page, movieTitle).first(),
                    'favorite'
                );
                await expectCoverState(
                    contentCardByTitle(page, movieTitle).first(),
                    'in-progress',
                    40
                );
                await goToDashboard(page);
                await expectCoverState(dashboardMovie, 'in-progress', 40);
                await openSources(page);
                await sourceRowByTitle(page, sourceName).first().click();
                await openWorkspaceSection(page, 'Movies');
                await selectCoverCategory(page, provider, movieFixture);
                await expectCoverState(
                    catalogCard(page, movieTitle).first(),
                    'in-progress',
                    40
                );
                await openGlobalRecent(page);
                await switchUnifiedCollectionContent(page, 'Series');
                await expectCoverState(
                    contentCardByTitle(page, seriesTitle).first(),
                    'in-progress',
                    100,
                    'episode'
                );

                await goToDashboard(page);
                const continueMovie = page
                    .getByTestId('dashboard-continue-watching-rail-card')
                    .filter({ hasText: movieTitle });
                await selectCoverAction(page, continueMovie, 'mark-watched');
                await expectSavedCoverPosition(page, playlistId!, {
                    contentXtreamId: movieId,
                    contentType: 'vod',
                    positionSeconds: 100,
                    durationSeconds: 100,
                });
                await expectCoverState(dashboardMovie, 'watched');
                await expect(
                    dashboardMovie.getByTestId('content-cover-progress')
                ).toHaveCount(0);
                await openPlaylistFavorites(page);
                await switchUnifiedCollectionContent(page, 'Movies');
                await expectCoverState(
                    contentCardByTitle(page, movieTitle).first(),
                    'watched'
                );

                await openSources(page);
                await sourceRowByTitle(page, sourceName).first().click();
                await openWorkspaceSection(page, 'Movies');
                await selectCoverCategory(page, provider, movieFixture);
                await expectPathname(
                    page,
                    new RegExp(`/(?:xtreams|stalker)/${playlistId}/vod/[^/]+$`)
                );
                await expectSavedCoverPosition(page, playlistId!, {
                    contentXtreamId: movieId,
                    contentType: 'vod',
                    positionSeconds: 100,
                    durationSeconds: 100,
                });
                await expectCoverState(
                    catalogCard(page, movieTitle).first(),
                    'watched'
                );
                await selectCoverAction(
                    page,
                    catalogCard(page, movieTitle).first(),
                    'favorite'
                );
                await expect(
                    catalogCard(page, movieTitle)
                        .first()
                        .getByTestId('content-cover-favorite')
                ).toHaveCount(0);
                await openPlaylistFavorites(page);
                await expectSeriesOnlyFavorites(page, seriesTitle);
                await expect(contentCardByTitle(page, movieTitle)).toHaveCount(
                    0
                );
                await goToDashboard(page);
                await expect(
                    page
                        .getByTestId('dashboard-favorite-vod-rail-card')
                        .filter({ hasText: movieTitle })
                ).toHaveCount(0);
                app = await restartElectronApp(app, dataDir);
                page = app.mainWindow;
                await routeCoverArtwork(page);
                await routePlayableStreams(page);
                await goToDashboard(page);
                await expect(page.locator('body')).toHaveClass(
                    theme === 'dark' ? /dark-theme/ : /^(?!.*dark-theme)/
                );
                await expect(
                    page
                        .getByTestId('dashboard-favorite-vod-rail-card')
                        .filter({ hasText: movieTitle })
                ).toHaveCount(0);
                await expectCoverState(
                    page
                        .getByTestId('dashboard-favorite-vod-rail-card')
                        .filter({ hasText: seriesTitle }),
                    'in-progress',
                    100,
                    'episode'
                );
                await openPlaylistFavorites(page);
                await expectSeriesOnlyFavorites(page, seriesTitle);
                await selectCoverAction(
                    page,
                    contentCardByTitle(page, seriesTitle).first(),
                    'remove'
                );
                await expect(contentCardByTitle(page, seriesTitle)).toHaveCount(
                    0
                );
                await expect(page.locator('app-content-hero')).toHaveCount(0);
                await goToDashboard(page);
                await expect(
                    page
                        .getByTestId('dashboard-favorite-vod-rail-card')
                        .filter({ hasText: seriesTitle })
                ).toHaveCount(0);
            } finally {
                await closeElectronApp(app);
            }
        });
    }
}

test('@cover @theme @xtream @electron titles-off and failed artwork preserve keyboard names and independent actions', async ({
    dataDir,
    request,
}) => {
    await resetMockServers(request, ['xtream']);
    const fixture = await fetchXtreamVodFixture(request, credentials);
    let app = await launchElectronApp(dataDir);
    let page = app.mainWindow;
    await routeCoverArtwork(page, true);
    try {
        await configureCoverSettings(page, 'dark', false);
        await openSources(page);
        await addXtreamPortal(page, {
            name: 'Cover missing artwork',
            ...credentials,
        });
        await waitForXtreamWorkspaceReady(page);
        await openWorkspaceSection(page, 'Movies');
        await clickCategoryByNameExact(page, fixture.categoryName);
        const title = await firstCatalogTitle(page);
        let card = catalogCard(page, title).first();
        await expect(
            card.getByRole('button', { name: title, exact: true })
        ).toBeVisible();
        await expect(
            card.locator('.cover-title-overlay--pinned')
        ).toBeVisible();
        await dismissCoverMenu(page, card);
        await selectCoverAction(page, card, 'favorite');
        await expect(card.getByTestId('content-cover-favorite')).toBeVisible();
        await expect(page.locator('app-content-hero')).toHaveCount(0);
        app = await restartElectronApp(app, dataDir);
        page = app.mainWindow;
        await routeCoverArtwork(page, true);
        await expect(page.locator('body')).toHaveClass(/dark-theme/);
        await openSources(page);
        await sourceRowByTitle(page, 'Cover missing artwork').first().click();
        await waitForXtreamWorkspaceReady(page);
        await openWorkspaceSection(page, 'Movies');
        await clickCategoryByNameExact(page, fixture.categoryName);
        card = catalogCard(page, title).first();
        await expect(
            card.locator('.cover-title-overlay--pinned')
        ).toBeVisible();
        await expect(
            card.getByRole('button', { name: title, exact: true })
        ).toBeVisible();
        await dismissCoverMenu(page, card);
    } finally {
        await closeElectronApp(app);
    }
});
