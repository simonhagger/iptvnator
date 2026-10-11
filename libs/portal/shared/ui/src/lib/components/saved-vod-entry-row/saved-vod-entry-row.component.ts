import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { SavedVodEntry } from '@iptvnator/shared/interfaces';

export interface SavedVodEntryRowLabels {
    readonly movie: string;
    readonly episode: string;
    readonly moveUp: string;
    readonly moveDown: string;
    readonly remove: string;
}

/** Presentation only: the owner resolves sources, persists edits and restores focus. */
@Component({
    selector: 'app-saved-vod-entry-row',
    imports: [MatButtonModule, MatIconModule, MatTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        role: 'listitem',
        '[attr.data-entry-id]': 'entry().id',
    },
    template: `
        @let reference = entry().reference;
        <span class="ordinal" aria-hidden="true">{{ index() + 1 }}</span>
        <mat-icon aria-hidden="true">{{
            reference.kind === 'movie' ? 'movie' : 'tv'
        }}</mat-icon>
        <div class="description">
            <span class="title">{{ entry().title }}</span>
            <span class="metadata">
                {{
                    reference.kind === 'movie'
                        ? labels().movie
                        : labels().episode
                }}
                @if (reference.kind === 'episode') {
                    <span
                        >S{{ reference.seasonNumber }} · E{{
                            reference.episodeNumber
                        }}</span
                    >
                }
                <span>· {{ sourceName() }}</span>
            </span>
        </div>
        <div class="actions">
            <button
                type="button"
                mat-icon-button
                data-test-id="saved-vod-entry-up"
                [disabled]="disabled() || index() <= 0"
                [matTooltip]="labels().moveUp"
                [attr.aria-label]="labels().moveUp + ': ' + entry().title"
                (click)="move(-1)"
            >
                <mat-icon>arrow_upward</mat-icon>
            </button>
            <button
                type="button"
                mat-icon-button
                data-test-id="saved-vod-entry-down"
                [disabled]="disabled() || index() >= count() - 1"
                [matTooltip]="labels().moveDown"
                [attr.aria-label]="labels().moveDown + ': ' + entry().title"
                (click)="move(1)"
            >
                <mat-icon>arrow_downward</mat-icon>
            </button>
            <button
                type="button"
                mat-icon-button
                data-test-id="saved-vod-entry-remove"
                [disabled]="disabled()"
                [matTooltip]="labels().remove"
                [attr.aria-label]="labels().remove + ': ' + entry().title"
                (click)="remove()"
            >
                <mat-icon>playlist_remove</mat-icon>
            </button>
        </div>
    `,
    styleUrl: './saved-vod-entry-row.component.scss',
})
export class SavedVodEntryRowComponent {
    readonly entry = input.required<SavedVodEntry>();
    readonly index = input.required<number>();
    readonly count = input.required<number>();
    readonly sourceName = input.required<string>();
    readonly labels = input.required<SavedVodEntryRowLabels>();
    readonly disabled = input(false);
    readonly moveRequested = output<{ entryId: string; targetIndex: number }>();
    readonly removeRequested = output<string>();

    move(offset: -1 | 1): void {
        const targetIndex = this.index() + offset;
        if (this.disabled() || targetIndex < 0 || targetIndex >= this.count())
            return;
        this.moveRequested.emit({ entryId: this.entry().id, targetIndex });
    }

    remove(): void {
        if (!this.disabled()) this.removeRequested.emit(this.entry().id);
    }
}
