import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
    CrossPortalSimilarService,
    type CrossPortalSimilarItem,
} from '@iptvnator/services';
import type { NormalizedVodMeta } from '@iptvnator/shared/interfaces';
import { createVodSimilarMatches } from './vod-similar-matches.state';

@Component({ template: '' })
class DetailOwner {
    readonly meta = signal({
        title: 'First',
        tmdbRecommendations: [{ id: 1 }],
    } as unknown as NormalizedVodMeta);
    readonly matches = createVodSimilarMatches(
        inject(CrossPortalSimilarService),
        this.meta
    );
}

function deferred() {
    let resolve!: (items: CrossPortalSimilarItem[]) => void;
    const promise = new Promise<CrossPortalSimilarItem[]>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe('shared VOD similar match ownership', () => {
    const visible = signal(true);
    const matchRecommendations = jest.fn();
    beforeEach(() => {
        visible.set(true);
        matchRecommendations.mockReset();
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: CrossPortalSimilarService,
                    useValue: {
                        isAvailable: true,
                        matchRecommendations,
                        visible: (items: CrossPortalSimilarItem[]) =>
                            visible() ? items : [],
                    },
                },
            ],
        });
    });

    it('ignores older detail results and filters accepted matches when the source relocks', async () => {
        const first = deferred();
        const second = deferred();
        matchRecommendations
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const fixture = TestBed.createComponent(DetailOwner);
        fixture.detectChanges();
        fixture.componentInstance.meta.set({
            title: 'Second',
            tmdbRecommendations: [{ id: 2 }],
        } as unknown as NormalizedVodMeta);
        fixture.detectChanges();
        const expected = [
            { key: 'second' },
        ] as unknown as CrossPortalSimilarItem[];
        second.resolve(expected);
        await fixture.whenStable();
        first.resolve([
            { key: 'first' },
        ] as unknown as CrossPortalSimilarItem[]);
        await fixture.whenStable();
        expect(fixture.componentInstance.matches()).toEqual(expected);
        visible.set(false);
        expect(fixture.componentInstance.matches()).toEqual([]);
    });

    it('ignores a pending result after its detail owner is destroyed', async () => {
        const pending = deferred();
        matchRecommendations.mockReturnValue(pending.promise);
        const fixture = TestBed.createComponent(DetailOwner);
        fixture.detectChanges();
        const owner = fixture.componentInstance;
        fixture.destroy();
        pending.resolve([
            { key: 'late' },
        ] as unknown as CrossPortalSimilarItem[]);
        await pending.promise;
        expect(owner.matches()).toEqual([]);
    });
});
