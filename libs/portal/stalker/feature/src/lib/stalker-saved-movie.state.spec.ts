import { signal, type Signal } from '@angular/core';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import {
    createStalkerVodItem,
    type VodDetailsItem,
} from '@iptvnator/shared/interfaces';
import { createStalkerSavedMovieState } from './stalker-saved-movie.state';

describe('Stalker saved movie ownership', () => {
    const movie = createStalkerVodItem(
        { id: 'movie-a', cmd: 'private', info: { name: 'A movie' } } as never,
        'source-a'
    );
    const item = signal<VodDetailsItem | null>(movie);
    const eligible = signal(true);
    const source = signal<string | null>('source-a');
    const open = jest.fn();
    let owner: Signal<string>;
    let state: ReturnType<typeof createStalkerSavedMovieState>;
    beforeEach(() => {
        open.mockReset();
        item.set(movie);
        eligible.set(true);
        source.set('source-a');
        state = createStalkerSavedMovieState(
            item,
            eligible,
            {
                bindOwner: (value: Signal<string>) => {
                    owner = value;
                },
                open,
            } as unknown as SavedVodAddDialogLauncherService,
            source
        );
    });

    it('adds a non-numeric Stalker provider ID without transport data', () => {
        expect(state.available()).toBe(true);
        state.add(movie);
        expect(open).toHaveBeenCalledWith([
            {
                title: 'A movie',
                reference: {
                    provider: 'stalker',
                    sourceId: 'source-a',
                    kind: 'movie',
                    contentId: 'movie-a',
                },
            },
        ]);
    });

    it('rejects missing or mismatched local source and invalidates the owner', () => {
        expect(owner()).not.toBe('');
        source.set(null);
        state.add(movie);
        expect(state.available()).toBe(false);
        expect(owner()).toBe('');
        source.set('source-b');
        state.add(movie);
        expect(open).not.toHaveBeenCalled();
    });

    it('rejects stale item events and series presentation', () => {
        item.set(
            createStalkerVodItem(
                { ...movie.data, id: 'movie-b' } as never,
                'source-a'
            )
        );
        state.add(movie);
        expect(open).not.toHaveBeenCalled();
        eligible.set(false);
        expect(state.available()).toBe(false);
        expect(owner()).toBe('');
    });

    it('does not offer Add when provider movie identity is missing', () => {
        item.set(
            createStalkerVodItem({ ...movie.data, id: '' } as never, 'source-a')
        );
        expect(state.available()).toBe(false);
    });
});
