import { buildSync } from 'esbuild';
import { resolve } from 'node:path';
import type {
    SavedVodDeleteResult,
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';
import { expect, test } from './fixtures';

interface TestStorage {
    save(
        document: SavedVodPlaylist,
        revision: number | null
    ): Promise<SavedVodWriteResult>;
    get(id: string): Promise<SavedVodPlaylist | null>;
    list(): Promise<SavedVodPlaylistSummary[]>;
    delete(id: string, revision: number): Promise<SavedVodDeleteResult>;
}
declare global {
    interface Window {
        SavedVodStorageTest: { storage: TestStorage };
    }
}

// Exercise the production adapter in a real browser, including IDB transaction
// lifetime and cross-window writes, without exposing test hooks in the app.
const bundle = buildSync({
    stdin: {
        contents: `import { BrowserSavedVodPlaylists } from './libs/portal/shared/data-access/src/lib/saved-vod-playlists/browser-saved-vod-playlists'; export const storage = new BrowserSavedVodPlaylists();`,
        resolveDir: resolve(__dirname, '../../..'),
        loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'SavedVodStorageTest',
    tsconfig: resolve(__dirname, '../../../tsconfig.base.json'),
}).outputFiles[0].text;

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
                sourceId: 'source-1',
                kind: 'movie',
                contentId: '42',
            },
        },
    ],
    execution: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
};

test.beforeEach(async ({ context }) => {
    await context.route('**/__saved-vod-storage-test.js', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: bundle })
    );
});

test('@web saved playlists survive reload and preserve summaries', async ({
    page,
}) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    expect(
        await page.evaluate(
            (value) => window.SavedVodStorageTest.storage.save(value, null),
            document
        )
    ).toEqual({ status: 'saved', playlist: document });
    await page.reload();
    await page.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    expect(
        await page.evaluate(() =>
            window.SavedVodStorageTest.storage.get('weekend')
        )
    ).toEqual(document);
    expect(
        await page.evaluate(() => window.SavedVodStorageTest.storage.list())
    ).toEqual([
        {
            id: 'weekend',
            name: 'Weekend',
            revision: 1,
            entryCount: 1,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        },
    ]);
});

test('@web competing saved playlist edits retain exactly one winning revision', async ({
    page,
    context,
}) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    await page.evaluate(
        (value) => window.SavedVodStorageTest.storage.save(value, null),
        document
    );
    const second = await context.newPage();
    await second.goto('/');
    await second.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    const results = await Promise.all([
        page.evaluate(
            (value) => window.SavedVodStorageTest.storage.save(value, 1),
            { ...document, name: 'First edit' }
        ),
        second.evaluate(
            (value) => window.SavedVodStorageTest.storage.save(value, 1),
            { ...document, name: 'Second edit' }
        ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
        'conflict',
        'saved',
    ]);
    const winning = results.find((result) => result.status === 'saved');
    if (!winning || winning.status !== 'saved')
        throw new Error('Missing saved revision');
    expect(
        await page.evaluate(() =>
            window.SavedVodStorageTest.storage.get('weekend')
        )
    ).toEqual(winning.playlist);
    expect(
        await second.evaluate(() =>
            window.SavedVodStorageTest.storage.delete('weekend', 1)
        )
    ).toMatchObject({ status: 'conflict' });
    expect(
        await second.evaluate(() =>
            window.SavedVodStorageTest.storage.delete('weekend', 2)
        )
    ).toEqual({ status: 'deleted' });
    expect(
        await page.evaluate(() => window.SavedVodStorageTest.storage.list())
    ).toEqual([]);
    await second.close();
});

test('@web invalid edits leave both document and summary unchanged', async ({
    page,
}) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    await page.evaluate(
        (value) => window.SavedVodStorageTest.storage.save(value, null),
        document
    );
    const error = await page.evaluate(async (value) => {
        try {
            await window.SavedVodStorageTest.storage.save(
                { ...value, name: '' },
                1
            );
        } catch {
            return 'invalid';
        }
        return 'unexpected success';
    }, document);
    expect(error).toBe('invalid');
    expect(
        await page.evaluate(() =>
            window.SavedVodStorageTest.storage.get('weekend')
        )
    ).toEqual(document);
    expect(
        await page.evaluate(() => window.SavedVodStorageTest.storage.list())
    ).toHaveLength(1);
});
