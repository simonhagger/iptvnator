import { signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Params } from '@angular/router';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import { SAVED_VOD_ADD_MENU_ITEM } from '@iptvnator/ui/components';
import { SerialDetailsSavedEpisodePresenter } from './serial-details-saved-episode.presenter';
import type { XtreamSerieDetailsView } from './serial-details-playback.service';

describe('SerialDetails saved episode presentation', () => {
    const playlist = signal<{ id: string } | null>({ id: 'xtream-1' });
    const item = signal<XtreamSerieDetailsView | null>(null);
    const route = signal<Params>({ serialId: '103' });
    const open = jest.fn();
    let owner: Signal<string>;
    let presenter: SerialDetailsSavedEpisodePresenter;
    let episode: XtreamSerieEpisode;

    beforeEach(() => {
        playlist.set({ id: 'xtream-1' });
        route.set({ serialId: '103' });
        open.mockClear();
        episode = {
            id: '1001',
            season: 0,
            episode_num: 1,
            title: ' Pilot ',
            direct_source: 'https://stream.example/private',
            container_extension: 'mp4',
            info: {},
            custom_sid: '',
            added: '',
        };
        item.set({
            series_id: 103,
            seasons: [],
            info: {
                name: 'Show',
                cover: '',
                plot: '',
                cast: '',
                director: '',
                genre: '',
                releaseDate: '',
                last_modified: '',
                rating: '',
                rating_5based: 0,
                backdrop_path: [],
                youtube_trailer: '',
                episode_run_time: '',
                category_id: '',
            },
            episodes: { '0': [episode] },
        });
        TestBed.configureTestingModule({
            providers: [
                SerialDetailsSavedEpisodePresenter,
                {
                    provide: XtreamStore,
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
        presenter = TestBed.inject(SerialDetailsSavedEpisodePresenter);
        presenter.bind(item, route);
        TestBed.flushEffects();
    });

    function select(
        target = episode,
        actionId: string = SAVED_VOD_ADD_MENU_ITEM.id
    ): void {
        presenter.select({ episode: target, actionId });
    }

    it('saves only the current source, provider episode coordinates and display title', () => {
        expect(presenter.sections(episode)).toEqual([
            { items: [SAVED_VOD_ADD_MENU_ITEM] },
        ]);
        select();
        expect(open).toHaveBeenCalledWith([
            {
                title: ' Pilot ',
                reference: {
                    provider: 'xtream',
                    sourceId: 'xtream-1',
                    kind: 'episode',
                    seriesId: '103',
                    contentId: '1001',
                    seasonNumber: 0,
                    episodeNumber: 1,
                },
            },
        ]);
    });

    it('hides and rejects a missing locally owned source', () => {
        playlist.set(null);
        TestBed.flushEffects();
        expect(presenter.sections(episode)).toEqual([]);
        expect(owner()).toBe('');
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it.each([
        { id: '' },
        { id: 'https://invalid.example/episode' },
        { season: -1 },
        { episode_num: 0 },
        { title: '' },
    ])('hides invalid episode metadata %s', (override) => {
        Object.assign(episode, override);
        expect(presenter.sections(episode)).toEqual([]);
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it('rejects a stale object even when its provider ID matches', () => {
        const stale = { ...episode };
        expect(presenter.sections(stale)).toEqual([]);
        select(stale);
        expect(open).not.toHaveBeenCalled();
    });

    it('rejects metadata from the previous route before the next response arrives', () => {
        route.set({ serialId: '104' });
        expect(presenter.sections(episode)).toEqual([]);
        expect(owner()).toBe('');
        select();
        expect(open).not.toHaveBeenCalled();
    });

    it('does not relabel cached episodes after a source change', () => {
        playlist.set({ id: 'xtream-2' });
        TestBed.flushEffects();
        expect(presenter.sections(episode)).toEqual([]);
        select();
        expect(open).not.toHaveBeenCalled();
        const fresh = { ...episode };
        const current = item();
        if (!current) throw new Error('Expected current series metadata');
        item.set({ ...current, episodes: { '0': [fresh] } });
        TestBed.flushEffects();
        select(fresh);
        expect(open.mock.calls[0][0][0].reference.sourceId).toBe('xtream-2');
    });

    it('ignores unsupported menu commands', () => {
        select(episode, 'play');
        expect(open).not.toHaveBeenCalled();
    });
});
