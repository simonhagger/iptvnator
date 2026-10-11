import type { APIRequestContext, Page } from '@playwright/test';
import type {
    SavedVodReference,
    XtreamSerieEpisode,
} from '@iptvnator/shared/interfaces';
import { expect, test } from './fixtures';
import {
    installSavedVodStorageFixture,
    seedSavedVodPlaylists,
} from './saved-vod-storage.fixture';
import {
    addStalkerPortal,
    addXtreamPortal,
    interceptPwaProviderRequests,
    XTREAM_MOCK_SERVER,
} from './sources-pwa.helpers';
import {
    addControl,
    emptySavedList,
    expectManagerPersistence,
    interceptStalkerSavedCatalog,
    openCatalogTitle,
    openEpisodeAdd,
    openMovieAdd,
    readOnlyList,
    saveAdd,
    sourceId,
} from './saved-vod-add.fixture';

type CatalogItem = { name: string; stream_id?: number; series_id?: number };
type Category = { category_id: string; category_name: string };
const diagnostics = new WeakMap<Page, string[]>();

async function xtreamCatalog(
    request: APIRequestContext,
    type: 'vod' | 'series'
): Promise<{ category: Category; items: CatalogItem[] }> {
    const api = `${XTREAM_MOCK_SERVER}/player_api.php?username=user1&password=pass1`;
    const categoryResponse = await request.get(
        `${api}&action=get_${type}_categories`
    );
    expect(categoryResponse.ok()).toBe(true);
    const categories: Category[] = await categoryResponse.json();
    const category = categories[0];
    const response = await request.get(
        `${api}&action=${type === 'vod' ? 'get_vod_streams' : 'get_series'}&category_id=${category.category_id}`
    );
    expect(response.ok()).toBe(true);
    const items: CatalogItem[] = await response.json();
    return { category, items };
}

async function openXtreamItem(
    page: Page,
    category: Category,
    item: CatalogItem
): Promise<void> {
    await page
        .locator('.context-panel .category-item')
        .filter({ hasText: category.category_name })
        .first()
        .click();
    await openCatalogTitle(page, item.name);
}

test.use({ locale: 'en-US', serviceWorkers: 'block' });
test.beforeEach(async ({ context, page }) => {
    const messages: string[] = [];
    diagnostics.set(page, messages);
    page.on('pageerror', (error) => messages.push(error.message));
    page.on('requestfailed', (request) => {
        const url = new URL(request.url());
        messages.push(
            `${url.origin}${url.pathname} ${url.searchParams.get('action') ?? ''}: ${request.failure()?.errorText}`
        );
    });
    page.on('response', (response) => {
        const url = new URL(response.url());
        if (/provider-targets|xtream|app-config/.test(url.pathname))
            messages.push(
                `${url.origin}${url.pathname} ${url.searchParams.get('action') ?? ''}: HTTP ${response.status()}`
            );
    });
    await installSavedVodStorageFixture(context);
    // The static PWA defaults to the public gateway. Use its supported runtime
    // config seam so the existing local provider intercepts also cover this build.
    await page.route('**/assets/app-config.js', (route) =>
        route.fulfill({
            contentType: 'application/javascript',
            body: 'window.__IPTVNATOR_CONFIG__ = { BACKEND_URL: "http://localhost:3000" };',
        })
    );
    await interceptPwaProviderRequests(page);
});
test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('saved-vod-add-diagnostics', {
            contentType: 'application/json',
            body: JSON.stringify(diagnostics.get(page)),
        });
    }
});

test('@web @xtream individual movie and episode Add persists mixed content, deduplicates by default and permits explicit occurrences', async ({
    page,
    request,
}) => {
    const movie = await xtreamCatalog(request, 'vod');
    const series = await xtreamCatalog(request, 'series');
    await page.goto('/');
    await addXtreamPortal(page, 'Saved Xtream source');
    const ownedSource = sourceId(page, 'xtreams');
    const catalogPath = new URL(page.url()).pathname;
    await openXtreamItem(page, movie.category, movie.items[0]);
    const movieReference: SavedVodReference = {
        provider: 'xtream',
        sourceId: ownedSource,
        kind: 'movie',
        contentId: String(movie.items[0].stream_id),
    };
    await openMovieAdd(page);
    await saveAdd(page, { newName: '  Mixed evening  ' });
    const created = await readOnlyList(page);
    expect(created.name).toBe('Mixed evening');
    expect(created.entries).toHaveLength(1);
    expect(created.entries[0].reference).toEqual(movieReference);
    expect(created.entries[0].title).toBe(movie.items[0].name);

    await openMovieAdd(page);
    await saveAdd(page, { existingName: created.name });
    const deduplicated = await readOnlyList(page);
    expect(deduplicated).toEqual(created); // no-op retains IDs and revision
    await openMovieAdd(page);
    await saveAdd(page, { existingName: created.name, duplicate: true });
    const duplicated = await readOnlyList(page);
    expect(duplicated.entries).toHaveLength(2);
    expect(duplicated.entries[0]).toEqual(created.entries[0]);
    expect(duplicated.entries[1].reference).toEqual(movieReference);
    expect(duplicated.entries[1].id).not.toBe(created.entries[0].id);

    await page.goto(catalogPath.replace(/\/vod.*$/, '/series'));
    await openXtreamItem(page, series.category, series.items[0]);
    const infoResponse = await request.get(
        `${XTREAM_MOCK_SERVER}/player_api.php?username=user1&password=pass1&action=get_series_info&series_id=${series.items[0].series_id}`
    );
    expect(infoResponse.ok()).toBe(true);
    const info: { episodes: Record<string, XtreamSerieEpisode[]> } =
        await infoResponse.json();
    const episode = info.episodes['1'][0];
    const episodeReference: SavedVodReference = {
        provider: 'xtream',
        sourceId: ownedSource,
        kind: 'episode',
        seriesId: String(series.items[0].series_id),
        contentId: String(episode.id),
        seasonNumber: episode.season,
        episodeNumber: episode.episode_num,
    };
    await openEpisodeAdd(page);
    await saveAdd(page, { existingName: created.name });
    const mixed = await readOnlyList(page);
    expect(mixed.entries[2].title).toBe(episode.title);
    expect(Object.keys(mixed.entries[2]).sort()).toEqual([
        'id',
        'reference',
        'title',
    ]);
    await expectManagerPersistence(page, created.name, [
        movieReference,
        movieReference,
        episodeReference,
    ]);
});

test('@web @xtream cancelling Add restores focus and changing the owning route disposes the dialog without saving stale content', async ({
    page,
    request,
}) => {
    const movie = await xtreamCatalog(request, 'vod');
    const seeded = emptySavedList();
    await seedSavedVodPlaylists(page, [seeded]);
    await page.goto('/');
    await addXtreamPortal(page, 'Ownership source');
    const ownedSource = sourceId(page, 'xtreams');
    await openXtreamItem(page, movie.category, movie.items[0]);
    const trigger = await openMovieAdd(page);
    await page
        .locator('mat-dialog-container')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await readOnlyList(page)).toEqual(seeded);

    await openMovieAdd(page);
    await addControl(page, 'target').click();
    await page.getByRole('option', { name: seeded.name, exact: true }).click();
    await expect(addControl(page, 'save')).toBeEnabled();
    await page.goBack(); // Angular popstate disposes the owner; no full app reload
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    expect(await readOnlyList(page)).toEqual(seeded);
    await openCatalogTitle(page, movie.items[1].name);
    await openMovieAdd(page);
    await saveAdd(page, { existingName: seeded.name });
    await expectManagerPersistence(page, seeded.name, [
        {
            provider: 'xtream',
            sourceId: ownedSource,
            kind: 'movie',
            contentId: String(movie.items[1].stream_id),
        },
    ]);
});

const stalkerModes = [
    {
        mode: 'series' as const,
        title: 'Saved regular series',
        catalog: 'series',
        id: '2001',
        season: 'raw-regular-season',
        episodeTitle: 'Episode 1',
    },
    {
        mode: 'vod-series' as const,
        title: 'Saved embedded series',
        catalog: 'vod',
        id: '3001',
        season: '3001',
        episodeTitle: 'Episode 1',
    },
    {
        mode: 'vod-series' as const,
        title: 'Saved lazy series',
        catalog: 'vod',
        id: '4001',
        season: 'raw-lazy-season',
        episodeTitle: 'Saved lazy premiere',
    },
];

for (const mode of stalkerModes) {
    test(`@web @stalker ${mode.title}: Add keeps raw season identity and catalog origin through reload`, async ({
        page,
    }) => {
        const seeded = emptySavedList();
        await seedSavedVodPlaylists(page, [seeded]);
        await interceptStalkerSavedCatalog(page);
        await page.goto('/');
        await addStalkerPortal(page, 'Saved Stalker source');
        const ownedSource = sourceId(page, 'stalker');
        const vodPath = new URL(page.url()).pathname;
        const references: SavedVodReference[] = [];
        if (mode.catalog === 'series') {
            await openCatalogTitle(page, 'Saved Stalker movie');
            await openMovieAdd(page);
            await saveAdd(page, { existingName: seeded.name });
            references.push({
                provider: 'stalker',
                sourceId: ownedSource,
                kind: 'movie',
                contentId: 'opaque-movie',
            });
            await page.goto(vodPath.replace(/\/vod.*$/, '/series'));
        }
        await openCatalogTitle(page, mode.title);
        await openEpisodeAdd(page);
        await saveAdd(page, { existingName: seeded.name });
        references.push({
            provider: 'stalker',
            sourceId: ownedSource,
            kind: 'episode',
            seriesId: mode.id,
            seriesMode: mode.mode,
            seasonId: mode.season,
            seasonNumber: 1,
            episodeNumber: 1,
        });
        const saved = await readOnlyList(page);
        expect(saved.entries[saved.entries.length - 1]?.title).toBe(
            mode.episodeTitle
        );
        expect(saved.entries.map((entry) => entry.reference)).toEqual(
            references
        );
        expect(JSON.stringify(saved)).not.toMatch(
            /private\.test|ffmpeg|raw-lazy-episode|originalCmd|custom_sid|password|username/
        );
        await expectManagerPersistence(page, seeded.name, references);
    });
}
