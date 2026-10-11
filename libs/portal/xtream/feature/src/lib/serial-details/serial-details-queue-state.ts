import { signal } from '@angular/core';
import type { SeriesQueueLaunchEvent } from '@iptvnator/portal/shared/util';

/** Owns the one-time queue seed and fences acknowledgements of older starts. */
export class SerialDetailsQueueState {
    readonly initial = signal<readonly number[] | null>(null);
    readonly launch = signal<SeriesQueueLaunchEvent | null>(null);
    private seedEpisode: number | null = null;
    private revision = 0;

    seed(ids: readonly number[], episode: number): void {
        this.initial.set([...ids]);
        this.seedEpisode = episode;
    }

    requested(episode: number): number {
        if (episode !== this.seedEpisode) this.discardSeed();
        const revision = ++this.revision;
        this.launch.set({ revision, phase: 'requested' });
        return revision;
    }

    settle(revision: number, phase: 'confirmed' | 'failed'): void {
        if (this.launch()?.revision !== revision) return;
        if (phase === 'failed') this.discardSeed();
        else this.seedEpisode = null;
        this.launch.set({ revision: ++this.revision, phase });
    }

    reset(): void {
        this.discardSeed();
        this.revision += 1;
        this.launch.set(null);
    }

    discardSeed(): void {
        this.initial.set(null);
        this.seedEpisode = null;
    }
}
