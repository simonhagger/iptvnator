import {
    Injectable,
    computed,
    effect,
    inject,
    signal,
    untracked,
    type Signal,
} from '@angular/core';
import type { Params } from '@angular/router';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import { createSavedVodXtreamEpisodeCandidate } from '@iptvnator/portal/shared/util';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import {
    SAVED_VOD_ADD_MENU_ITEM,
    type SeasonContainerEpisodeMenuSelection,
    type SeasonEpisodeMenuSections,
} from '@iptvnator/ui/components';
import type { XtreamSerieDetailsView } from './serial-details-playback.service';

interface Bindings {
    readonly item: Signal<XtreamSerieDetailsView | null>;
    readonly route: Signal<Params>;
}

/** The page owns metadata; shared episode controls emit presentation actions only. */
@Injectable()
export class SerialDetailsSavedEpisodePresenter {
    private readonly store = inject(XtreamStore);
    private readonly launcher = inject(SavedVodAddDialogLauncherService);
    private readonly bindings = signal<Bindings | null>(null);
    private readonly loadedOwner = signal('');
    private readonly owner = computed(() => {
        const bindings = this.bindings();
        const sourceId = this.store.currentPlaylist()?.id;
        const seriesId = bindings?.item()?.series_id;
        return sourceId &&
            seriesId &&
            String(seriesId) === String(bindings?.route()['serialId'])
            ? JSON.stringify([sourceId, seriesId])
            : '';
    });

    constructor() {
        this.launcher.bindOwner(this.owner);
        // A source change cannot reuse another source's still-visible metadata.
        effect(() => {
            const item = this.bindings()?.item();
            untracked(() =>
                this.loadedOwner.set(
                    item
                        ? JSON.stringify([
                              this.store.currentPlaylist()?.id,
                              item.series_id,
                          ])
                        : ''
                )
            );
        });
    }

    bind(
        item: Signal<XtreamSerieDetailsView | null>,
        route: Signal<Params>
    ): void {
        this.bindings.set({ item, route });
    }

    private candidate(episode: XtreamSerieEpisode) {
        const item = this.bindings()?.item();
        if (
            !this.owner() ||
            this.owner() !== this.loadedOwner() ||
            !Object.values(item?.episodes ?? {}).some((episodes) =>
                episodes.includes(episode)
            )
        )
            return null;
        return createSavedVodXtreamEpisodeCandidate({
            sourceId: this.store.currentPlaylist()?.id,
            seriesId: item?.series_id,
            episode,
        });
    }

    readonly sections: SeasonEpisodeMenuSections = (episode) =>
        this.candidate(episode) ? [{ items: [SAVED_VOD_ADD_MENU_ITEM] }] : [];

    select({ episode, actionId }: SeasonContainerEpisodeMenuSelection): void {
        if (actionId !== SAVED_VOD_ADD_MENU_ITEM.id) return;
        const candidate = this.candidate(episode);
        if (candidate) this.launcher.open([candidate]);
    }
}
