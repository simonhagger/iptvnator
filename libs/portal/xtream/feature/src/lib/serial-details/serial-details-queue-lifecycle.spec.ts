import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SeriesPlaybackQueueService } from '@iptvnator/portal/shared/data-access';
import type {
    ExternalPlayerSession,
    XtreamSerieEpisode,
} from '@iptvnator/shared/interfaces';
import type { SeriesQueueStartRequest } from '@iptvnator/ui/playback';
import { SerialDetailsComponent } from './serial-details.component';
import { SerialDetailsPlaybackService } from './serial-details-playback.service';
import {
    configureSerialDetailsTestBed,
    createSerialDetailsStubs,
    resetSerialDetailsStubs,
} from './serial-details.harness';
import { StubPortalInlinePlayerComponent } from './serial-details.test-stubs';

const episode = (id: number): XtreamSerieEpisode =>
    ({
        id: String(id),
        episode_num: id === 1001 ? 1 : 2,
        title: `Episode ${id}`,
        season: 1,
    }) as XtreamSerieEpisode;

const startRequest = (): SeriesQueueStartRequest => ({
    ids: [1001, 1002],
    episode: {
        id: 1001,
        label: 'S01E01',
        title: 'Episode 1',
        thumbnailUrl: null,
        progressPercent: null,
        isPlaying: false,
        episode: episode(1001),
    },
});

const opened = (): ExternalPlayerSession =>
    ({
        id: 'mpv-queue-test',
        player: 'mpv',
        status: 'opened',
        canClose: true,
        contentInfo: {
            playlistId: 'xtream-1',
            contentXtreamId: 1001,
            contentType: 'episode',
            seriesXtreamId: 103,
        },
    }) as ExternalPlayerSession;

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Xtream series queue host lifecycle', () => {
    let fixture: ComponentFixture<SerialDetailsComponent>;
    let playback: SerialDetailsPlaybackService;
    const stubs = createSerialDetailsStubs();

    beforeEach(async () => {
        resetSerialDetailsStubs(stubs);
        stubs.isEmbeddedPlayer.mockReturnValue(true);
        await configureSerialDetailsTestBed(stubs);
        fixture = TestBed.createComponent(SerialDetailsComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        playback = fixture.debugElement.injector.get(
            SerialDetailsPlaybackService
        );
    });

    afterEach(() => fixture.destroy());

    it('passes the first queue seed and confirmed launch to the inline player', async () => {
        fixture.componentInstance.startSeriesQueue(startRequest());
        fixture.detectChanges();
        await fixture.whenStable();
        const player = fixture.debugElement.query(
            By.directive(StubPortalInlinePlayerComponent)
        ).componentInstance as StubPortalInlinePlayerComponent;
        expect(player.initialSeriesQueue()).toEqual([1001, 1002]);
        expect(player.seriesQueueLaunch()?.phase).toBe('confirmed');

        playback.playEpisode(episode(1002));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(player.initialSeriesQueue()).toBeNull();
        expect(player.seriesQueueLaunch()?.phase).toBe('confirmed');
    });

    it('cancels an ended countdown and rearms continuation after same-episode restart', () => {
        const queue = TestBed.runInInjectionContext(
            () => new SeriesPlaybackQueueService()
        );
        playback.playEpisode(episode(1001));
        queue.sync('xtream-1:103', [1001, 1002], 1001);
        queue.handleLaunch(playback.seriesQueueLaunch()!, 1001);
        const playNext = jest.fn();
        queue.ended(playNext);
        expect(queue.countdown()).toBe(5);

        playback.playEpisode(episode(1001), undefined, 0);
        queue.handleLaunch(playback.seriesQueueLaunch()!, 1001);
        expect(queue.countdown()).toBeNull();
        expect(playback.inlinePlayback()?.startTime).toBe(0);
        queue.ended(playNext);
        expect(queue.countdown()).toBe(5);
        queue.cancel();
    });

    it('clears the seed on stream resolution failure and permits retry', () => {
        stubs.constructEpisodeStreamUrl.mockImplementationOnce(() => {
            throw new Error('invalid episode');
        });
        expect(() => playback.startSeriesQueue(startRequest())).toThrow(
            'invalid episode'
        );
        expect(playback.initialSeriesQueue()).toBeNull();
        expect(playback.seriesQueueLaunch()?.phase).toBe('failed');
        playback.playEpisode(episode(1001));
        expect(playback.seriesQueueLaunch()?.phase).toBe('confirmed');
    });

    it('acknowledges a forced external launch only after it settles', async () => {
        const launch = deferred<ExternalPlayerSession>();
        stubs.openExternalPlayback.mockReturnValueOnce(launch.promise);
        const pending = playback.playEpisode(episode(1001), 'mpv');
        await flush();
        expect(playback.seriesQueueLaunch()?.phase).toBe('requested');
        launch.resolve(opened());
        await pending;
        expect(playback.seriesQueueLaunch()?.phase).toBe('confirmed');
    });

    it('keeps zero-offset replacement intent while a forced launch settles', async () => {
        const launch = deferred<ExternalPlayerSession>();
        stubs.openExternalPlayback.mockReturnValueOnce(launch.promise);
        const pending = playback.playEpisode(episode(1001), 'mpv');
        await flush();
        playback.startSeriesQueue(startRequest());
        expect(playback.initialSeriesQueue()).toEqual([1001, 1002]);
        playback.playEpisode(episode(1002), undefined, 0);
        expect(playback.initialSeriesQueue()).toBeNull();
        const requested = playback.seriesQueueLaunch();
        launch.resolve(opened());
        await pending;
        await flush();
        expect(playback.inlinePlayback()?.contentInfo?.contentXtreamId).toBe(
            1002
        );
        expect(playback.inlinePlayback()?.startTime).toBe(0);
        expect(playback.seriesQueueLaunch()?.phase).toBe('confirmed');
        expect(playback.seriesQueueLaunch()?.revision).toBeGreaterThan(
            requested!.revision
        );
    });

    it('reports external failure and ignores a completion after close', async () => {
        const warning = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        const failed = deferred<ExternalPlayerSession>();
        stubs.openExternalPlayback.mockReturnValueOnce(failed.promise);
        const first = playback.playEpisode(
            episode(1001),
            'mpv'
        ) as Promise<unknown>;
        await flush();
        failed.reject(new Error('player unavailable'));
        await expect(first).rejects.toThrow('player unavailable');
        expect(playback.seriesQueueLaunch()?.phase).toBe('failed');

        const late = deferred<ExternalPlayerSession>();
        stubs.openExternalPlayback.mockReturnValueOnce(late.promise);
        const second = playback.playEpisode(episode(1001), 'mpv');
        await flush();
        playback.closeInlinePlayer();
        late.resolve(opened());
        await second;
        expect(playback.seriesQueueLaunch()).toBeNull();
        expect(playback.initialSeriesQueue()).toBeNull();
        warning.mockRestore();
    });
});
