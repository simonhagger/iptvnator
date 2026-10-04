import {
    Injectable,
    computed,
    effect,
    inject,
    signal,
    untracked,
    type Signal,
} from '@angular/core';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import { createSavedVodStalkerEpisodeCandidate } from '@iptvnator/portal/shared/util';
import {
    StalkerStore,
    type StalkerMappedEpisode,
} from '@iptvnator/portal/stalker/data-access';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import {
    SAVED_VOD_ADD_MENU_ITEM,
    type SeasonContainerEpisodeMenuSelection,
    type SeasonEpisodeMenuSections,
} from '@iptvnator/ui/components';

interface Bindings {
    readonly seriesId: Signal<unknown>;
    readonly seriesMode: Signal<'series' | 'vod-series'>;
    readonly episodes: Signal<Record<string, XtreamSerieEpisode[]>>;
}

/** Saves provider coordinates rather than Stalker's synthetic history ID or command. */
@Injectable()
export class StalkerSeriesSavedEpisodePresenter {
    private readonly store = inject(StalkerStore);
    private readonly launcher = inject(SavedVodAddDialogLauncherService);
    private readonly bindings = signal<Bindings | null>(null);
    private readonly loadedOwner = signal('');
    private readonly owner = computed(() => this.ownerKey());

    private ownerKey(): string {
        const bindings = this.bindings();
        const sourceId = this.store.currentPlaylist()?._id;
        const seriesId = bindings?.seriesId();
        return sourceId &&
            seriesId !== null &&
            seriesId !== undefined &&
            String(seriesId).trim()
            ? JSON.stringify([sourceId, seriesId, bindings?.seriesMode()])
            : '';
    }

    constructor() {
        this.launcher.bindOwner(this.owner);
        effect(() => {
            const bindings = this.bindings();
            bindings?.episodes();
            untracked(() => this.loadedOwner.set(this.ownerKey()));
        });
    }

    bind(bindings: Bindings): void {
        this.bindings.set(bindings);
    }

    private candidate(episode: XtreamSerieEpisode) {
        const bindings = this.bindings();
        if (
            !bindings ||
            !this.owner() ||
            this.owner() !== this.loadedOwner() ||
            !Object.values(bindings.episodes()).some((episodes) =>
                episodes.includes(episode)
            )
        )
            return null;
        return createSavedVodStalkerEpisodeCandidate({
            sourceId: this.store.currentPlaylist()?._id,
            seriesId: bindings.seriesId(),
            seriesMode: bindings.seriesMode(),
            seasonId: (episode as StalkerMappedEpisode).providerSeasonId,
            seasonNumber: episode.season,
            episodeNumber: episode.episode_num,
            title: episode.title,
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
