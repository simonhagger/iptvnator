import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import {
    resolveContentCoverFavoriteAction,
    type ContentCoverAction,
} from '@iptvnator/portal/shared/util';

/** Keep this a sibling of the cover's link/button, never an interactive descendant. */
@Component({
    selector: 'app-content-cover-actions',
    imports: [MatIconButton, MatIcon, MatMenuModule, MatTooltip, TranslatePipe],
    template: `
        @if (favoriteAction(); as action) {
            @let label =
                action.labelKey ? (action.labelKey | translate) : action.label;
            <button
                type="button"
                mat-icon-button
                data-test-id="content-cover-favorite-toggle"
                [attr.data-action-id]="action.id"
                [attr.aria-label]="label ? label + ': ' + title() : title()"
                [attr.aria-pressed]="action.favoriteState"
                [matTooltip]="label ?? ''"
                [disabled]="action.disabled"
                (click)="select(action)"
            >
                <mat-icon
                    [attr.data-test-id]="
                        action.favoriteState ? 'content-cover-favorite' : null
                    "
                    >{{
                        action.favoriteState ? 'favorite' : 'favorite_border'
                    }}</mat-icon
                >
            </button>
        }
        @if (menuActions().length) {
            <button
                type="button"
                mat-icon-button
                [matMenuTriggerFor]="menu"
                [attr.aria-label]="
                    'COVER.MORE_ACTIONS' | translate: { title: title() }
                "
                [attr.data-test-id]="testId() ?? 'content-cover-actions'"
            >
                <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu">
                @for (action of menuActions(); track action.id) {
                    @if (action.separatorBefore) {
                        <div class="separator" role="separator"></div>
                    }
                    <button
                        mat-menu-item
                        type="button"
                        [disabled]="action.disabled"
                        [class.app-destructive-button]="action.destructive"
                        [attr.data-test-id]="
                            'content-cover-action-' + action.id
                        "
                        (click)="select(action)"
                    >
                        <mat-icon>{{ action.icon }}</mat-icon>
                        <span>{{
                            action.labelKey
                                ? (action.labelKey | translate)
                                : action.label
                        }}</span>
                    </button>
                }
            </mat-menu>
        }
    `,
    styleUrl: './content-cover-actions.component.scss',
    host: {
        '(click)': '$event.stopPropagation()',
        '(keydown)': 'isolateActivation($event)',
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentCoverActionsComponent {
    readonly title = input.required<string>();
    readonly actions = input<readonly ContentCoverAction[]>([]);
    readonly testId = input<string | null>(null);
    readonly actionSelected = output<ContentCoverAction>();
    protected readonly favoriteAction = computed(() =>
        resolveContentCoverFavoriteAction(this.actions())
    );
    protected readonly menuActions = computed(() =>
        this.actions().filter((action) => action !== this.favoriteAction())
    );

    protected isolateActivation(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
        }
    }

    protected select(action: ContentCoverAction): void {
        if (!action.disabled) this.actionSelected.emit(action);
    }
}
