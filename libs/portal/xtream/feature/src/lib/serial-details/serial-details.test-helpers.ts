import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import type { SeasonEpisodeDownloadAdapter } from '@iptvnator/portal/shared/data-access';
import type {
    SeasonContainerEpisodeMenuSelection,
    SeasonEpisodeMenuSections,
} from '@iptvnator/ui/components';

@Component({
    selector: 'app-season-container',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
    template: '<div data-testid="season-container"></div>',
})
export class StubSeasonContainerComponent {
    readonly seasons = input<unknown>(null);
    readonly seriesId = input<number | string | null>(null);
    readonly playlistId = input('');
    readonly seriesTitle = input<string | undefined>(undefined);
    readonly playbackPositions = input<unknown>(null);
    readonly downloadAdapter = input<SeasonEpisodeDownloadAdapter | null>(null);
    readonly downloadsEnabled = input(true);
    readonly openingEpisodeId = input<number | null>(null);
    readonly activeEpisodeId = input<number | null>(null);
    readonly playingEpisodeId = input<number | null>(null);
    readonly seasonDescriptions = input<unknown>(null);
    readonly seasonPosters = input<unknown>(null);
    readonly seasonWatchBatchRunning = input(false);
    readonly episodeMenuSections = input<SeasonEpisodeMenuSections | null>(
        null
    );
    readonly episodeMenuSelected =
        output<SeasonContainerEpisodeMenuSelection>();
    readonly episodeClicked = output<unknown>();
    readonly playbackToggleRequested = output<unknown>();
    readonly seasonPlaybackToggleRequested = output<unknown>();
}
