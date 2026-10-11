import type { Page } from '@playwright/test';
import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import { expect, test } from './fixtures';
import { setInputValue } from './e2e-helpers';
import {
    attachSavedVodStorage,
    getSavedVodPlaylist,
    installSavedVodStorageFixture,
    listSavedVodPlaylists,
    saveSavedVodPlaylist,
    seedSavedVodPlaylists,
} from './saved-vod-storage.fixture';

const managerPath = '/workspace/saved-playlists';
const mixed: SavedVodPlaylist = {
    schemaVersion: 1,
    id: 'mixed-weekend',
    name: 'Mixed weekend',
    revision: 1,
    entries: [
        {
            id: 'movie-first',
            title: 'Opening film',
            reference: {
                provider: 'xtream',
                sourceId: 'missing-xtream',
                kind: 'movie',
                contentId: '42',
            },
        },
        {
            id: 'episode-second',
            title: 'Middle episode',
            reference: {
                provider: 'stalker',
                sourceId: 'missing-stalker',
                kind: 'episode',
                seriesId: '201',
                seasonId: '202',
                seriesMode: 'series',
                seasonNumber: 2,
                episodeNumber: 4,
            },
        },
        {
            id: 'movie-last',
            title: 'Closing film',
            reference: {
                provider: 'stalker',
                sourceId: 'missing-stalker',
                kind: 'movie',
                contentId: '43',
            },
        },
    ],
    execution: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
};

const control = (page: Page, action: string) =>
    page.locator(`[data-test-id="saved-vod-${action}"]`);
const heading = (page: Page) => control(page, 'detail-heading');
const rows = (page: Page) => page.locator('app-saved-vod-entry-row');
const row = (page: Page, id: string) =>
    page.locator(`app-saved-vod-entry-row[data-entry-id="${id}"]`);
const rowControl = (page: Page, id: string, action: string) =>
    row(page, id).locator(`[data-test-id="saved-vod-entry-${action}"]`);

async function openManager(page: Page): Promise<void> {
    await page.goto(managerPath);
    await expect(page).toHaveURL(new RegExp(`${managerPath}$`));
    await expect(control(page, 'new')).toBeEnabled();
    await attachSavedVodStorage(page);
}

async function acceptName(page: Page, value: string): Promise<void> {
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible();
    const input = dialog.locator('[data-test-id="saved-vod-name"]');
    await setInputValue(input, value);
    await expect(input).toHaveValue(value);
    await dialog.locator('[data-test-id="saved-vod-name-save"]').click();
    await expect(dialog).toHaveCount(0);
}

async function reloadManager(page: Page): Promise<void> {
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${managerPath}$`));
    await expect(control(page, 'new')).toBeEnabled();
    await attachSavedVodStorage(page);
}

async function occurrenceIds(page: Page): Promise<string[]> {
    return rows(page).evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-entry-id') ?? '')
    );
}

test.use({ locale: 'en-US' });
test.beforeEach(async ({ context }) => {
    await installSavedVodStorageFixture(context);
});
test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const state = await page
        .evaluate(async () => ({
            path: location.pathname,
            notice:
                document
                    .querySelector('[data-test-id="saved-vod-notice"]')
                    ?.getAttribute('data-notice-code') ?? null,
            fixtureReady:
                typeof window.SavedVodStorageTest?.storage?.get === 'function',
            summaries: window.SavedVodStorageTest
                ? await window.SavedVodStorageTest.storage.list()
                : null,
        }))
        .catch(() => null);
    await testInfo.attach('saved-vod-failure-state', {
        contentType: 'application/json',
        body: JSON.stringify(state),
    });
});

test('@web saved playlist naming, duplication and deletion persist through application reloads', async ({
    page,
}) => {
    await openManager(page);
    await control(page, 'new').click();
    await acceptName(page, '   Friday films   ');
    await expect(heading(page)).toHaveText('Friday films');
    const initial = await listSavedVodPlaylists(page);
    expect(initial).toHaveLength(1);
    const originalId = initial[0].id;
    expect(initial[0].name).toBe('Friday films');
    const created = await getSavedVodPlaylist(page, originalId);
    if (!created) throw new Error('Missing created playlist');
    // Add actions are a later slice; seed mixed content through the production
    // adapter so Duplicate must create new occurrence IDs for actual entries.
    expect(
        (
            await saveSavedVodPlaylist(
                page,
                { ...created, entries: mixed.entries },
                created.revision
            )
        ).status
    ).toBe('saved');

    await reloadManager(page);
    await expect(heading(page)).toHaveText('Friday films');
    await control(page, 'rename').click();
    await acceptName(page, '  Weekend films  ');
    await expect(heading(page)).toHaveText('Weekend films');
    expect((await getSavedVodPlaylist(page, originalId))?.name).toBe(
        'Weekend films'
    );

    await control(page, 'duplicate').click();
    await acceptName(page, 'Sunday films');
    await expect(heading(page)).toHaveText('Sunday films');
    const summaries = await listSavedVodPlaylists(page);
    expect(summaries.map((summary) => summary.name).sort()).toEqual([
        'Sunday films',
        'Weekend films',
    ]);
    const copy = summaries.find((summary) => summary.name === 'Sunday films');
    if (!copy) throw new Error('Missing duplicated playlist');
    expect(copy.id).not.toBe(originalId);
    const copied = await getSavedVodPlaylist(page, copy.id);
    expect(copied?.entries.map((entry) => entry.reference)).toEqual(
        mixed.entries.map((entry) => entry.reference)
    );
    expect(copied?.entries.map((entry) => entry.title)).toEqual(
        mixed.entries.map((entry) => entry.title)
    );
    expect(
        copied?.entries
            .map((entry) => entry.id)
            .some((id) => mixed.entries.some((entry) => entry.id === id))
    ).toBe(false);

    await reloadManager(page);
    const copyButton = page.locator(
        `[data-test-id="saved-vod-list"][data-list-id="${copy.id}"]`
    );
    await copyButton.click();
    await expect(heading(page)).toHaveText('Sunday films');
    await control(page, 'delete').click();
    const confirmation = page.locator('mat-dialog-container');
    await expect(confirmation).toBeVisible();
    expect(await getSavedVodPlaylist(page, copy.id)).not.toBeNull();
    await confirmation
        .locator('[data-test-id="confirm-dialog-confirm"]')
        .click();
    await expect(copyButton).toHaveCount(0);
    await expect(heading(page)).toHaveText('Weekend films');

    await reloadManager(page);
    await expect(heading(page)).toHaveText('Weekend films');
    expect(await getSavedVodPlaylist(page, copy.id)).toBeNull();
    expect(
        (await listSavedVodPlaylists(page)).map((summary) => summary.id)
    ).toEqual([originalId]);
});

test('@web mixed saved content supports keyboard reorder, removal and confirmed clear with identity-preserving Undo', async ({
    page,
}) => {
    await seedSavedVodPlaylists(page, [mixed]);
    await openManager(page);
    await expect(heading(page)).toHaveText(mixed.name);
    await expect(rows(page)).toHaveCount(3);
    expect(await occurrenceIds(page)).toEqual(
        mixed.entries.map((entry) => entry.id)
    );

    const up = rowControl(page, 'episode-second', 'up');
    await up.focus();
    await up.press('Enter');
    await expect
        .poll(() => occurrenceIds(page))
        .toEqual(['episode-second', 'movie-first', 'movie-last']);
    await expect(rowControl(page, 'episode-second', 'up')).toBeDisabled();
    const down = rowControl(page, 'episode-second', 'down');
    await expect(down).toBeFocused();
    await down.press('Space');
    await expect
        .poll(() => occurrenceIds(page))
        .toEqual(['movie-first', 'episode-second', 'movie-last']);
    await expect(down).toBeFocused();

    const remove = rowControl(page, 'episode-second', 'remove');
    await remove.focus();
    await remove.press('Enter');
    await expect(row(page, 'episode-second')).toHaveCount(0);
    await expect(rowControl(page, 'movie-last', 'remove')).toBeFocused();
    const remaining = (await getSavedVodPlaylist(page, mixed.id))?.entries;
    expect(remaining?.map((entry) => entry.id)).toEqual([
        'movie-first',
        'movie-last',
    ]);

    await control(page, 'clear').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    expect((await getSavedVodPlaylist(page, mixed.id))?.entries).toEqual(
        remaining
    );

    await control(page, 'clear').click();
    await page
        .locator('mat-dialog-container [data-test-id="confirm-dialog-confirm"]')
        .click();
    await expect(rows(page)).toHaveCount(0);
    await expect(control(page, 'undo')).toBeEnabled();
    expect((await getSavedVodPlaylist(page, mixed.id))?.entries).toEqual([]);
    await control(page, 'undo').click();
    await expect(rows(page)).toHaveCount(2);
    expect((await getSavedVodPlaylist(page, mixed.id))?.entries).toEqual(
        remaining
    );
    await expect(control(page, 'undo')).toHaveCount(0);

    await reloadManager(page);
    await expect(rows(page)).toHaveCount(2);
    expect(await occurrenceIds(page)).toEqual(['movie-first', 'movie-last']);
    expect((await getSavedVodPlaylist(page, mixed.id))?.entries).toEqual(
        remaining
    );
});

test('@web a stale manager edit reports the concurrent winner and never overwrites it', async ({
    page,
    context,
}) => {
    await seedSavedVodPlaylists(page, [mixed]);
    await openManager(page);
    await expect(heading(page)).toHaveText(mixed.name);
    const second = await context.newPage();
    await openManager(second);
    await expect(heading(second)).toHaveText(mixed.name);

    await control(page, 'rename').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible();
    await control(second, 'rename').click();
    await acceptName(second, 'Concurrent winner');
    await expect(heading(second)).toHaveText('Concurrent winner');
    const winning = await getSavedVodPlaylist(second, mixed.id);
    expect(winning?.revision).toBe(2);

    await acceptName(page, 'Stale attempted name');
    const notice = control(page, 'notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute(
        'data-notice-code',
        'changed-elsewhere'
    );
    await expect(heading(page)).toHaveText('Concurrent winner');
    expect(await getSavedVodPlaylist(page, mixed.id)).toEqual(winning);

    await control(page, 'refresh').click();
    await expect(notice).toHaveCount(0);
    await expect(heading(page)).toHaveText('Concurrent winner');
    await reloadManager(page);
    await expect(heading(page)).toHaveText('Concurrent winner');
    expect(await getSavedVodPlaylist(page, mixed.id)).toEqual(winning);
    await second.close();
});
