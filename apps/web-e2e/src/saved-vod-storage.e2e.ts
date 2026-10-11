import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import { expect, test } from './fixtures';
import {
    attachSavedVodStorage,
    installSavedVodStorageFixture,
} from './saved-vod-storage.fixture';

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
    await installSavedVodStorageFixture(context);
});

test('@web saved playlists survive reload and preserve summaries', async ({
    page,
}) => {
    await page.goto('/');
    await attachSavedVodStorage(page);
    expect(
        await page.evaluate(
            (value) => window.SavedVodStorageTest.storage.save(value, null),
            document
        )
    ).toEqual({ status: 'saved', playlist: document });
    await page.reload();
    await attachSavedVodStorage(page);
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
    await attachSavedVodStorage(page);
    await page.evaluate(
        (value) => window.SavedVodStorageTest.storage.save(value, null),
        document
    );
    const second = await context.newPage();
    await second.goto('/');
    await attachSavedVodStorage(second);
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
    await attachSavedVodStorage(page);
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

test('@web sparse progress cannot replace a valid saved list or its summary', async ({
    page,
}) => {
    await page.goto('/');
    await attachSavedVodStorage(page);
    await page.evaluate(
        (value) => window.SavedVodStorageTest.storage.save(value, null),
        document
    );
    const summary = await page.evaluate(() =>
        window.SavedVodStorageTest.storage.list()
    );
    const error = await page.evaluate(async (value) => {
        try {
            await window.SavedVodStorageTest.storage.save(
                {
                    ...value,
                    execution: {
                        id: 'run-1',
                        playbackRevision: 1,
                        entries: value.entries,
                        currentEntryId: value.entries[0].id,
                        progress: Array(1),
                        mode: 'ordered',
                        repeat: 'off',
                        updatedAt: value.updatedAt,
                    },
                },
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
    ).toEqual(summary);
    await page.reload();
    await attachSavedVodStorage(page);
    expect(
        await page.evaluate(() =>
            window.SavedVodStorageTest.storage.get('weekend')
        )
    ).toEqual(document);
    expect(
        await page.evaluate(() => window.SavedVodStorageTest.storage.list())
    ).toEqual(summary);
});
