import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import { VodMoreMenuComponent } from '../detail-ui/vod-more-menu.component';
import type { VodMoreMenuSection } from '../detail-ui/vod-more-menu.model';

export interface SeasonContainerEpisodeMenuSelection {
    readonly episode: XtreamSerieEpisode;
    readonly actionId: string;
}

export type SeasonEpisodeMenuSections = (
    episode: XtreamSerieEpisode
) => readonly VodMoreMenuSection[];

/** Presentation only: the provider host owns eligibility and the selected command. */
@Component({
    selector: 'app-season-episode-menu',
    imports: [TranslatePipe, VodMoreMenuComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(click)': '$event.stopPropagation()', style: 'display: contents' },
    template: `
        @if (hasRows()) {
            <app-vod-more-menu
                [sections]="sections()"
                [label]="'PORTALS.DETAIL.MORE_ACTIONS' | translate"
                [testId]="'episode-more-menu-' + episode().id"
                (selected)="select($event)"
            />
        }
    `,
})
export class SeasonEpisodeMenuComponent {
    readonly episode = input.required<XtreamSerieEpisode>();
    readonly menuSections = input<SeasonEpisodeMenuSections | null>(null);
    readonly selected = output<SeasonContainerEpisodeMenuSelection>();
    readonly sections = computed(
        () => this.menuSections()?.(this.episode()) ?? []
    );
    readonly hasRows = computed(() =>
        this.sections().some((section) => section.items.length > 0)
    );

    select(actionId: string): void {
        // Re-evaluate eligibility: a provider refresh may have invalidated an open row.
        const current = this.menuSections()?.(this.episode()) ?? [];
        if (
            current.some((section) =>
                section.items.some(
                    (item) => item.id === actionId && !item.disabled
                )
            )
        ) {
            this.selected.emit({ episode: this.episode(), actionId });
        }
    }
}
