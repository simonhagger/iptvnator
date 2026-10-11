import { signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import {
    StalkerStore,
    type StalkerMappedEpisode,
} from '@iptvnator/portal/stalker/data-access';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import { SAVED_VOD_ADD_MENU_ITEM } from '@iptvnator/ui/components';
import { StalkerSeriesSavedEpisodePresenter } from './stalker-series-saved-episode.presenter';

describe('Stalker series saved episode presentation', () => {
    const playlist = signal<{ _id: string } | null>({ _id: 'stalker-1' });
    const seriesId = signal<unknown>('parent:raw');
    const seriesMode = signal<'series' | 'vod-series'>('series');
    const episodes = signal<Record<string, XtreamSerieEpisode[]>>({});
    const open = jest.fn();
    let owner: Signal<string>;
    let presenter: StalkerSeriesSavedEpisodePresenter;
    let episode: StalkerMappedEpisode;

    beforeEach(() => {
        playlist.set({ _id: 'stalker-1' });
        seriesId.set('parent:raw');
        seriesMode.set('series');
        open.mockClear();
        episode = {
            id: '991122',
            season: 5,
            episode_num: 4,
            title: 'Episode Four',
            providerSeasonId: 'season:provider:raw',
            originalCmd: '/media/private.mpg',
            originalId: 'provider-episode',
            custom_sid: 'regular-series',
        } as StalkerMappedEpisode;
        episodes.set({ '5': [episode] });
        TestBed.configureTestingModule({
            providers: [
                StalkerSeriesSavedEpisodePresenter,
                {
                    provide: StalkerStore,
                    useValue: { currentPlaylist: playlist },
                },
                {
                    provide: SavedVodAddDialogLauncherService,
                    useValue: {
                        open,
                        bindOwner: (value: Signal<string>) => (owner = value),
                    },
                },
            ],
        });
        presenter = TestBed.inject(StalkerSeriesSavedEpisodePresenter);
        presenter.bind({ seriesId, seriesMode, episodes });
        TestBed.flushEffects();
    });

    function select(
        target: XtreamSerieEpisode = episode,
        actionId: string = SAVED_VOD_ADD_MENU_ITEM.id
    ): void {
        presenter.select({ episode: target, actionId });
    }

    it.each(['series', 'vod-series'] as const)(
        'saves raw provider season coordinates for %s catalog origin',
        (mode) => {
            seriesMode.set(mode);
            episodes.set({ '5': [{ ...episode }] });
            TestBed.flushEffects();
            const current = episodes()['5'][0];
            expect(presenter.sections(current)).toEqual([
                { items: [SAVED_VOD_ADD_MENU_ITEM] },
            ]);
            select(current);
            expect(open).toHaveBeenCalledWith([
                {
                    title: 'Episode Four',
                    reference: {
                        provider: 'stalker',
                        sourceId: 'stalker-1',
                        kind: 'episode',
                        seriesId: 'parent:raw',
                        seriesMode: mode,
                        seasonId: 'season:provider:raw',
                        seasonNumber: 5,
                        episodeNumber: 4,
                    },
                },
            ]);
        }
    );

    it('hides and rejects a missing locally owned source', () => {
        playlist.set(null);
        TestBed.flushEffects();
        expect(presenter.sections(episode)).toEqual([]);
        expect(owner()).toBe('');
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it('retains zero as an opaque Stalker provider coordinate', () => {
        seriesId.set(0);
        const current = { ...episode, providerSeasonId: '0' };
        episodes.set({ '5': [current] });
        TestBed.flushEffects();
        expect(presenter.sections(current)).toEqual([
            { items: [SAVED_VOD_ADD_MENU_ITEM] },
        ]);
        select(current);
        expect(open.mock.calls[0][0][0].reference).toEqual(
            expect.objectContaining({ seriesId: '0', seasonId: '0' })
        );
    });

    it.each([
        { providerSeasonId: undefined },
        { providerSeasonId: '' },
        { season: -1 },
        { episode_num: 0 },
        { title: '' },
    ])('hides invalid provider episode coordinates %s', (override) => {
        Object.assign(episode, override);
        expect(presenter.sections(episode)).toEqual([]);
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it('rejects an old episode object instead of resolving it by its synthetic ID', () => {
        const stale = { ...episode };
        expect(presenter.sections(stale)).toEqual([]);
        select(stale);
        expect(open).not.toHaveBeenCalled();
    });

    it('does not claim old episodes when only the selected series identity changes', () => {
        seriesId.set('another:parent');
        TestBed.flushEffects();
        expect(presenter.sections(episode)).toEqual([]);
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it('does not relabel cached metadata when only the source changes', () => {
        playlist.set({ _id: 'stalker-2' });
        TestBed.flushEffects();
        expect(presenter.sections(episode)).toEqual([]);
        select();
        expect(open).not.toHaveBeenCalled();
        const fresh = { ...episode };
        episodes.set({ '5': [fresh] });
        TestBed.flushEffects();
        select(fresh);
        expect(open.mock.calls[0][0][0].reference.sourceId).toBe('stalker-2');
    });

    it('ignores unsupported menu commands', () => {
        select(episode, 'play');
        expect(open).not.toHaveBeenCalled();
    });
});
