import {
    computed,
    DestroyRef,
    inject,
    Injectable,
    signal,
} from '@angular/core';
import {
    clearSeriesQueue,
    emptySeriesQueue,
    enqueueSeriesEpisode,
    moveSeriesQueueEpisode,
    removeSeriesQueueEpisode,
    seriesQueueFromHere,
    syncSeriesQueue,
} from '@iptvnator/portal/shared/util';

/** One instance per inline series session. Stores IDs, never stream URLs. */
@Injectable()
export class SeriesPlaybackQueueService {
    readonly state = signal(emptySeriesQueue());
    readonly autoplay = signal(true);
    readonly countdown = signal<number | null>(null);
    readonly next = computed(() => this.state().upcoming[0] ?? null);
    private scope = '';
    private timer: ReturnType<typeof setInterval> | null = null;
    private transitionRequested = false;
    private endedHandled = false;
    private pendingSequence: {
        ids: readonly number[];
        current: number;
    } | null = null;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.cancel());
    }

    sync(scope: string, catalogue: readonly number[], current: number): void {
        const previousNext = this.next();
        if (scope !== this.scope) {
            this.cancel();
            this.state.set(emptySeriesQueue());
            this.scope = scope;
            this.transitionRequested = false;
            this.endedHandled = false;
            this.pendingSequence = null;
        }
        if (this.pendingSequence?.current === current) {
            const pending = this.pendingSequence;
            this.pendingSequence = null;
            this.fromHere(pending.ids, current);
        }
        if (current !== this.state().current) {
            this.cancel();
            this.transitionRequested = false;
            this.endedHandled = false;
            this.pendingSequence = null;
        }
        this.state.update((state) =>
            syncSeriesQueue(state, catalogue, current)
        );
        if (this.next() === null || this.next() !== previousNext) this.cancel();
    }

    setAutoplay(enabled: boolean): void {
        this.autoplay.set(enabled);
        if (!enabled) this.cancel();
    }

    enqueue(id: number, placement: 'next' | 'last'): void {
        this.cancel();
        this.state.update((state) =>
            enqueueSeriesEpisode(state, id, placement)
        );
    }

    remove(id: number): void {
        this.cancel();
        this.state.update((state) => removeSeriesQueueEpisode(state, id));
    }

    move(id: number, direction: -1 | 1): void {
        this.cancel();
        this.state.update((state) =>
            moveSeriesQueueEpisode(state, id, direction)
        );
    }

    clear(): void {
        this.cancel();
        this.pendingSequence = null;
        this.state.update(clearSeriesQueue);
    }

    fromHere(catalogue: readonly number[], id: number): void {
        this.cancel();
        this.transitionRequested = false;
        this.endedHandled = false;
        this.state.set({ ...seriesQueueFromHere(catalogue, id), custom: true });
        this.autoplay.set(true);
    }

    requestFromHere(catalogue: readonly number[], id: number): void {
        this.cancel();
        if (id === this.state().current) this.fromHere(catalogue, id);
        else {
            this.pendingSequence = { ids: [...catalogue], current: id };
            this.transitionRequested = true;
        }
        this.autoplay.set(true);
    }

    launchFailed(): void {
        this.cancel();
        this.transitionRequested = false;
        this.endedHandled = false;
        this.pendingSequence = null;
    }

    ended(play: (id: number) => void): void {
        if (
            !this.autoplay() ||
            this.next() === null ||
            this.timer ||
            this.transitionRequested ||
            this.endedHandled
        )
            return;
        this.endedHandled = true;
        this.countdown.set(5);
        this.timer = setInterval(() => {
            const remaining = (this.countdown() ?? 1) - 1;
            if (remaining <= 0) this.playNow(play);
            else this.countdown.set(remaining);
        }, 1000);
    }

    playNow(play: (id: number) => void): void {
        const id = this.next();
        this.cancel();
        if (id === null || this.transitionRequested) return;
        this.transitionRequested = true;
        try {
            play(id);
        } catch (error) {
            this.launchFailed();
            throw error;
        }
    }

    cancel(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.countdown.set(null);
    }
}
