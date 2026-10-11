import { expect, test } from './fixtures';
import {
    interceptXtreamRequests,
    MOCK_SERVER,
    playFirstSeriesEpisode,
    rewriteSeriesEpisodesToMp4,
    routeEpisodeClip,
    selectWebPlayer,
} from './xtream-series-playback.fixture';

// Mock requests must reach Playwright routing, including in a production PWA.
test.use({ serviceWorkers: 'block' });

test('@xtream show page offers queue controls before playback and transfers a season queue', async ({
    page,
    request,
    browserName,
}) => {
    test.skip(browserName !== 'chromium', 'Media fixture targets Chromium.');
    await request.post(`${MOCK_SERVER}/reset`);
    await page.goto('/');
    await interceptXtreamRequests(page);
    await routeEpisodeClip(page);
    await rewriteSeriesEpisodesToMp4(page);
    await selectWebPlayer(page, 'HTML5 video player');
    await playFirstSeriesEpisode(page, request, false);
    const starter = page.locator('[data-testid="series-queue-start"]');
    await expect(starter).toBeVisible();
    await expect(page.locator('app-portal-inline-player')).toHaveCount(0);
    await starter
        .getByRole('button', { name: 'Play season', exact: true })
        .click();
    const queue = page.locator('[data-testid="series-playback-queue"]');
    await expect(queue).toBeVisible();
    await expect(starter).toHaveCount(0);
    await queue.getByRole('button', { name: /Playback queue/ }).click();
    await expect(queue.locator('.series-queue__row')).toHaveCount(7);
    await expect(page.locator('.player-shell__episode-meta')).toContainText(
        'S01E01'
    );
});

test('@xtream series queue promotes an episode, cancels continuation and honours Clear', async ({
    page,
    request,
    browserName,
}) => {
    test.skip(browserName !== 'chromium', 'Media fixture targets Chromium.');
    await request.post(`${MOCK_SERVER}/reset`);
    await page.goto('/');
    await interceptXtreamRequests(page);
    await routeEpisodeClip(page);
    await rewriteSeriesEpisodesToMp4(page);
    await selectWebPlayer(page, 'HTML5 video player');
    const { playerView, video } = await playFirstSeriesEpisode(page, request);
    const queue = page.locator('[data-testid="series-playback-queue"]');
    await expect(queue).toBeVisible();
    await queue.getByRole('button', { name: /Playback queue/ }).click();
    await queue.locator('mat-select').click();
    await page.getByRole('option', { name: /S01E03/ }).click();
    await queue.getByRole('button', { name: 'Play next', exact: true }).click();
    await expect(queue.locator('.series-queue__row').first()).toContainText(
        'S01E03'
    );
    await playerView.hover();
    await playerView
        .locator('[data-test-id="player-controls-next-episode"]')
        .click();
    await expect(page.locator('.player-shell__episode-meta')).toContainText(
        'S01E03'
    );
    await expect
        .poll(() => video.evaluate((el) => (el as HTMLVideoElement).readyState))
        .toBeGreaterThan(0);
    await video.evaluate(async (el) => {
        const media = el as HTMLVideoElement;
        media.currentTime = Math.max(0, media.duration - 0.25);
        await media.play();
    });
    await expect(queue.locator('.series-queue__countdown')).toBeVisible();
    await queue.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(queue.locator('.series-queue__countdown')).toBeHidden();
    await queue
        .getByRole('button', { name: 'Clear queue', exact: true })
        .click();
    await expect(queue).toContainText('No episodes queued');
    await video.evaluate((el) => el.dispatchEvent(new Event('ended')));
    await expect(queue.locator('.series-queue__countdown')).toBeHidden();
    await expect(page.locator('.player-shell__episode-meta')).toContainText(
        'S01E03'
    );
});
