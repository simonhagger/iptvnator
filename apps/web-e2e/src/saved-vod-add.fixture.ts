import type { Locator, Page } from '@playwright/test';
import type {
    SavedVodPlaylist,
    SavedVodReference,
} from '@iptvnator/shared/interfaces';
import { expect } from './fixtures';
import { setInputValue } from './e2e-helpers';
import {
    attachSavedVodStorage,
    getSavedVodPlaylist,
    listSavedVodPlaylists,
} from './saved-vod-storage.fixture';

export const addControl = (page: Page, action: string) =>
    page.locator(`[data-test-id="saved-vod-add-${action}"]`);

export function emptySavedList(): SavedVodPlaylist {
    return {
        schemaVersion: 1,
        id: 'curated-evening',
        name: 'Curated evening',
        revision: 1,
        entries: [],
        execution: null,
        createdAt: '2026-10-04T12:00:00Z',
        updatedAt: '2026-10-04T12:00:00Z',
    };
}

export function sourceId(page: Page, provider: 'xtreams' | 'stalker'): string {
    const match = new URL(page.url()).pathname.match(
        new RegExp(`/${provider}/([^/]+)`)
    );
    if (!match) throw new Error(`Missing ${provider} source route`);
    return decodeURIComponent(match[1]);
}

export async function openMovieAdd(page: Page): Promise<Locator> {
    const trigger = page.getByTestId('vod-more-menu');
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await page.locator('[data-menu-item="add-to-saved-playlist"]').click();
    await expect(addControl(page, 'save')).toBeVisible();
    return trigger;
}

export async function openEpisodeAdd(page: Page): Promise<void> {
    const episode = page.locator('.episode-card').first();
    await expect(episode).toBeVisible();
    await episode.locator('app-season-episode-menu button').click();
    await page.locator('[data-menu-item="add-to-saved-playlist"]').click();
    await expect(addControl(page, 'save')).toBeVisible();
    await expect(page.locator('app-portal-inline-player')).toHaveCount(0);
}

export async function saveAdd(
    page: Page,
    options: { newName?: string; existingName?: string; duplicate?: boolean }
): Promise<void> {
    const dialog = page.locator('mat-dialog-container');
    if (options.newName) {
        await dialog
            .getByRole('radio', { name: 'New playlist', exact: true })
            .click();
        await setInputValue(addControl(page, 'name'), options.newName);
    } else {
        await dialog
            .getByRole('radio', { name: 'Existing playlist', exact: true })
            .click();
        await addControl(page, 'target').click();
        await page
            .getByRole('option', { name: options.existingName, exact: true })
            .click();
    }
    const duplicate = addControl(page, 'duplicates').locator('input');
    await expect(duplicate).not.toBeChecked();
    if (options.duplicate) await duplicate.check();
    await expect(addControl(page, 'save')).toBeEnabled();
    await addControl(page, 'save').click();
    await expect(dialog).toHaveCount(0);
}

export async function readOnlyList(page: Page): Promise<SavedVodPlaylist> {
    await attachSavedVodStorage(page);
    const summaries = await listSavedVodPlaylists(page);
    expect(summaries).toHaveLength(1);
    const document = await getSavedVodPlaylist(page, summaries[0].id);
    if (!document) throw new Error('Saved list missing after UI submission');
    return document;
}

export async function expectManagerPersistence(
    page: Page,
    name: string,
    references: readonly SavedVodReference[]
): Promise<void> {
    await page.goto('/workspace/saved-playlists');
    await expect(
        page
            .locator('[data-test-id="saved-vod-list"]')
            .filter({ hasText: name })
    ).toBeVisible();
    await page
        .locator('[data-test-id="saved-vod-list"]')
        .filter({ hasText: name })
        .click();
    await expect(page.locator('app-saved-vod-entry-row')).toHaveCount(
        references.length
    );
    await page.reload();
    await expect(page.locator('app-saved-vod-entry-row')).toHaveCount(
        references.length
    );
    const document = await readOnlyList(page);
    expect(document.entries.map((entry) => entry.reference)).toEqual(
        references
    );
    expect(new Set(document.entries.map((entry) => entry.id)).size).toBe(
        references.length
    );
}

/** Deliberate metadata fixtures exercise the three distinct Stalker catalog paths.
 * Commands and fake URLs are present upstream to prove they never enter storage. */
export async function interceptStalkerSavedCatalog(page: Page): Promise<void> {
    await page.route('**/localhost:3000/stalker**', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        if (params.get('action') !== 'get_ordered_list')
            return route.fallback();
        const movieId = params.get('movie_id');
        const type = params.get('type');
        let data: unknown[];
        if (type === 'series') {
            data = movieId
                ? [
                      {
                          id: 'raw-regular-season',
                          name: 'Season 1',
                          cmd: 'ffmpeg https://private.test/regular',
                          series: [1, 2],
                      },
                  ]
                : [
                      {
                          id: '2001',
                          name: 'Saved regular series',
                          category_id: '2001',
                          cmd: 'ffmpeg https://private.test/regular',
                      },
                  ];
        } else if (type === 'vod') {
            data = !movieId
                ? [
                      {
                          id: 'opaque-movie',
                          name: 'Saved Stalker movie',
                          o_name: 'Saved Stalker movie',
                          category_id: '2001',
                          cmd: 'ffmpeg https://private.test/movie',
                          is_series: 0,
                      },
                      {
                          id: '3001',
                          name: 'Saved embedded series',
                          o_name: 'Saved embedded series',
                          category_id: '2001',
                          cmd: 'ffmpeg https://private.test/embedded',
                          series: [1, 2],
                          is_series: 0,
                      },
                      {
                          id: '4001',
                          name: 'Saved lazy series',
                          o_name: 'Saved lazy series',
                          category_id: '2001',
                          is_series: '1',
                      },
                  ]
                : params.has('season_id')
                  ? [
                        {
                            id: 'raw-lazy-episode',
                            is_episode: true,
                            series_number: 1,
                            name: 'Saved lazy premiere',
                        },
                    ]
                  : [
                        {
                            id: 'raw-lazy-season',
                            video_id: movieId,
                            name: 'Season 1',
                            season_number: '1',
                            is_season: true,
                        },
                    ];
        } else return route.fallback();
        return route.fulfill({
            json: {
                payload: {
                    js: { data, total_items: data.length, max_page_items: 20 },
                },
            },
        });
    });
}

export async function openCatalogTitle(
    page: Page,
    title: string
): Promise<void> {
    const card = page
        .locator('app-grid-list mat-card')
        .filter({ hasText: title })
        .first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
}
