import type { BrowserContext, Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import { resolve } from 'node:path';
import type {
    SavedVodDeleteResult,
    SavedVodPlaylist,
    SavedVodPlaylistSummary,
    SavedVodWriteResult,
} from '@iptvnator/shared/interfaces';

export interface SavedVodTestStorage {
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
        SavedVodStorageTest: { storage: SavedVodTestStorage };
    }
}

// Bundle the production adapter for browser fixtures. The application ships no
// test hook and these helpers never substitute a mock for its IndexedDB store.
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

export async function installSavedVodStorageFixture(
    context: BrowserContext
): Promise<void> {
    await context.route('**/__saved-vod-storage-test.js', (route) =>
        route.fulfill({
            contentType: 'application/javascript; charset=utf-8',
            body: bundle,
        })
    );
    await context.route('**/__saved-vod-storage-seed__', (route) =>
        route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><meta charset="utf-8">',
        })
    );
}

export async function attachSavedVodStorage(page: Page): Promise<void> {
    const scriptErrors: string[] = [];
    const collectError = (error: Error) => scriptErrors.push(error.message);
    page.on('pageerror', collectError);
    try {
        await page.addScriptTag({ url: '/__saved-vod-storage-test.js' });
    } finally {
        page.off('pageerror', collectError);
    }
    const ready = await page.evaluate(
        () => typeof window.SavedVodStorageTest?.storage?.get === 'function'
    );
    if (!ready)
        throw new Error(
            `Saved VOD fixture failed to initialize: ${scriptErrors.join('; ') || 'missing browser global'}`
        );
}

/** Seed before the application boots, using the real adapter and its validator. */
export async function seedSavedVodPlaylists(
    page: Page,
    documents: readonly SavedVodPlaylist[]
): Promise<void> {
    await page.goto('/__saved-vod-storage-seed__');
    await attachSavedVodStorage(page);
    for (const document of documents) {
        const result = await saveSavedVodPlaylist(page, document, null);
        if (result.status !== 'saved')
            throw new Error('Saved playlist fixture already exists');
    }
}

export function saveSavedVodPlaylist(
    page: Page,
    document: SavedVodPlaylist,
    revision: number | null
): Promise<SavedVodWriteResult> {
    return page.evaluate(
        ({ document, revision }) =>
            window.SavedVodStorageTest.storage.save(document, revision),
        { document, revision }
    );
}

export function getSavedVodPlaylist(
    page: Page,
    id: string
): Promise<SavedVodPlaylist | null> {
    return page.evaluate(
        (id) => window.SavedVodStorageTest.storage.get(id),
        id
    );
}

export function listSavedVodPlaylists(
    page: Page
): Promise<SavedVodPlaylistSummary[]> {
    return page.evaluate(() => window.SavedVodStorageTest.storage.list());
}
