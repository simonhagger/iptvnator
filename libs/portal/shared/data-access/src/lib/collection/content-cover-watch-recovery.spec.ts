import { TestBed } from '@angular/core/testing';
import { PORTAL_PLAYBACK_POSITIONS } from '@iptvnator/portal/shared/util';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { ContentCoverDataService } from './content-cover-data.service';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';

describe('provider cover watch recovery', () => {
    let service: ContentCoverDataService;
    let read: jest.Mock;
    let favoriteRead: jest.Mock;
    beforeEach(() => {
        read = jest.fn().mockResolvedValue([]);
        favoriteRead = jest.fn().mockResolvedValue([]);
        TestBed.configureTestingModule({
            providers: [
                ContentCoverDataService,
                {
                    provide: UnifiedFavoritesDataService,
                    useValue: { getFavoritesStrict: favoriteRead },
                },
                {
                    provide: PORTAL_PLAYBACK_POSITIONS,
                    useValue: { getAllPlaybackPositions: read },
                },
            ],
        });
        service = TestBed.inject(ContentCoverDataService);
    });

    it('does not retry watch scopes removed from the represented results', async () => {
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        await service.loadWatchPositions([]);
        await service.retry();
        expect(read.mock.calls).toEqual([['a']]);
    });

    it('keeps favorite actions available while watch-only failure exposes progress Retry until success', async () => {
        read.mockRejectedValueOnce(new Error('private')).mockRejectedValueOnce(
            new Error('private')
        );
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        const item = {
            uid: 'x',
            name: 'Film',
            contentType: 'movie' as const,
            sourceType: 'xtream' as const,
            playlistId: 'a',
            playlistName: 'Portal',
            xtreamId: 7,
        };
        expect(service.failed()).toBe(false);
        expect(service.favoriteFor(item)).toBe(false);
        expect(service.actionsFor(item).map((action) => action.id)).toEqual([
            'details',
            'favorite',
        ]);
        expect(service.watchReadFailed()).toBe(true);
        expect(service.coverReadFailed()).toBe(true);
        expect(service.failureMessageKey()).toBe('COVER.PROGRESS_FAILED');
        await service.retry();
        expect(service.failed()).toBe(false);
        expect(service.watchReadFailed()).toBe(true);
        expect(service.coverReadFailed()).toBe(true);
        await service.retry();
        expect(service.watchReadFailed()).toBe(false);
        expect(service.coverReadFailed()).toBe(false);
        expect(
            service.indicatorsForProvider(
                { provider: 'xtream', playlistId: 'a', contentType: 'movie' },
                { stream_id: 7 }
            ).watchState
        ).toBe('unwatched');
        expect(read.mock.calls).toEqual([['a'], ['a'], ['a']]);
        expect(service.watchReadFailed).not.toHaveProperty('set');
        expect(service.coverReadFailed).not.toHaveProperty('set');
    });

    it('does not hide a watch failure after membership alone recovers', async () => {
        favoriteRead.mockRejectedValueOnce(new Error('private'));
        read.mockRejectedValue(new Error('private'));
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        expect(service.failed()).toBe(true);
        await service.retry();
        expect(service.failed()).toBe(false);
        expect(service.watchReadFailed()).toBe(true);
        expect(service.coverReadFailed()).toBe(true);
    });

    it('tracks failures per represented playlist, never erasing a different failed read', async () => {
        read.mockImplementation(async (id: string) => {
            if (id === 'a') throw new Error('private');
            return [];
        });
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a', 'b']);
        expect(service.watchReadFailed()).toBe(true);
        await service.loadWatchPositions(['b']);
        expect(service.watchReadFailed()).toBe(false);
        await service.retry();
        expect(read.mock.calls).toEqual([['a'], ['b'], ['b']]);
    });

    it.each(['scope', 'disposal', 'removal'] as const)(
        'ignores obsolete failed reads after %s',
        async (kind) => {
            let reject!: (error: Error) => void;
            read.mockReturnValueOnce(
                new Promise<PlaybackPositionData[]>((_resolve, fail) => {
                    reject = fail;
                })
            );
            await service.load({ scope: 'all' });
            const pending = service.loadWatchPositions(['a']);
            if (kind === 'scope')
                await service.load({ scope: 'playlist', playlistId: 'b' });
            else if (kind === 'disposal') TestBed.resetTestingModule();
            else await service.loadWatchPositions([]);
            reject(new Error('private'));
            await pending;
            expect(service.watchReadFailed()).toBe(false);
            expect(service.coverReadFailed()).toBe(false);
        }
    );

    it('rejects an old request after the removed playlist is reintroduced with a newer successful read', async () => {
        let reject!: (error: Error) => void;
        read.mockReturnValueOnce(
            new Promise<PlaybackPositionData[]>((_resolve, fail) => {
                reject = fail;
            })
        );
        await service.load({ scope: 'all' });
        const old = service.loadWatchPositions(['a']);
        await service.loadWatchPositions([]);
        await service.loadWatchPositions(['a']);
        reject(new Error('private'));
        await old;
        expect(service.watchReadFailed()).toBe(false);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('does not show removed-source progress after its reintroduced read fails', async () => {
        const context = {
            provider: 'xtream' as const,
            playlistId: 'a',
            contentType: 'movie',
        };
        read.mockResolvedValueOnce([
            {
                playlistId: 'a',
                contentType: 'vod',
                contentXtreamId: 7,
                positionSeconds: 95,
                durationSeconds: 100,
            },
        ]);
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        expect(
            service.indicatorsForProvider(context, { stream_id: 7 }).progress
        ).toBe(95);
        await service.loadWatchPositions([]);
        read.mockRejectedValueOnce(new Error('private'));
        await service.loadWatchPositions(['a']);
        expect(service.watchReadFailed()).toBe(true);
        expect(
            service.indicatorsForProvider(context, { stream_id: 7 }).watchState
        ).toBeUndefined();
    });

    it('preserves the newer represented source while Retry awaits membership', async () => {
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        let resolve!: (rows: never[]) => void;
        favoriteRead.mockReturnValueOnce(
            new Promise<never[]>((done) => {
                resolve = done;
            })
        );
        const retry = service.retry();
        read.mockRejectedValueOnce(new Error('private'));
        await service.loadWatchPositions(['b']);
        resolve([]);
        await retry;
        expect(read.mock.calls).toEqual([['a'], ['b']]);
        expect(service.watchReadFailed()).toBe(true);
        await service.retry();
        expect(read.mock.calls).toEqual([['a'], ['b'], ['b']]);
        expect(service.watchReadFailed()).toBe(false);
    });

    it('retains the favorite-specific message when positions succeed but membership rejects', async () => {
        favoriteRead.mockRejectedValue(new Error('private'));
        await service.load({ scope: 'all' });
        await service.loadWatchPositions(['a']);
        expect(service.watchReadFailed()).toBe(false);
        expect(service.coverReadFailed()).toBe(true);
        expect(service.failureMessageKey()).toBe('COVER.FAVORITES_FAILED');
    });
});
