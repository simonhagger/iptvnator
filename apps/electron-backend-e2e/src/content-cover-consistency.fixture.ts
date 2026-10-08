import type { Locator, Page } from '@playwright/test';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import {
    clickCategoryById,
    clickCategoryByNameExact,
    contentCardByTitle,
    expect,
    expectPathname,
    expectWorkspaceSearchScope,
    fillWorkspaceSearch,
    goToDashboard,
    openSettings,
    openSettingsSection,
    openWorkspaceSection,
    saveSettings,
    test,
} from './electron-test-fixtures';
import { goBackFromDetail } from './dashboard-e2e-flows';

export async function selectCoverCategory(
    page: Page,
    provider: 'xtream' | 'stalker',
    category: { categoryId: string; categoryName: string }
): Promise<void> {
    if (provider === 'stalker') {
        await clickCategoryById(page, category.categoryId);
    } else {
        await clickCategoryByNameExact(page, category.categoryName);
    }
}

export async function captureCover(
    page: Page,
    card: Locator,
    name: string,
    withMenu = false
): Promise<void> {
    const cardPath = test.info().outputPath(`${name}.png`);
    await card.screenshot({ path: cardPath });
    await test.info().attach(name, {
        path: cardPath,
        contentType: 'image/png',
    });
    if (withMenu) {
        const trigger = await openCoverMenu(page, card);
        // Capture the finished surface, rather than a translucent opening frame.
        await page.getByRole('menu').evaluate(async (element) => {
            await Promise.all(
                element
                    .getAnimations({ subtree: true })
                    .map((animation) =>
                        animation.finished.catch(() => undefined)
                    )
            );
        });
        const menuPath = test.info().outputPath(`${name}-menu.png`);
        await page.screenshot({ path: menuPath });
        await test.info().attach(`${name}-menu`, {
            path: menuPath,
            contentType: 'image/png',
        });
        const item = page
            .getByRole('menu')
            .locator(
                '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
            )
            .first();
        await item.focus();
        await item.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);
        await expect(trigger).toBeFocused();
    }
}

/** Exercises Settings persistence, including its unsaved-changes dialog. */
export async function configureCoverSettings(
    page: Page,
    theme: 'light' | 'dark',
    titles = true
): Promise<void> {
    await openSettings(page);
    await openSettingsSection(page, 'general');
    await page
        .getByTestId(theme === 'light' ? 'LIGHT_THEME' : 'DARK_THEME')
        .click();
    await page
        .getByTestId('cover-titles-toggle')
        .locator('input')
        .setChecked(titles);
    await openSettingsSection(page, 'playback');
    await page.getByTestId('select-video-player').click();
    await page.getByTestId('html5').click();
    if (await page.getByTestId('save-settings').isVisible())
        await saveSettings(page);
    await expect(page.locator('body')).toHaveClass(
        theme === 'dark' ? /dark-theme/ : /^(?!.*dark-theme)/
    );
}

/** Covers are local fixtures; external poster hosts never affect the result. */
export async function routeCoverArtwork(
    page: Page,
    fail = false
): Promise<void> {
    await page.route(
        (url) => url.hostname === 'picsum.photos',
        (route) =>
            fail
                ? route.fulfill({ status: 404, body: '' })
                : route.fulfill({
                      contentType: 'image/svg+xml',
                      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#385166"/><path d="M20 240L100 70L180 240Z" fill="#f2cf69"/></svg>',
                  })
    );
}

export function catalogCard(page: Page, title: string): Locator {
    return page.locator('app-grid-list mat-card').filter({
        has: page.getByRole('button', { name: title, exact: true }),
    });
}

/** Check rendered bounds so stylesheet specificity cannot hide a content label. */
export async function expectCoverTypeClearOfControls(
    card: Locator
): Promise<void> {
    const badge = card.locator('.type-badge');
    await expect(badge).toBeVisible();
    const overlaps = await card.evaluate((element) => {
        const type = element
            .querySelector('.type-badge')!
            .getBoundingClientRect();
        return [
            ...element.querySelectorAll<HTMLElement>(
                '[data-test-id="content-cover-favorite"], [data-test-id="content-cover-watch"], [data-test-id="content-cover-rating"], app-content-cover-actions button'
            ),
        ]
            .filter((control) => {
                const bounds = control.getBoundingClientRect();
                return (
                    bounds.width > 0 &&
                    bounds.height > 0 &&
                    Math.min(type.right, bounds.right) >
                        Math.max(type.left, bounds.left) &&
                    Math.min(type.bottom, bounds.bottom) >
                        Math.max(type.top, bounds.top)
                );
            })
            .map((control) => control.getAttribute('data-test-id'));
    });
    expect(overlaps).toEqual([]);
}

export async function firstCatalogTitle(page: Page): Promise<string> {
    const card = page.locator('app-grid-list mat-card').first();
    await expect(card).toBeVisible();
    // Read the accessible activation name; titles-off removes the text row.
    const title = await card.evaluate((element) =>
        (
            element.getAttribute('aria-label') ??
            element
                .querySelector('[role="button"]')
                ?.getAttribute('aria-label') ??
            ''
        ).trim()
    );
    expect(title).not.toBe('');
    return title;
}

export async function openCoverMenu(
    page: Page,
    card: Locator
): Promise<Locator> {
    const trigger = card.locator('app-content-cover-actions button').first();
    await expect(trigger).toBeEnabled();
    // A retained pointer over a status badge can open a delayed tooltip above
    // the menu. Exercise keyboard dismissal with the pointer on app chrome.
    const header = page.locator('app-workspace-shell-header');
    await expect(header).toBeVisible();
    const bounds = await header.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error('Workspace header has no pointer target');
    await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
    );
    await expect(
        page.locator('.cdk-overlay-pane.mat-mdc-tooltip-panel')
    ).toHaveCount(0);
    await trigger.focus();
    await trigger.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(
        page
            .getByRole('menu')
            .locator(
                '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
            )
            .first()
    ).toBeFocused();
    await expect(page.locator('app-portal-inline-player')).toHaveCount(0);
    return trigger;
}

export async function dismissCoverMenu(
    page: Page,
    card: Locator
): Promise<void> {
    const beforeUrl = page.url();
    const trigger = await openCoverMenu(page, card);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(page.url()).toBe(beforeUrl);
    await expect(page.locator('app-content-hero')).toHaveCount(0);
}

export async function selectCoverAction(
    page: Page,
    card: Locator,
    action: 'details' | 'favorite' | 'remove' | 'mark-watched'
): Promise<void> {
    await openCoverMenu(page, card);
    await page.getByTestId(`content-cover-action-${action}`).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Represents an existing saved resume row through the real Electron IPC API. */
export async function persistCoverPosition(
    page: Page,
    playlistId: string,
    position: PlaybackPositionData
): Promise<void> {
    await page.evaluate(
        async ({ playlistId, position }) => {
            const result = await window.electron.dbSavePlaybackPosition(
                playlistId,
                position
            );
            if (!result.success)
                throw new Error('Saving the cover position failed');
        },
        { playlistId, position }
    );
}

/** Verify a UI mutation reached storage through the real Electron IPC API. */
export async function expectSavedCoverPosition(
    page: Page,
    playlistId: string,
    position: PlaybackPositionData
): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                ({ playlistId, position }) =>
                    window.electron.dbGetPlaybackPosition(
                        playlistId,
                        position.contentXtreamId,
                        position.contentType
                    ),
                { playlistId, position }
            )
        )
        .toMatchObject({ ...position });
}

export async function expectCoverState(
    card: Locator,
    state: 'in-progress' | 'watched',
    progress?: number,
    progressScope: 'title' | 'episode' = 'title'
): Promise<void> {
    await expect(card.getByTestId('content-cover-favorite')).toBeVisible();
    await expect(card.getByTestId('content-cover-watch')).toHaveAttribute(
        'data-watch-state',
        state
    );
    await expect(
        card.getByRole('img', {
            name: state === 'watched' ? 'watched' : 'Started',
            exact: true,
        })
    ).toBeVisible();
    const activation = card.locator(
        '.content-card__activation, .grid-card-primary, .rail__card-link'
    );
    await expect(activation).toHaveCount(1);
    await expect(activation).toHaveAttribute('aria-describedby', /\S+/);
    const progressLabel =
        progressScope === 'episode'
            ? 'Current episode progress'
            : 'Viewing progress';
    const watchLabel = state === 'watched' ? 'watched' : 'Started';
    await expect(activation).toHaveAccessibleDescription(
        new RegExp(
            `Favorite.*${watchLabel}` +
                (progress === undefined
                    ? ''
                    : `.*${progressLabel}: ${progress}%`)
        )
    );
    if (progressScope === 'episode') {
        await expect(activation).not.toHaveAccessibleDescription(/Watched/);
    }
    if (progress !== undefined) {
        const bar = card.getByTestId('content-cover-progress');
        await expect(bar).toHaveAttribute('role', 'progressbar');
        await expect(bar).toHaveAttribute('aria-valuenow', String(progress));
    }
}

/** The collection omits its type selector when only a Series bucket remains. */
export async function expectSeriesOnlyFavorites(
    page: Page,
    seriesTitle: string
): Promise<void> {
    await expect(page.locator('.content-toggle')).toHaveCount(0);
    await expect(
        page.getByRole('button', {
            name: 'Clear Series favorites',
            exact: true,
        })
    ).toBeVisible();
    await expectCoverState(
        contentCardByTitle(page, seriesTitle).first(),
        'in-progress',
        100,
        'episode'
    );
}

/** Unknown collection metadata stays absent; a known rating must not drift. */
export async function expectAvailableRating(
    card: Locator,
    catalogRating: string | null,
    expectedSource?: string | null
): Promise<void> {
    const rating = card.getByTestId('content-cover-rating');
    if ((await rating.count()) > 0) {
        expect(catalogRating).not.toBeNull();
        await expect(rating).toHaveAttribute('role', 'img');
        await expect(rating).toHaveText(catalogRating!);
        await expect(rating).toHaveAttribute('aria-label', /rating/i);
        if (expectedSource) {
            await expect(rating).toHaveAttribute(
                'data-rating-source',
                expectedSource
            );
        }
    }
}

/** Real source search and Back flows, using the workspace's persisted query. */
export async function exerciseCoverSearch(
    page: Page,
    options: {
        provider: 'xtream' | 'stalker';
        movieTitle: string;
        seriesTitle: string;
        movieRating: string | null;
        movieRatingSource: string | null;
        seriesRating: string | null;
        seriesRatingSource: string | null;
    }
): Promise<void> {
    const { provider, movieTitle, seriesTitle } = options;
    if (provider === 'stalker') {
        await openWorkspaceSection(page, 'Advanced search');
        await expectPathname(page, /\/workspace\/stalker\/[^/]+\/search$/);
        await expectWorkspaceSearchScope(page, 'Advanced search');
    } else {
        // This is the existing Xtream playlist-search journey from Dashboard.
        await goToDashboard(page);
    }
    await fillWorkspaceSearch(page, movieTitle, {
        submit: provider === 'xtream',
    });
    const searchRoute =
        provider === 'stalker'
            ? /\/workspace\/stalker\/[^/]+\/search$/
            : /\/workspace\/xtreams\/[^/]+\/search$/;
    const searchInput = page.locator(
        'app-workspace-shell-header .search-field input[type="search"]'
    );
    const expectSearch = async (title: string) => {
        await expectPathname(page, searchRoute);
        await expect
            .poll(() => new URL(page.url()).searchParams.get('q'))
            .toBe(title);
        await expect(searchInput).toHaveValue(title);
        await expect(page.locator('app-content-hero')).toHaveCount(0);
    };
    await expectSearch(movieTitle);
    const movie = contentCardByTitle(page, movieTitle).first();
    await expectCoverState(movie, 'in-progress', 40);
    await expectAvailableRating(
        movie,
        options.movieRating,
        options.movieRatingSource
    );
    await expectCoverTypeClearOfControls(movie);
    await dismissCoverMenu(page, movie);
    await selectCoverAction(page, movie, 'details');
    await expect(page.locator('app-content-hero')).toContainText(movieTitle);
    await page
        .getByRole('button', { name: /remove from favorites/i })
        .first()
        .click();
    await goBackFromDetail(page);
    await expectSearch(movieTitle);
    await expect(movie.getByTestId('content-cover-favorite')).toHaveCount(0);
    await expect(
        movie.locator('.content-card__activation')
    ).toHaveAccessibleDescription(/Started.*Viewing progress: 40%/);
    await expect(
        movie.locator('.content-card__activation')
    ).not.toHaveAccessibleDescription(/Favorite/);
    await selectCoverAction(page, movie, 'favorite');
    await expectCoverState(movie, 'in-progress', 40);

    if (provider === 'stalker') {
        // The real portal search supports one content-type filter at a time.
        await page
            .locator('app-search-layout')
            .getByRole('checkbox', { name: 'Series', exact: true })
            .check();
    }
    await fillWorkspaceSearch(page, seriesTitle, {
        submit: provider === 'xtream',
    });
    await expectSearch(seriesTitle);
    const series = contentCardByTitle(page, seriesTitle).first();
    await expectCoverState(series, 'in-progress', 100, 'episode');
    await expectAvailableRating(
        series,
        options.seriesRating,
        options.seriesRatingSource
    );
    await expectCoverTypeClearOfControls(series);
    await selectCoverAction(page, series, 'details');
    await expect(page.locator('app-content-hero')).toContainText(seriesTitle);
    await goBackFromDetail(page);
    await expectSearch(seriesTitle);
    await expectCoverState(series, 'in-progress', 100, 'episode');
    await fillWorkspaceSearch(page, '');
}
