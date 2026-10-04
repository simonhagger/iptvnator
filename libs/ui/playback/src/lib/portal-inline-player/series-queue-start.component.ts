import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import type { FullscreenPanelEpisodeLike } from '../fullscreen-episode-panel/fullscreen-episode-panel.util';
import { buildUpNextRailItems, type UpNextRailItem } from './up-next-rail.util';

export interface SeriesQueueStartRequest {
    episode: UpNextRailItem;
    ids: readonly number[];
}

/** Browse-state entry point; the active player owns the editable queue. */
@Component({
    selector: 'app-series-queue-start',
    imports: [
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        TranslateModule,
    ],
    template: `@if (items().length) {
        <div class="series-start" data-testid="series-queue-start">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{
                    'PORTALS.SELECT_EPISODE' | translate
                }}</mat-label>
                <mat-select
                    [value]="selectedId()"
                    (selectionChange)="selected.set($event.value)"
                >
                    @for (item of items(); track item.id) {
                        <mat-option [value]="item.id"
                            >{{ item.label }} {{ item.title }}</mat-option
                        >
                    }
                </mat-select>
            </mat-form-field>
            <button mat-stroked-button type="button" (click)="start(true)">
                {{ 'PORTALS.PLAY_SEASON' | translate }}
            </button>
            <button mat-stroked-button type="button" (click)="start(false)">
                {{ 'PORTALS.PLAY_FROM_HERE' | translate }}
            </button>
        </div>
    }`,
    styles: [
        `
            .series-start {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 12px;
                margin: 16px 0;
            }
            mat-form-field {
                flex: 1;
                min-width: 200px;
            }
            button {
                app-region: no-drag;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesQueueStartComponent {
    readonly seasons = input<Record<
        string,
        readonly FullscreenPanelEpisodeLike[]
    > | null>(null);
    readonly requested = output<SeriesQueueStartRequest>();
    readonly selected = signal<number | null>(null);
    readonly items = computed(() => {
        const seasons = this.seasons();
        const first = Object.values(seasons ?? {}).find(
            (episodes) => episodes.length
        )?.[0];
        return buildUpNextRailItems({
            episodesBySeason: seasons,
            currentEpisodeId: first?.id,
            includeBeforeCurrent: true,
            limit: Number.MAX_SAFE_INTEGER,
        });
    });
    readonly selectedId = computed(() =>
        this.items().some((item) => item.id === this.selected())
            ? this.selected()
            : (this.items()[0]?.id ?? null)
    );

    start(seasonOnly: boolean): void {
        const selected = this.items().find(
            (item) => item.id === this.selectedId()
        );
        if (!selected) return;
        const items = seasonOnly
            ? this.items().filter(
                  (item) => item.seasonNumber === selected.seasonNumber
              )
            : this.items();
        const episode = seasonOnly ? items[0] : selected;
        this.requested.emit({
            episode,
            ids: items
                .slice(items.findIndex((item) => item.id === episode.id))
                .map((item) => item.id),
        });
    }
}
