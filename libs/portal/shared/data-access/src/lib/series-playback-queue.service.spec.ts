import { TestBed } from '@angular/core/testing';
import { SeriesPlaybackQueueService } from './series-playback-queue.service';

describe('series queue session', () => {
    let queue: SeriesPlaybackQueueService;
    beforeEach(() => {
        jest.useFakeTimers();
        TestBed.configureTestingModule({
            providers: [SeriesPlaybackQueueService],
        });
        queue = TestBed.inject(SeriesPlaybackQueueService);
        queue.sync('playlist:series', [1, 2, 3], 1);
    });
    afterEach(() => {
        TestBed.resetTestingModule();
        jest.useRealTimers();
    });
    it('waits five seconds and ignores duplicate ended events', () => {
        const play = jest.fn();
        queue.ended(play);
        queue.ended(play);
        jest.advanceTimersByTime(4000);
        expect(play).not.toHaveBeenCalled();
        expect(queue.countdown()).toBe(1);
        jest.advanceTimersByTime(1000);
        expect(play).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledWith(2);
        queue.ended(play);
        jest.advanceTimersByTime(5000);
        expect(play).toHaveBeenCalledTimes(1);
    });
    it.each(['cancel', 'clear'] as const)(
        '%s stops pending advancement',
        (action) => {
            const play = jest.fn();
            queue.ended(play);
            queue[action]();
            jest.advanceTimersByTime(5000);
            expect(play).not.toHaveBeenCalled();
        }
    );
    it('autoplay off prevents scheduling and cancels an existing countdown', () => {
        const play = jest.fn();
        queue.ended(play);
        queue.setAutoplay(false);
        queue.ended(play);
        jest.advanceTimersByTime(5000);
        expect(play).not.toHaveBeenCalled();
    });
    it('manual episode changes cancel the old timer', () => {
        const play = jest.fn();
        queue.ended(play);
        queue.sync('playlist:series', [1, 2, 3], 3);
        jest.advanceTimersByTime(5000);
        expect(play).not.toHaveBeenCalled();
    });
    it('scope changes reset edits and timers', () => {
        const play = jest.fn();
        queue.clear();
        queue.sync('other:series', [4, 5], 4);
        expect(queue.next()).toBe(5);
        queue.ended(play);
        queue.sync('third:series', [6, 7], 6);
        jest.advanceTimersByTime(5000);
        expect(play).not.toHaveBeenCalled();
    });
    it('play now emits once and advances only after the host confirms a new episode', () => {
        const play = jest.fn();
        queue.playNow(play);
        queue.playNow(play);
        expect(play.mock.calls).toEqual([[2]]);
        expect(queue.state().current).toBe(1);
        queue.sync('playlist:series', [1, 2, 3], 2);
        queue.playNow(play);
        expect(play.mock.calls).toEqual([[2], [3]]);
    });
    it('play season preserves an explicit subset when the catalogue refreshes', () => {
        queue.fromHere([1, 2], 1);
        queue.sync('playlist:series', [1, 2, 3], 1);
        expect(queue.state().upcoming).toEqual([2]);
    });
    it('destroy cancels timers', () => {
        const play = jest.fn();
        queue.ended(play);
        TestBed.resetTestingModule();
        jest.advanceTimersByTime(5000);
        expect(play).not.toHaveBeenCalled();
    });
    it('a duplicate ended notification cannot undo Cancel', () => {
        const play = jest.fn();
        queue.ended(play);
        queue.cancel();
        queue.ended(play);
        jest.advanceTimersByTime(5000);
        expect(play).not.toHaveBeenCalled();
    });
});
