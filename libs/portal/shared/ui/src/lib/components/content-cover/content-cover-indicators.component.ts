import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import {
    normalizeContentCoverIndicators,
    type ContentCoverIndicators,
    type ContentCoverRatingSource,
} from '@iptvnator/portal/shared/util';
import {
    ProgressCapsuleComponent,
    WatchedBadgeComponent,
} from '@iptvnator/ui/components';

const RATING_LABELS: Record<ContentCoverRatingSource, string> = {
    'provider-imdb': 'COVER.RATING_IMDB',
    provider: 'COVER.RATING_PROVIDER',
    tmdb: 'COVER.RATING_TMDB',
    kinopoisk: 'COVER.RATING_KINOPOISK',
};

/** Passive, shared artwork indicators. Loading/membership decisions belong to owners. */
@Component({
    selector: 'app-content-cover-indicators',
    imports: [
        MatIcon,
        MatTooltip,
        TranslatePipe,
        ProgressCapsuleComponent,
        WatchedBadgeComponent,
    ],
    template: `
        <span [id]="descriptionId()" hidden>
            @if (state().favorite) {
                {{ 'COVER.FAVORITE' | translate }}.
            }
            @if (
                state().watchState === 'watched' ||
                state().watchState === 'in-progress'
            ) {
                {{ watchLabel() | translate }}.
            }
            @if (state().rating; as rating) {
                {{ ratingLabel() | translate }}:
                {{ rating.value.toFixed(1) }}/10.
            }
            @if (state().progress; as progress) {
                @if (state().watchState !== 'watched') {
                    {{
                        (state().progressScope === 'episode'
                            ? 'COVER.EPISODE_PROGRESS'
                            : 'COVER.PROGRESS'
                        ) | translate
                    }}: {{ progress }}%.
                }
            }
        </span>
        <div class="indicator-stack">
            @if (state().rating; as rating) {
                <span
                    class="rating"
                    role="img"
                    data-test-id="content-cover-rating"
                    [attr.data-rating-source]="rating.source"
                    [attr.aria-label]="
                        (ratingLabel() | translate) +
                        ': ' +
                        rating.value.toFixed(1) +
                        '/10'
                    "
                    [matTooltip]="ratingLabel() | translate"
                >
                    <mat-icon>star</mat-icon
                    ><span>{{ rating.value.toFixed(1) }}</span>
                </span>
            }
            @if (
                (showFavorite() && state().favorite) ||
                state().watchState === 'watched' ||
                state().watchState === 'in-progress'
            ) {
                <div class="status-row">
                    @if (showFavorite() && state().favorite) {
                        <span
                            class="favorite"
                            role="img"
                            data-test-id="content-cover-favorite"
                            [attr.aria-label]="'COVER.FAVORITE' | translate"
                            [matTooltip]="'COVER.FAVORITE' | translate"
                        >
                            <mat-icon>favorite</mat-icon>
                        </span>
                    }
                    @if (
                        state().watchState === 'watched' ||
                        state().watchState === 'in-progress'
                    ) {
                        <span
                            data-test-id="content-cover-watch"
                            [attr.data-watch-state]="state().watchState"
                            [matTooltip]="watchLabel() | translate"
                        >
                            <app-watched-badge
                                [isWatched]="true"
                                [inline]="true"
                                [icon]="
                                    state().watchState === 'watched'
                                        ? 'check_circle'
                                        : 'remove_red_eye'
                                "
                                [label]="watchLabel() | translate"
                            />
                        </span>
                    }
                </div>
            }
        </div>
        @if (state().progress; as progress) {
            @if (state().watchState !== 'watched') {
                <span
                    role="progressbar"
                    data-test-id="content-cover-progress"
                    [attr.aria-label]="
                        (state().progressScope === 'episode'
                            ? 'COVER.EPISODE_PROGRESS'
                            : 'COVER.PROGRESS'
                        ) | translate
                    "
                    [attr.aria-valuenow]="progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                >
                    <app-progress-capsule
                        [progress]="progress"
                        [watched]="false"
                    />
                </span>
            }
        }
    `,
    styleUrl: './content-cover-indicators.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentCoverIndicatorsComponent {
    readonly descriptionId = input<string | null>(null);
    readonly indicators = input<ContentCoverIndicators | null>(null);
    /** Omit the passive heart when the sibling actions expose its direct toggle. */
    readonly showFavorite = input(true);
    protected readonly state = computed(() =>
        normalizeContentCoverIndicators(this.indicators())
    );
    protected readonly ratingLabel = computed(() => {
        const rating = this.state().rating;
        return rating ? RATING_LABELS[rating.source] : '';
    });
    protected readonly watchLabel = computed(() =>
        this.state().watchState === 'watched'
            ? 'PORTALS.DETAIL.WATCHED'
            : 'COVER.STARTED'
    );
}
