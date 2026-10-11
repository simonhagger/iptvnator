import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import type { SeriesQueueStartRequest } from '@iptvnator/ui/playback';
import { StalkerSeriesViewComponent } from './stalker-series-view.component';
import { createStalkerSeriesViewHarness } from './stalker-series-view.test-harness';
import {
    seriesFixtureLifecycle,
    StubPortalInlinePlayerComponent,
} from './stalker-series-view.test-helpers';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

describe('Stalker series queue seed lifecycle', () => {
    let fixture: ComponentFixture<StalkerSeriesViewComponent>;
    const { createFixture, resolveVodPlayback, isEmbeddedPlayer } =
        createStalkerSeriesViewHarness(() => jest.fn());
    const { stabilize, settleStart } = seriesFixtureLifecycle(() => fixture);
    const component = () => fixture.componentInstance;

    function request(index = 0) {
        const episodes = component().mappedSeasons()['1'];
        const episode = episodes[index];
        return {
            ids: episodes.slice(index).map((item) => Number(item.id)),
            episode: {
                id: Number(episode.id),
                label: `S01E0${index + 1}`,
                title: episode.title,
                thumbnailUrl: null,
                progressPercent: null,
                isPlaying: false,
                episode,
            },
        } satisfies SeriesQueueStartRequest;
    }

    function playback(episodeId: number): ResolvedPortalPlayback {
        return {
            streamUrl: `https://stalker.example/episode-${episodeId}.mpg`,
            title: 'Selected episode',
            contentInfo: {
                playlistId: 'stalker-1',
                contentXtreamId: episodeId,
                contentType: 'episode',
                seriesXtreamId: 30001,
            },
        };
    }

    beforeEach(async () => {
        fixture = await createFixture();
        isEmbeddedPlayer.mockReturnValue(true);
        await stabilize();
    });

    afterEach(() => fixture.destroy());

    it('keeps a successful chosen seed through the first inline launch', async () => {
        const selected = request();
        component().startSeriesQueue(selected);
        await settleStart();
        expect(component().initialSeriesQueue()).toEqual(selected.ids);
        expect(component().seriesQueueLaunch()?.phase).toBe('confirmed');
        const player = fixture.debugElement.query(
            By.directive(StubPortalInlinePlayerComponent)
        ).componentInstance as StubPortalInlinePlayerComponent;
        expect(player.initialSeriesQueue()).toEqual(selected.ids);

        component().onEpisodeClicked(request(1).episode.episode);
        expect(component().initialSeriesQueue()).toBeNull();
        await settleStart();
    });

    it('discards a pending season seed when a different manual episode supersedes it', async () => {
        const first = deferred<ResolvedPortalPlayback>();
        resolveVodPlayback.mockReturnValueOnce(first.promise);
        const selected = request();
        const manual = request(1).episode;
        component().startSeriesQueue(selected);
        expect(component().initialSeriesQueue()).toEqual(selected.ids);

        component().onEpisodeClicked(manual.episode);
        expect(component().initialSeriesQueue()).toBeNull();
        await settleStart();
        first.resolve(playback(selected.episode.id));
        await settleStart();
        expect(component().inlinePlayback()?.contentInfo?.contentXtreamId).toBe(
            manual.id
        );
        expect(component().initialSeriesQueue()).toBeNull();
    });

    it('clears a failed first seed and permits a manual retry', async () => {
        const failure = deferred<ResolvedPortalPlayback>();
        resolveVodPlayback.mockReturnValueOnce(failure.promise);
        const selected = request();
        component().startSeriesQueue(selected);
        failure.reject(new Error('portal unavailable'));
        await settleStart();
        expect(component().seriesQueueLaunch()?.phase).toBe('failed');
        expect(component().initialSeriesQueue()).toBeNull();

        component().onEpisodeClicked(selected.episode.episode);
        await settleStart();
        expect(component().seriesQueueLaunch()?.phase).toBe('confirmed');
        expect(component().initialSeriesQueue()).toBeNull();
    });

    it('close clears the seed and a late resolution cannot reopen playback', async () => {
        const pending = deferred<ResolvedPortalPlayback>();
        resolveVodPlayback.mockReturnValueOnce(pending.promise);
        const selected = request();
        component().startSeriesQueue(selected);
        component().closeInlinePlayer();
        expect(component().initialSeriesQueue()).toBeNull();
        pending.resolve(playback(selected.episode.id));
        await settleStart();
        expect(component().inlinePlayback()).toBeNull();
        expect(component().initialSeriesQueue()).toBeNull();
    });

    it('a stale failure cannot discard a newer successful seed', async () => {
        const older = deferred<ResolvedPortalPlayback>();
        resolveVodPlayback.mockReturnValueOnce(older.promise);
        component().startSeriesQueue(request());
        const newer = request(1);
        component().startSeriesQueue(newer);
        await settleStart();
        const confirmed = component().seriesQueueLaunch();
        older.reject(new Error('superseded request failed'));
        await settleStart();
        expect(component().initialSeriesQueue()).toEqual(newer.ids);
        expect(component().seriesQueueLaunch()).toBe(confirmed);
        expect(component().inlinePlayback()?.contentInfo?.contentXtreamId).toBe(
            newer.episode.id
        );
    });
});
