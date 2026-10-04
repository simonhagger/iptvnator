import {
    DestroyRef,
    computed,
    effect,
    inject,
    signal,
    untracked,
    type Signal,
} from '@angular/core';
import type {
    CrossPortalSimilarItem,
    CrossPortalSimilarService,
} from '@iptvnator/services';
import type { NormalizedVodMeta } from '@iptvnator/shared/interfaces';

/** Async recommendation ownership stays with the current detail and component. */
export function createVodSimilarMatches(
    service: CrossPortalSimilarService,
    meta: Signal<NormalizedVodMeta>
) {
    const matches = signal<CrossPortalSimilarItem[]>([]);
    let alive = true;
    let generation = 0;
    inject(DestroyRef).onDestroy(() => {
        alive = false;
        generation++;
    });
    effect(() => {
        const recommendations = meta().tmdbRecommendations;
        const request = ++generation;
        untracked(() => {
            matches.set([]);
            if (!recommendations?.length || !service.isAvailable) return;
            void service
                .matchRecommendations(recommendations, 'movie')
                .then((items) => {
                    if (alive && request === generation) matches.set(items);
                });
        });
    });
    return computed(() => service.visible(matches()));
}
