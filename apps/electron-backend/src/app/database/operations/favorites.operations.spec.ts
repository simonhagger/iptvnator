const eqMock = jest.fn((left: unknown, right: unknown) => ({
    kind: 'eq',
    left,
    right,
}));
const whereMock = jest.fn();
const placeholderMock = jest.fn((name: string) => ({
    kind: 'placeholder',
    name,
}));

jest.mock('drizzle-orm', () => ({
    and: jest.fn((...conditions: unknown[]) => ({ kind: 'and', conditions })),
    asc: jest.fn((value: unknown) => ({ kind: 'asc', value })),
    desc: jest.fn((value: unknown) => ({ kind: 'desc', value })),
    eq: (left: unknown, right: unknown) => eqMock(left, right),
    inArray: jest.fn(),
    sql: Object.assign(
        jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
            kind: 'sql',
            strings: Array.from(strings ?? []),
            values,
        })),
        { placeholder: (name: string) => placeholderMock(name) }
    ),
}));

import * as schema from '@iptvnator/shared/database/schema';
import type { AppDatabase } from '../database.types';
import { createDbMock } from './operations.test-helpers';
import {
    getAllGlobalFavorites,
    getAllGlobalFavoriteMembership,
    getFavorites,
    getGlobalFavorites,
    reorderGlobalFavorites,
} from './favorites.operations';

function createGlobalFavoritesDbMock(rows: unknown[]) {
    const query = {
        from: jest.fn(),
        innerJoin: jest.fn(),
        limit: jest.fn(),
        orderBy: jest.fn(),
        then: jest.fn((resolve, reject) =>
            Promise.resolve(rows).then(resolve, reject)
        ),
        where: whereMock,
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.limit.mockImplementation((limit: number) =>
        Promise.resolve(rows.slice(0, limit))
    );
    const select = jest.fn().mockReturnValue(query);

    return {
        db: {
            select,
        } as unknown as AppDatabase,
        query,
        select,
    };
}

describe('favorites.operations', () => {
    beforeEach(() => {
        eqMock.mockClear();
        whereMock.mockClear();
        placeholderMock.mockClear();
    });

    it('filters live global favorites after scanning the small favorites set', async () => {
        const { db, query } = createGlobalFavoritesDbMock([
            {
                id: 1,
                title: 'Saved Movie',
                type: 'movie',
            },
            {
                id: 2,
                title: 'Saved Live Channel',
                type: 'live',
            },
        ]);

        const result = await getGlobalFavorites(db);

        expect(whereMock).not.toHaveBeenCalled();
        expect(query.limit).not.toHaveBeenCalled();
        expect(result).toEqual([
            expect.objectContaining({
                id: 2,
                title: 'Saved Live Channel',
                type: 'live',
            }),
        ]);
    });

    // Regression for issue #1138: archive metadata must survive every
    // favorites projection so catch-up stays available outside Live TV.
    it('selects archive metadata for playlist favorites', async () => {
        const { db, select } = createGlobalFavoritesDbMock([]);

        await getFavorites(db, 'playlist-1');

        expect(select).toHaveBeenCalledWith(
            expect.objectContaining({
                tv_archive: schema.content.tvArchive,
                tv_archive_duration: schema.content.tvArchiveDuration,
            })
        );
    });

    it('selects archive metadata for global favorites', async () => {
        const { db, select } = createGlobalFavoritesDbMock([]);

        await getGlobalFavorites(db);
        await getAllGlobalFavorites(db);

        expect(select).toHaveBeenCalledTimes(2);
        for (const [projection] of select.mock.calls) {
            expect(projection).toEqual(
                expect.objectContaining({
                    tv_archive: schema.content.tvArchive,
                    tv_archive_duration: schema.content.tvArchiveDuration,
                })
            );
        }
    });

    it('keeps membership beyond the display cap with the same metadata projection', async () => {
        const rows = Array.from({ length: 501 }, (_, index) => ({
            id: index + 1,
            xtream_id: index + 1001,
            playlist_id: 'portal-1',
            type: 'movie',
            rating: '8.1',
        }));
        const { db, query, select } = createGlobalFavoritesDbMock(rows);

        const display = await getAllGlobalFavorites(db);
        expect(display).toHaveLength(500);
        expect(query.limit).toHaveBeenCalledWith(500);
        query.limit.mockClear();
        const membership = await getAllGlobalFavoriteMembership(db);
        expect(membership).toEqual(rows);
        expect(membership[500]).toEqual(rows[500]);
        expect(query.limit).not.toHaveBeenCalled();
        expect(select.mock.calls[1][0]).toEqual(select.mock.calls[0][0]);
    });

    describe('reorderGlobalFavorites', () => {
        it('short-circuits without touching the db when there are no updates', async () => {
            const { db, update, transaction } = createDbMock();

            await expect(reorderGlobalFavorites(db, [])).resolves.toEqual({
                success: true,
            });

            expect(update).not.toHaveBeenCalled();
            expect(transaction).not.toHaveBeenCalled();
        });

        it('runs (not executes) the prepared position update per favorite inside a transaction', async () => {
            const { db, updateRun, updateExecute, updatePrepare, transaction } =
                createDbMock();

            await expect(
                reorderGlobalFavorites(db, [
                    { content_id: 30, playlist_id: 'p1', position: 0 },
                    { content_id: 10, playlist_id: 'p1', position: 1 },
                    { content_id: 20, playlist_id: 'p2', position: 2 },
                ])
            ).resolves.toEqual({ success: true });

            expect(updatePrepare).toHaveBeenCalledTimes(1);
            expect(placeholderMock).toHaveBeenCalledWith('position');
            expect(placeholderMock).toHaveBeenCalledWith('contentId');
            // Regression: favorites are playlist-scoped, so the UPDATE must
            // filter by playlistId too — otherwise a same-contentId favorite
            // in another playlist gets its position silently rewritten.
            expect(placeholderMock).toHaveBeenCalledWith('playlistId');
            expect(transaction).toHaveBeenCalledTimes(1);

            // Regression (issue #1137): the prepared UPDATE must be dispatched
            // with synchronous `.run()`. On the better-sqlite3 driver
            // `.execute()` defers the write to a promise that never settles
            // inside the synchronous transaction callback, so favorites
            // positions silently never persist and the custom order is lost.
            expect(updateExecute).not.toHaveBeenCalled();
            expect(updateRun).toHaveBeenNthCalledWith(1, {
                position: 0,
                contentId: 30,
                playlistId: 'p1',
            });
            expect(updateRun).toHaveBeenNthCalledWith(2, {
                position: 1,
                contentId: 10,
                playlistId: 'p1',
            });
            expect(updateRun).toHaveBeenNthCalledWith(3, {
                position: 2,
                contentId: 20,
                playlistId: 'p2',
            });
        });
    });
});
