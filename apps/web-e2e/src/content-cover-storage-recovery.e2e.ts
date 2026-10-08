import { expect, test } from './mock-provider.fixture';
import {
    addXtreamPortal,
    interceptXtreamRequests,
    MOCK_SERVER,
} from './xtream-series-playback.fixture';

for (const failure of ['denied', 'malformed'] as const) {
    test(`@xtream cover membership stays unknown after ${failure} storage and recovers through Retry`, async ({
        page,
        context,
        request,
    }) => {
        test.setTimeout(90000);
        await request.post(`${MOCK_SERVER}/reset`);
        await page.goto('/');
        await interceptXtreamRequests(page);
        const movieResponse = await request.get(
            `${MOCK_SERVER}/player_api.php?username=minimal&password=minimal&action=get_vod_streams`
        );
        expect(movieResponse.ok()).toBe(true);
        const movies = await movieResponse.json();
        // The mock regenerates names per request. Keep the same provider rows
        // across the reload so this journey measures storage recovery.
        await page.route(
            (url) => url.searchParams.get('action') === 'get_vod_streams',
            (route) =>
                route.fulfill({
                    json: { payload: movies, action: 'get_vod_streams' },
                })
        );
        await addXtreamPortal(page, {
            name: 'Cover storage recovery',
            username: 'minimal',
            password: 'minimal',
        });
        const seedCard = page.locator('app-grid-list mat-card').first();
        await expect(seedCard).toBeVisible();
        const title = await seedCard
            .locator('.grid-card-primary')
            .getAttribute('aria-label');
        if (!title) throw new Error('Missing catalogue activation title');
        const card = page.locator('app-grid-list mat-card').filter({
            has: page.getByRole('button', { name: title, exact: true }),
        });
        const menu = card.locator('app-content-cover-actions button');
        await menu.click();
        const favorite = page.locator(
            '[data-test-id="content-cover-action-favorite"]'
        );
        await expect(favorite).toBeEnabled();
        await favorite.click();
        await expect(
            card.locator('[data-test-id="content-cover-favorite"]')
        ).toBeVisible();
        const original = await page.evaluate(() =>
            localStorage.getItem('xtream-favorites')
        );
        if (!original) throw new Error('Favourite was not persisted');
        const catalogUrl = page.url();
        if (failure === 'denied') {
            await context.addInitScript(() => {
                const read = Storage.prototype.getItem;
                Storage.prototype.getItem = function (key: string) {
                    if (
                        key === 'xtream-favorites' &&
                        read.call(this, 'cover-test-deny-read') === 'true'
                    )
                        throw new DOMException(
                            'Synthetic storage failure',
                            'SecurityError'
                        );
                    return read.call(this, key);
                };
            });
            await page.evaluate(() =>
                localStorage.setItem('cover-test-deny-read', 'true')
            );
        } else {
            await page.evaluate(() =>
                localStorage.setItem('xtream-favorites', '{malformed')
            );
        }
        await page.goto(catalogUrl);
        await expect(card).toBeVisible();
        await expect(card.locator('.grid-card-primary')).toHaveAttribute(
            'aria-label',
            title
        );
        const alert = page
            .locator('app-category-content-view')
            .getByRole('alert');
        await expect(alert).toContainText('Could not update or load favorites');
        await menu.click();
        await expect(
            page.locator('[data-test-id="content-cover-action-favorite"]')
        ).toHaveCount(0);
        await expect(
            page.locator('[data-test-id="content-cover-action-details"]')
        ).toBeEnabled();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);
        await page.screenshot({
            path: test.info().outputPath('membership-read-failed.png'),
        });
        await page.evaluate(
            ({ original, failure }) => {
                if (failure === 'denied')
                    localStorage.removeItem('cover-test-deny-read');
                else localStorage.setItem('xtream-favorites', original);
            },
            { original, failure }
        );
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(alert).toHaveCount(0);
        await expect(
            card.locator('[data-test-id="content-cover-favorite"]')
        ).toBeVisible();
        await menu.click();
        await expect(
            page.locator('[data-test-id="content-cover-action-favorite"]')
        ).toContainText('Remove');
        await page.keyboard.press('Escape');
        expect(
            await page.evaluate(() => localStorage.getItem('xtream-favorites'))
        ).toBe(original);
        await expect(page.locator('app-portal-inline-player')).toHaveCount(0);
        await page.screenshot({
            path: test.info().outputPath('membership-read-recovered.png'),
        });
    });
}
