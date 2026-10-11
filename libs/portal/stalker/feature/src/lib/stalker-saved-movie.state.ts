import {
    computed,
    effect,
    signal,
    untracked,
    type Signal,
} from '@angular/core';
import { SavedVodAddDialogLauncherService } from '@iptvnator/portal/shared/ui';
import { createSavedVodMovieCandidate } from '@iptvnator/portal/shared/util';
import {
    normalizeVodDetails,
    type VodDetailsItem,
} from '@iptvnator/shared/interfaces';

/** Catalog, search and collection movie details share the same saved identity. */
export function createStalkerSavedMovieState(
    item: Signal<VodDetailsItem | null>,
    eligible: () => boolean,
    launcher: SavedVodAddDialogLauncherService,
    sourceId: () => string | null | undefined,
    /** Catalog wrappers rebuild when the source changes; track their raw metadata separately. */
    metadataOwner?: Signal<unknown>
) {
    const loadedSource = signal(sourceId());
    if (metadataOwner) {
        effect(() => {
            const metadata = metadataOwner();
            untracked(() => loadedSource.set(metadata ? sourceId() : null));
        });
    }
    const candidate = computed(() => {
        const current = item();
        const source = sourceId();
        return eligible() &&
            source &&
            (!metadataOwner || source === loadedSource()) &&
            current?.type === 'stalker' &&
            current.playlistId === source
            ? createSavedVodMovieCandidate({
                  provider: 'stalker',
                  sourceId: source,
                  contentId: current.data.id,
                  title: normalizeVodDetails(current).title,
              })
            : null;
    });
    launcher.bindOwner(
        computed(() => {
            const reference = candidate()?.reference;
            return reference ? JSON.stringify(reference) : '';
        })
    );
    return {
        available: computed(() => candidate() !== null),
        add(requested: VodDetailsItem): void {
            const draft = candidate();
            // A stale menu event cannot add the previous detail under a new owner.
            if (draft && requested === item()) launcher.open([draft]);
        },
    };
}
